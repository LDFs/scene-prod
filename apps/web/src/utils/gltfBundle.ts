import { zipSync, type Zippable } from 'fflate'

/**
 * .gltf 是"多文件资产"：几何数据在 .bin 里，贴图在 .png/.jpg/.ktx2 里，
 * 靠 JSON 中的相对 uri 互相引用。只上传 .gltf 本体等于上传了一份索引，
 * 服务端读取时必然因找不到依赖而失败。
 *
 * 这里做两件事：
 *   1. scanGltfDependencies —— 扫出 .gltf 声明的外部依赖，并在用户本次选中的
 *      文件里为它们找对应项，得出 matched / missing / ambiguous。
 *   2. packGltfBundle —— 依赖齐全时打成 zip。服务端已有 zip 解压分支，
 *      解压后目录结构完整，相对 uri 就能正常解析。
 */

/** 依赖在 zip 内的落位，以及它对应的本地文件 */
export interface ResolvedDependency {
  /** .gltf 中声明的原始 uri（已 decode） */
  uri: string
  /** 在 zip 内的路径。通常等于 uri；uri 含 ".." 时会被改写 */
  zipPath: string
  file: File
}

export interface GltfDependencyReport {
  /** 该 .gltf 声明的全部外部依赖 uri */
  required: string[]
  /** 已在本次选择中找到的依赖 */
  resolved: ResolvedDependency[]
  /** 没找到的依赖 uri */
  missing: string[]
  /** 找到多个同名候选、无法确定用哪个的依赖 uri */
  ambiguous: string[]
  /**
   * uri 含 ".." 需要改写时，这里是改写后的 .gltf 文本；否则为 null。
   * 打包时优先用它，避免 zip 路径逃出根目录。
   */
  patchedGltfText: string | null
}

/** 依赖已齐全、可以打包 */
export function isBundleComplete(report: GltfDependencyReport): boolean {
  return report.missing.length === 0 && report.ambiguous.length === 0
}

/** data: / http(s): / blob: 开头的 uri 是自包含或远程的，不需要随包上传 */
function isExternalFileUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0) return false
  return !/^(data:|https?:|blob:|\/\/)/i.test(uri)
}

/** 统一分隔符、去掉开头的 "./"，便于比较 */
function normalizeUri(uri: string): string {
  let decoded = uri
  try {
    decoded = decodeURIComponent(uri)
  } catch {
    // uri 里有非法转义时保留原样，后面按字面量匹配
  }
  return decoded.replace(/\\/g, '/').replace(/^\.\//, '')
}

function basename(p: string): string {
  const normalized = p.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

/** 取文件在所选目录树中的路径；普通多选拿不到，返回空串 */
function relativePathOf(file: File): string {
  const raw = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return raw ? raw.replace(/\\/g, '/') : ''
}

/** "myModel/scene.gltf" → "myModel/"；无目录信息时返回空串 */
function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx + 1)
}

/** 解析 "a/b/../c" 这类路径，把 ".." 折叠掉 */
function resolvePath(base: string, relative: string): string {
  const segments = (base + relative).split('/')
  const stack: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') stack.pop()
    else stack.push(segment)
  }
  return stack.join('/')
}

/**
 * 扫描 .gltf 的外部依赖，并在候选文件中匹配。
 *
 * 匹配分两种模式：
 *   - 目录模式（<input webkitdirectory>，有 webkitRelativePath）：按完整相对
 *     路径精确匹配，最可靠。
 *   - 扁平模式（普通多选）：只能按文件名匹配，要求唯一命中；多个同名候选记为
 *     ambiguous，交给调用方提示用户改用目录选择。
 *
 * @throws 解析失败时抛出，说明这不是有效的 .gltf
 */
export async function scanGltfDependencies(gltfFile: File, candidates: File[]): Promise<GltfDependencyReport> {
  const text = await gltfFile.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch (error: any) {
    throw new Error(`${gltfFile.name} 不是有效的 glTF JSON: ${error?.message ?? error}`)
  }

  // buffers 存几何/动画数据，images 存贴图，两者的 uri 都可能指向外部文件
  const rawUris: string[] = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((entry: any) => entry?.uri)
    .filter(isExternalFileUri)

  // 同一个 .bin 可能被多个 buffer 引用，去重
  const required = Array.from(new Set(rawUris.map(normalizeUri)))

  const gltfDir = dirOf(relativePathOf(gltfFile))

  // 目录模式索引：相对路径 → 文件
  const byPath = new Map<string, File>()
  // 扁平模式索引：文件名 → 文件列表（用于判断是否唯一）
  const byName = new Map<string, File[]>()
  for (const candidate of candidates) {
    if (candidate === gltfFile) continue
    const relPath = relativePathOf(candidate)
    if (relPath) byPath.set(relPath, candidate)
    const name = candidate.name
    const list = byName.get(name)
    if (list) list.push(candidate)
    else byName.set(name, [candidate])
  }

  const resolved: ResolvedDependency[] = []
  const missing: string[] = []
  const ambiguous: string[] = []
  // uri 含 ".." 时不能直接当 zip 路径（会逃出根目录），改写成 _external/ 下的扁平名
  const rewrites = new Map<string, string>()

  required.forEach((uri, index) => {
    // 先试目录模式的精确路径匹配
    let file = byPath.get(resolvePath(gltfDir, uri))

    if (!file) {
      // 退回文件名匹配，仅在唯一命中时采用
      const sameName = byName.get(basename(uri))
      if (sameName && sameName.length > 1) {
        ambiguous.push(uri)
        return
      }
      file = sameName?.[0]
    }

    if (!file) {
      missing.push(uri)
      return
    }

    let zipPath = uri
    if (uri.split('/').includes('..')) {
      zipPath = `_external/${index}_${basename(uri)}`
      rewrites.set(uri, zipPath)
    }
    resolved.push({ uri, zipPath, file })
  })

  // 只有真的需要改写时才动 JSON，避免给正常模型引入多余差异
  let patchedGltfText: string | null = null
  if (rewrites.size > 0) {
    for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      if (!isExternalFileUri(entry?.uri)) continue
      const replacement = rewrites.get(normalizeUri(entry.uri))
      if (replacement) entry.uri = replacement
    }
    patchedGltfText = JSON.stringify(json)
  }

  return { required, resolved, missing, ambiguous, patchedGltfText }
}

/**
 * 把 .gltf 及其依赖打成 zip。
 *
 * zip 内 .gltf 位于根目录，依赖按其 uri 落位，因此解压后相对引用原样成立。
 * 调用前应先用 isBundleComplete 确认依赖齐全。
 */
export async function packGltfBundle(gltfFile: File, report: GltfDependencyReport): Promise<File> {
  const entries: Zippable = {}

  const gltfText = report.patchedGltfText ?? (await gltfFile.text())
  entries[gltfFile.name] = new TextEncoder().encode(gltfText)

  await Promise.all(
    report.resolved.map(async ({ zipPath, file }) => {
      entries[zipPath] = new Uint8Array(await file.arrayBuffer())
    }),
  )

  // level 0：贴图和 Draco 前的几何数据压缩收益很低，不值得卡住主线程
  const zipped = zipSync(entries, { level: 0 })
  const zipName = gltfFile.name.replace(/\.gltf$/i, '') + '.zip'
  return new File([zipped as BlobPart], zipName, { type: 'application/zip' })
}
