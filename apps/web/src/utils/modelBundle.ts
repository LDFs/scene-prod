import { zipSync, type Zippable } from 'fflate'
import {
  parseMtllibNames,
  parseMtlTextureRefs,
  collectGltfExternalRefs,
  isExternalGltfUri,
  normalizeGltfUri,
  stripGltfImages,
} from '@scene-prod/shared'

/**
 * .gltf 和 .obj 都是"多文件资产"：
 *   - .gltf 用 JSON 里的相对 uri 引用 .bin 和贴图
 *   - .obj 用 `mtllib` 引用 .mtl，.mtl 再用 `map_*` 引用贴图（两级）
 *
 * 只上传主文件等于上传了一份索引，服务端读取时必然因找不到依赖而失败（.gltf），
 * 或者静默丢掉材质（.obj）。
 *
 * 依赖缺失的严重程度分两档，两种格式是一致的：
 *   - 几何数据（.gltf 的 buffers / .obj 本身）缺了，模型就是空的 → 必须拦截；
 *   - 贴图、材质缺了，模型还是能用的，只是没纹理 → 只提示。
 *     .obj 靠 obj2gltf 自己回落默认材质；.gltf 没有这个回落，所以由
 *     scanGltfDependencies 把缺失贴图的引用从材质上摘掉，人工制造出同样的效果。
 *
 * 这里做三件事：
 *   1. scanGltfDependencies / scanObjDependencies —— 扫出声明的外部依赖，
 *      并在用户本次选中的文件里为它们找对应项，得出 resolved / missing / ambiguous。
 *   2. packBundle —— 打成 zip。服务端已有 zip 解压分支，解压后目录结构完整。
 *   3. 依赖在 zip 内**按其"声明路径"落位**，内容取自实际匹配到的文件。
 *      这一点很关键：它顺带修掉了大小写不一致的问题——真实样本里
 *      `Simple Wheel Rig with Hydraulics 2.obj` 声明的是
 *      `mtllib simple wheel rig with hydraulics 2.mtl`（全小写）。我们按声明的
 *      名字写进 zip，obj2gltf 就一定找得到，不需要它也做大小写不敏感匹配
 *      （它并不做）。
 */

/** 依赖在 zip 内的落位，以及它对应的本地文件 */
export interface ResolvedDependency {
  /** 声明里的原始引用（已 decode / 统一分隔符） */
  uri: string
  /** 在 zip 内的路径。通常等于 uri；uri 含 ".." 时会被改写 */
  zipPath: string
  file: File
}

export interface BundleDependencyReport {
  /** 主文件（.gltf / .obj） */
  mainFile: File
  /** 声明的全部外部依赖 uri */
  required: string[]
  /** 已在本次选择中找到的依赖 */
  resolved: ResolvedDependency[]
  /**
   * 没找到的依赖 uri。这里如实记录全部缺失项，**不代表不能上传**——
   * 是拦截还是提示按依赖种类决定，见各自 report 的 gltf / obj 字段。
   */
  missing: string[]
  /** 找到多个同名候选、无法确定用哪个的依赖 uri。严重程度同 missing */
  ambiguous: string[]
  /**
   * uri 含 ".." 需要改写时，这里是改写后的主文件文本；否则为 null。
   * 打包时优先用它，避免 zip 路径逃出根目录。
   */
  patchedMainText: string | null
  /** 需要改写内容的依赖（目前只有含 ".." 引用的 .mtl）：zipPath → 新文本 */
  patchedDependencies: Map<string, string>
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

/** 解析 "a/b/../c" 这类路径，把 ".." 折叠掉。用于在所选文件里查找候选 */
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
 * 解析 zip 内的落位路径，**逃出根目录时返回 null**。
 *
 * 和 resolvePath 的区别就在这个 null：`../tex/a.png` 在根目录下被 resolvePath
 * 折叠成 `tex/a.png`，看着没问题，实际上是悄悄改变了引用目标。zip 路径必须留在
 * 根目录内，所以这种情况要显式识别出来、改写成扁平名。
 */
function resolveInZip(baseDir: string, relative: string): string | null {
  const segments = (baseDir + relative).split('/')
  const stack: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else {
      stack.push(segment)
    }
  }
  return stack.length > 0 ? stack.join('/') : null
}

/**
 * 候选文件索引。
 *
 * 匹配分两种模式：
 *   - 目录模式（<input webkitdirectory>，有 webkitRelativePath）：按完整相对
 *     路径精确匹配，最可靠。
 *   - 扁平模式（普通多选）：只能按文件名匹配，要求唯一命中；多个同名候选记为
 *     ambiguous，交给调用方提示用户改用目录选择。
 *
 * 两种模式都带大小写不敏感回退（精确优先）——建模软件导出的声明与实际文件名
 * 大小写不一致非常常见。
 */
interface CandidateIndex {
  byPath: Map<string, File>
  byPathLower: Map<string, File[]>
  byName: Map<string, File[]>
  byNameLower: Map<string, File[]>
}

function pushTo(map: Map<string, File[]>, key: string, file: File) {
  const list = map.get(key)
  if (list) list.push(file)
  else map.set(key, [file])
}

/**
 * 获取所有文件(除了模型文件)的索引列表
 * @param candidates 文件夹或多选的所有文件
 * @param exclude 不包括模型文件
 * @returns 除了模型文件外的 其余文件的索引列表
 */
function createCandidateIndex(candidates: File[], exclude: Set<File>): CandidateIndex {
  const index: CandidateIndex = {
    byPath: new Map(),
    byPathLower: new Map(),
    byName: new Map(),
    byNameLower: new Map(),
  }

  for (const candidate of candidates) {
    if (exclude.has(candidate)) continue

    const relPath = relativePathOf(candidate)
    if (relPath) {
      index.byPath.set(relPath, candidate)
      pushTo(index.byPathLower, relPath.toLowerCase(), candidate)
    }
    pushTo(index.byName, candidate.name, candidate)
    pushTo(index.byNameLower, candidate.name.toLowerCase(), candidate)
  }

  return index
}

type MatchResult = { file: File } | { ambiguous: true } | null

/**
 * 在候选里找一个 uri 对应的文件。
 * 顺序：完整路径精确 → 完整路径忽略大小写 → 文件名精确 → 文件名忽略大小写。
 */
function matchCandidate(index: CandidateIndex, baseDir: string, uri: string): MatchResult {
  const fullPath = resolvePath(baseDir, uri)

  const exactPath = index.byPath.get(fullPath)
  if (exactPath) return { file: exactPath }

  const loosePath = index.byPathLower.get(fullPath.toLowerCase())
  if (loosePath) {
    if (loosePath.length > 1) return { ambiguous: true }
    return { file: loosePath[0] }
  }

  const name = basename(uri)
  const exactName = index.byName.get(name)
  if (exactName) {
    if (exactName.length > 1) return { ambiguous: true }
    return { file: exactName[0] }
  }

  const looseName = index.byNameLower.get(name.toLowerCase())
  if (looseName) {
    if (looseName.length > 1) return { ambiguous: true }
    return { file: looseName[0] }
  }

  return null
}

/**
 * 把一条声明里的路径替换成安全路径。
 *
 * 只在 uri 含 ".." 时用到（zip 路径不能逃出根目录）。按字面量替换——from 就是
 * 从这段文本里解析出来的，所以一定能命中；这样也不必重建 .mtl 的选项 flag。
 */
function rewriteDeclaration(text: string, from: string, to: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.includes(from) ? line.replace(from, to) : line))
    .join('\n')
}

/** 逃出根目录的引用改写到这里，扁平存放 */
const EXTERNAL_DIR = '_external'

/**
 * obj2gltf 只认**小写** `.mtl` 扩展名的 mtllib 声明：
 * getMtlPaths 里是 `path.extname(token) !== ".mtl"` 的大小写敏感比较，不等就
 * 直接 continue。所以 `mtllib CUBE.MTL` 会被整条跳过——材质静默全丢，
 * 产物只剩一个同名的空材质，且**没有任何报错**。
 *
 * 打包时把扩展名规范成小写，并同步改写 .obj 里的声明。
 */
function needsMtlExtensionFix(uri: string): boolean {
  return /\.mtl$/i.test(uri) && !/\.mtl$/.test(uri)
}

function toLowerMtlExtension(uri: string): string {
  return uri.replace(/\.mtl$/i, '.mtl')
}

/** "materials/" → "../"，用于从某个子目录回指到 zip 根 */
function upToRoot(dirInZip: string): string {
  const depth = dirInZip.split('/').filter(Boolean).length
  return '../'.repeat(depth)
}

/* ------------------------------------------------------------------ */
/* .gltf                                                              */
/* ------------------------------------------------------------------ */

/** scanGltfDependencies 的额外产出：把缺失的依赖按"缺了还能不能用"分开 */
export interface GltfBundleExtras {
  /** 没找到的几何数据（buffers 的 .bin）。缺了模型是空的 */
  missingBuffers: string[]
  /** 匹配到多个同名候选、无法确定用哪个的几何数据 */
  ambiguousBuffers: string[]
  /** 没找到的贴图。引用已从 JSON 里摘除，模型仍可用 */
  missingImages: string[]
  /** 匹配到多个同名候选的贴图。同样已摘除引用 */
  ambiguousImages: string[]
}

export interface GltfDependencyReport extends BundleDependencyReport {
  gltf: GltfBundleExtras
}

/**
 * .gltf 能否上传：只看几何数据。
 * 贴图缺失在扫描时已被摘成"没填这个槽位"，产物是个无纹理但可用的模型，不阻断。
 */
export function isGltfUploadable(report: GltfDependencyReport): boolean {
  return report.gltf.missingBuffers.length === 0 && report.gltf.ambiguousBuffers.length === 0
}

/**
 * 扫描 .gltf 的外部依赖（buffers 的几何数据 + images 的贴图）。
 *
 * 缺失的贴图在这里就地降级掉：摘除材质引用 + 换成占位图（stripGltfImages），
 * 并记进 gltf.missingImages / ambiguousImages 供调用方提示。所以返回的 report 里，
 * 贴图那部分虽然也进了 missing/ambiguous，却**不影响能否上传**。
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

  const refs = collectGltfExternalRefs(json)
  const required = refs.map((ref) => ref.uri)

  const baseDir = dirOf(relativePathOf(gltfFile))
  const index = createCandidateIndex(candidates, new Set([gltfFile]))

  const resolved: ResolvedDependency[] = []
  const missing: string[] = []
  const ambiguous: string[] = []
  const rewrites = new Map<string, string>()
  const deadImages = new Set<number>()
  const extras: GltfBundleExtras = {
    missingBuffers: [],
    ambiguousBuffers: [],
    missingImages: [],
    ambiguousImages: [],
  }

  refs.forEach((ref, i) => {
    const match = matchCandidate(index, baseDir, ref.uri)

    if (match === null || 'ambiguous' in match) {
      // 找不到和"多个同名候选、选不出来"对模型的后果是一样的：这条依赖用不上。
      // 区别只在给用户的建议不同，所以分开记
      const notFound = match === null
      ;(notFound ? missing : ambiguous).push(ref.uri)

      // 几何数据缺了拦截，贴图缺了降级——分流就发生在这里
      if (ref.kind === 'buffer') {
        ;(notFound ? extras.missingBuffers : extras.ambiguousBuffers).push(ref.uri)
      } else {
        ;(notFound ? extras.missingImages : extras.ambiguousImages).push(ref.uri)
        ref.imageIndices.forEach((imageIndex) => deadImages.add(imageIndex))
      }
      return
    }

    // .gltf 位于 zip 根，所以依赖的落位就按 uri 自身解析
    let zipPath = resolveInZip('', ref.uri)
    if (zipPath === null) {
      zipPath = `${EXTERNAL_DIR}/${i}_${basename(ref.uri)}`
      rewrites.set(ref.uri, zipPath)
    }
    resolved.push({ uri: ref.uri, zipPath, file: match.file })
  })

  // 缺失的贴图：摘掉材质引用并换成占位图，让打出来的包是自洽的
  stripGltfImages(json, deadImages)

  // ".." 引用改写落位。占位图是 data:，isExternalGltfUri 会把它排除在外
  if (rewrites.size > 0) {
    for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      if (!isExternalGltfUri(entry?.uri)) continue
      const replacement = rewrites.get(normalizeGltfUri(entry.uri))
      if (replacement) entry.uri = replacement
    }
  }

  // 只有真的改过才写回文本，避免给正常模型引入多余差异
  const patchedMainText = rewrites.size > 0 || deadImages.size > 0 ? JSON.stringify(json) : null

  return {
    mainFile: gltfFile,
    required,
    resolved,
    missing,
    ambiguous,
    patchedMainText,
    patchedDependencies: new Map(),
    gltf: extras,
  }
}

/* ------------------------------------------------------------------ */
/* .obj                                                              */
/* ------------------------------------------------------------------ */

/** scanObjDependencies 的额外产出，供调用方做提示和缩略图 */
export interface ObjBundleExtras {
  /** mtllib 声明的材质库（不管找到没找到） */
  declaredMtls: string[]
  /** 已找到的 .mtl 文件，顺序与 declaredMtls 一致 */
  mtlFiles: File[]
  /** 已找到的贴图文件 */
  textureFiles: File[]
  /** 找不到的 .mtl */
  missingMtls: string[]
  /** 找不到的贴图，形如 "material.mtl → tex.png" */
  missingTextures: string[]
  /** 扩展名被规范成小写 .mtl 的声明（否则 obj2gltf 会整条跳过，材质静默丢失） */
  normalizedMtls: string[]
}

export interface ObjDependencyReport extends BundleDependencyReport {
  obj: ObjBundleExtras
}

/**
 * 扫描 .obj 的依赖：`mtllib` → .mtl，再从每个 .mtl 的 `map_*` → 贴图。
 *
 * 与 .gltf 的关键差别在**严重程度**：.obj 缺 .mtl 或贴图时 obj2gltf 会回落到
 * 默认材质，产物仍是个能用的模型，所以 missing 不代表"不能上传"，只代表
 * "要提醒用户"。调用方据此决定是提示还是拦截，这里只负责如实报告。
 */
export async function scanObjDependencies(objFile: File, candidates: File[]): Promise<ObjDependencyReport> {
  const objText = await objFile.text()
  const declaredMtls = parseMtllibNames(objText)

  const objDir = dirOf(relativePathOf(objFile))
  const index = createCandidateIndex(candidates, new Set([objFile]))

  const required: string[] = [...declaredMtls]
  const resolved: ResolvedDependency[] = []
  const missing: string[] = []
  const ambiguous: string[] = []
  const mainRewrites = new Map<string, string>()
  const patchedDependencies = new Map<string, string>()

  const extras: ObjBundleExtras = {
    declaredMtls,
    mtlFiles: [],
    textureFiles: [],
    missingMtls: [],
    missingTextures: [],
    normalizedMtls: [],
  }

  let rewriteSeq = 0

  for (const mtlUri of declaredMtls) {
    const match = matchCandidate(index, objDir, mtlUri)
    if (match === null) {
      missing.push(mtlUri)
      extras.missingMtls.push(mtlUri)
      continue
    }
    if ('ambiguous' in match) {
      ambiguous.push(mtlUri)
      continue
    }

    const mtlFile = match.file
    extras.mtlFiles.push(mtlFile)

    // .obj 位于 zip 根，.mtl 按 mtllib 声明的路径落位
    let mtlZipPath = resolveInZip('', mtlUri)
    if (mtlZipPath === null) {
      mtlZipPath = `${EXTERNAL_DIR}/${rewriteSeq++}_${basename(mtlUri)}`
      mainRewrites.set(mtlUri, mtlZipPath)
    } else if (needsMtlExtensionFix(mtlZipPath)) {
      // 扩展名不是小写 .mtl 时 obj2gltf 会整条跳过，材质全丢且不报错
      mtlZipPath = toLowerMtlExtension(mtlZipPath)
      mainRewrites.set(mtlUri, mtlZipPath)
      extras.normalizedMtls.push(mtlUri)
    }
    resolved.push({ uri: mtlUri, zipPath: mtlZipPath, file: mtlFile })

    // 第二级：这个 .mtl 引用的贴图。
    // 贴图路径相对 .mtl 所在目录（与 obj2gltf 的 normalizeTexturePath 一致），
    // 所以 zip 内也要相对 .mtl 的落位来算
    const mtlText = await mtlFile.text()
    const mtlDirInSelection = dirOf(relativePathOf(mtlFile) || mtlUri)
    const mtlDirInZip = dirOf(mtlZipPath)
    let patchedMtlText: string | null = null

    for (const textureUri of parseMtlTextureRefs(mtlText)) {
      required.push(textureUri)

      const textureMatch = matchCandidate(index, mtlDirInSelection, textureUri)
      if (textureMatch === null) {
        missing.push(textureUri)
        extras.missingTextures.push(`${mtlUri} → ${textureUri}`)
        continue
      }
      if ('ambiguous' in textureMatch) {
        ambiguous.push(textureUri)
        continue
      }

      extras.textureFiles.push(textureMatch.file)

      // 贴图落位基于 .mtl 在 zip 内的目录（obj2gltf 也是相对 .mtl 解析贴图路径），
      // 这样 .mtl 里的相对引用解压后原样成立，不必改写文本
      let zipPath = resolveInZip(mtlDirInZip, textureUri)

      if (zipPath === null) {
        // 引用逃出了 zip 根，只能扁平存放并改写 .mtl 里的这条声明
        zipPath = `${EXTERNAL_DIR}/${rewriteSeq++}_${basename(textureUri)}`
        patchedMtlText = rewriteDeclaration(
          patchedMtlText ?? mtlText,
          textureUri,
          upToRoot(mtlDirInZip) + zipPath,
        )
      }

      resolved.push({ uri: textureUri, zipPath, file: textureMatch.file })
    }

    if (patchedMtlText !== null) {
      patchedDependencies.set(mtlZipPath, patchedMtlText)
    }
  }

  // 只有真的需要改写时才动 .obj 文本
  let patchedMainText: string | null = null
  for (const [from, to] of mainRewrites) {
    patchedMainText = rewriteDeclaration(patchedMainText ?? objText, from, to)
  }

  return {
    mainFile: objFile,
    required: Array.from(new Set(required)),
    resolved,
    missing,
    ambiguous,
    patchedMainText,
    patchedDependencies,
    obj: extras,
  }
}

/* ------------------------------------------------------------------ */
/* 打包                                                               */
/* ------------------------------------------------------------------ */

/**
 * 把主文件及其依赖打成 zip。
 *
 * 主文件位于 zip 根目录，依赖按其**声明路径**落位，因此解压后相对引用原样成立，
 * 且声明与实际文件名的大小写差异被一并抹平（见文件头注释）。
 */
export async function packBundle(report: BundleDependencyReport): Promise<File> {
  const entries: Zippable = {}
  const encoder = new TextEncoder()
  const mainFile = report.mainFile

  const mainText = report.patchedMainText
  entries[mainFile.name] = mainText !== null ? encoder.encode(mainText) : new Uint8Array(await mainFile.arrayBuffer())

  await Promise.all(
    report.resolved.map(async ({ zipPath, file }) => {
      const patched = report.patchedDependencies.get(zipPath)
      entries[zipPath] = patched !== undefined ? encoder.encode(patched) : new Uint8Array(await file.arrayBuffer())
    }),
  )

  // level 0：贴图和 Draco 前的几何数据压缩收益很低，不值得卡住主线程
  const zipped = zipSync(entries, { level: 0 })
  const zipName = mainFile.name.replace(/\.(gltf|obj)$/i, '') + '.zip'
  return new File([zipped as BlobPart], zipName, { type: 'application/zip' })
}
