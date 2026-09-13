/**
 * glTF JSON 的依赖解析，以及"缺贴图时降级"的处理。
 *
 * .gltf 是多文件资产：`buffers` 用相对 uri 指向 .bin（几何/动画数据），`images`
 * 指向贴图。两者缺失的后果差别很大：
 *   - 缺 .bin → 没有几何，产物是个空模型，只能判失败；
 *   - 缺贴图 → 只是没纹理，模型本身完全可用。
 *
 * 但 glTF 没有"贴图加载不到就算了"的回落（obj2gltf 对 .mtl 有），uri 悬空会让
 * gltf-transform 的 io.read 直接 ENOENT。所以缺贴图得人工降级：把材质上的引用
 * 摘掉（等同于该槽位从来没填过贴图），再给 images 条目换上占位图让文件自洽。
 *
 * 这里只做纯 JSON 处理、不碰文件系统，因此服务端（流水线前置检查）和前端
 * （多选打包）能共用同一套实现，避免两侧判断出现分歧。和 objFormat 同理。
 */

/** glTF 里一条指向外部文件的引用 */
export interface GltfExternalRef {
  /** 已 decode、统一分隔符的 uri */
  uri: string
  /** buffer = 几何/动画数据，缺了模型是空的；image = 贴图，缺了只是没纹理 */
  kind: 'buffer' | 'image'
  /**
   * kind 为 image 时，该 uri 在 `images` 数组里的下标。
   * 同一张贴图可能被多个 image 条目引用，所以是数组。
   */
  imageIndices: number[]
}

/** data: / http(s): / blob: 开头的 uri 是自包含或远程的，不需要随包提供 */
export function isExternalGltfUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0) return false
  return !/^(data:|https?:|blob:|\/\/)/i.test(uri)
}

/** 统一分隔符、去掉开头的 "./"，便于比较 */
export function normalizeGltfUri(uri: string): string {
  let decoded = uri
  try {
    decoded = decodeURIComponent(uri)
  } catch {
    // uri 里有非法转义时保留原样，后面按字面量匹配
  }
  return decoded.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * 取出 glTF JSON 中指向外部文件的引用，按 uri 归并后返回。
 *
 * 归并是必要的：同一个 .bin 常被多个 buffer 引用，同一张贴图也可能被多个 image
 * 条目引用，查找/判存在只需做一次。uri 同时被 buffer 和 image 引用时按 buffer
 * 算——从严，缺了要拦截。
 */
export function collectGltfExternalRefs(gltfJson: any): GltfExternalRef[] {
  const buffers: any[] = Array.isArray(gltfJson?.buffers) ? gltfJson.buffers : []
  const images: any[] = Array.isArray(gltfJson?.images) ? gltfJson.images : []
  const refs = new Map<string, GltfExternalRef>()

  for (const buffer of buffers) {
    if (!isExternalGltfUri(buffer?.uri)) continue
    const uri = normalizeGltfUri(buffer.uri)
    const existing = refs.get(uri)
    if (existing) existing.kind = 'buffer'
    else refs.set(uri, { uri, kind: 'buffer', imageIndices: [] })
  }

  images.forEach((image, imageIndex) => {
    if (!isExternalGltfUri(image?.uri)) return
    const uri = normalizeGltfUri(image.uri)
    const existing = refs.get(uri)
    if (existing) existing.imageIndices.push(imageIndex)
    else refs.set(uri, { uri, kind: 'image', imageIndices: [imageIndex] })
  })

  return Array.from(refs.values())
}

/**
 * 1x1 全透明 PNG。
 *
 * 摘掉材质引用后，那些 images 条目就没人用了，但**不能直接删**——删一个，后面
 * 所有下标都要跟着重排，textures[].source 极易对错。留着条目、把 uri 换成这张
 * 占位图，glTF 就是自洽的：不再有悬空 uri，gltf-transform 的 io.read 也不会
 * ENOENT。反正没人引用，流水线里 optimizeSceneGraph 的 prune() 会顺手把它连同
 * texture 条目一起清掉。
 */
export const GLTF_PLACEHOLDER_IMAGE_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII='

/** 取一个 texture 的全部图源：核心的 source，以及各扩展（KHR_texture_basisu / EXT_texture_webp）自带的 source */
function textureSources(texture: any): number[] {
  const sources: number[] = []
  if (typeof texture?.source === 'number') sources.push(texture.source)
  for (const ext of Object.values(texture?.extensions ?? {})) {
    const source = (ext as any)?.source
    if (typeof source === 'number') sources.push(source)
  }
  return sources
}

/**
 * 找出图源**全部**缺失、已经废掉的 texture，顺手摘掉其余 texture 上指向缺失图
 * 的那条图源。
 *
 * 只缺一部分的不算废：一张贴图可能同时有 KTX2 版本和 PNG 回退，缺了其中一个，
 * 把指向它的图源摘掉，texture 本身还能用。
 *
 * @param deadImages 缺失贴图在 images 数组里的下标
 */
function collectDeadTextures(gltfJson: any, deadImages: Set<number>): Set<number> {
  const dead = new Set<number>()
  const textures: any[] = Array.isArray(gltfJson?.textures) ? gltfJson.textures : []

  textures.forEach((texture, index) => {
    const sources = textureSources(texture)
    if (sources.length === 0) return

    if (sources.every((source) => deadImages.has(source))) {
      dead.add(index)
      return
    }

    // 还有可用图源 → 只摘掉指向缺失图的那条，texture 保留
    for (const [name, ext] of Object.entries(texture.extensions ?? {})) {
      const source = (ext as any)?.source
      if (typeof source === 'number' && deadImages.has(source)) delete texture.extensions[name]
    }
    if (typeof texture.source === 'number' && deadImages.has(texture.source)) delete texture.source
  })

  return dead
}

/**
 * 把材质上指向这些 texture 的引用摘掉，等同于该槽位从来没填过贴图——渲染时回落
 * 到各自的默认值（baseColorFactor / 无法线 / 不自发光）。这正是 obj2gltf 缺 .mtl
 * 时做的事，只是 glTF 这边没人替我们做，得自己来。
 *
 * 为什么用递归而不是逐个列举槽位：glTF 里引用贴图的一律是 textureInfo，即形如
 * `{ index, texCoord? }` 的对象，且只出现在 material 子树内。逐个枚举意味着要把
 * baseColorTexture / metallicRoughnessTexture / normalTexture / occlusionTexture /
 * emissiveTexture 以及 KHR_materials_* 各扩展的槽位名全写一遍，漏一个就留下一条
 * 悬空引用；认 `index` 这个形状则一次覆盖全部，包括日后新增的扩展。
 */
function unhookDeadTextures(node: any, deadTextures: Set<number>): void {
  if (node === null || typeof node !== 'object') return

  if (Array.isArray(node)) {
    node.forEach((item) => unhookDeadTextures(item, deadTextures))
    return
  }

  // Object.entries 取的是快照，循环里 delete 自身的键是安全的
  for (const [key, value] of Object.entries(node)) {
    if (value === null || typeof value !== 'object') continue
    if (!Array.isArray(value) && typeof (value as any).index === 'number' && deadTextures.has((value as any).index)) {
      delete node[key]
      continue
    }
    unhookDeadTextures(value, deadTextures)
  }
}

/**
 * 就地把这些贴图从 glTF 里降级掉：摘除材质引用 + 换成占位图。
 *
 * 调用后 JSON 不再引用这些贴图，也不再有指向它们的悬空 uri，可以安全地当作一个
 * 「无贴图但可用」的模型继续走后续流程。
 *
 * @param imageIndices 缺失贴图在 `images` 数组里的下标
 */
export function stripGltfImages(gltfJson: any, imageIndices: Iterable<number>): void {
  const deadImages = new Set(imageIndices)
  if (deadImages.size === 0) return

  const images: any[] = Array.isArray(gltfJson?.images) ? gltfJson.images : []

  const deadTextures = collectDeadTextures(gltfJson, deadImages)
  if (deadTextures.size > 0) unhookDeadTextures(gltfJson?.materials, deadTextures)

  for (const imageIndex of deadImages) {
    const image = images[imageIndex]
    if (!image) continue
    image.uri = GLTF_PLACEHOLDER_IMAGE_URI
    image.mimeType = 'image/png'
  }
}
