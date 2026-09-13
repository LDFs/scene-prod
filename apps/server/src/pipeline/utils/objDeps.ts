import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { parseMtllibNames, parseMtlTextureRefs, normalizeObjPath } from '@scene-prod/shared'

/**
 * OBJ 的依赖完整性检查，与 gltfDeps 对应但**结论的严重程度不同**：
 *
 *   - .gltf 缺 .bin/贴图 → 模型根本不可用，直接判失败（见 gltfDeps）
 *   - .obj 缺 .mtl/贴图 → obj2gltf 会回落到默认材质，产物是个能用的无材质模型，
 *     所以只记警告、继续转换。为此判失败反而更糟。
 *
 * 路径解析规则对齐 obj2gltf：mtllib 相对 **OBJ 所在目录**，贴图相对
 * **MTL 所在目录**（见 loadMtl.js 的 normalizeTexturePath）。
 */

export interface ObjDependencyReport {
  /** mtllib 声明的材质库（原始声明值） */
  declaredMtls: string[]
  /** 找不到对应文件的材质库 */
  missingMtls: string[]
  /** 找不到的贴图，形如 "material.mtl → tex.png" */
  missingTextures: string[]
  /**
   * obj2gltf 解析不了的贴图声明。
   * 它的 normalizeTexturePath 在检测到选项 flag 时直接 `split(/\s+/).pop()`，
   * 注释里写明"Assumes no spaces in texture name"——所以"带 flag 且文件名含空格"
   * 的声明会被截断成末尾片段，贴图静默丢失。这种情况磁盘上文件其实在，
   * 光查存在性发现不了，必须单独报出来。
   */
  unresolvableTextures: string[]
}

/** 目录内 "小写文件名 → 真实文件名" 索引，用于大小写不敏感回退 */
const dirIndexCache = new Map<string, Map<string, string>>()

function indexOf(dir: string): Map<string, string> {
  const cached = dirIndexCache.get(dir)
  if (cached) return cached

  const index = new Map<string, string>()
  try {
    for (const entry of fs.readdirSync(dir)) {
      index.set(entry.toLowerCase(), entry)
    }
  } catch {
    // 目录不存在时留空索引，后续一律记为缺失
  }
  dirIndexCache.set(dir, index)
  return index
}

/**
 * 在 baseDir 下解析一个相对引用，先精确、再大小写不敏感回退。
 *
 * 回退是必需的：真实样本里 `Simple Wheel Rig with Hydraulics 2.obj` 声明的是
 * `mtllib simple wheel rig with hydraulics 2.mtl`（全小写）。macOS/Windows 的
 * 大小写不敏感文件系统上侥幸能过，Linux 生产环境上会直接失配。
 *
 * @returns 解析到的绝对路径；找不到返回 null
 */
export function resolveRelaxed(baseDir: string, relative: string): string | null {
  const normalized = normalizeObjPath(relative)
  const exact = path.resolve(baseDir, normalized)
  if (fs.existsSync(exact)) return exact

  // 逐段做大小写不敏感匹配，这样 "Textures/Wood.PNG" 这类带子目录的也能兜住
  const segments = normalized.split('/').filter((s) => s !== '' && s !== '.')
  let current = path.resolve(baseDir)

  for (const segment of segments) {
    if (segment === '..') {
      current = path.dirname(current)
      continue
    }
    const actual = indexOf(current).get(segment.toLowerCase())
    if (!actual) return null
    current = path.join(current, actual)
  }

  return fs.existsSync(current) ? current : null
}

/** 只取出 mtllib 行，避免把整个 OBJ（可能几十 MB）读进内存 */
async function readMtllibLines(objPath: string): Promise<string> {
  const input = fs.createReadStream(objPath)
  const lines: string[] = []
  try {
    const reader = readline.createInterface({ input, crlfDelay: Infinity })
    for await (const line of reader) {
      if (/^\s*mtllib\s/i.test(line)) lines.push(line)
    }
  } finally {
    input.destroy()
  }
  return lines.join('\n')
}

/**
 * obj2gltf 会不会把这条贴图声明解析错。
 * 条件：同时出现选项 flag 和空格分隔的文件名。
 */
function isUnresolvableByObj2gltf(mtlText: string, textureRef: string): boolean {
  if (!textureRef.includes(' ')) return false

  const flagPattern = /-(bm|t|s|o|blendu|blendv|boost|mm|texres|clamp|imfchan|type)\b/
  return mtlText
    .split(/\r?\n/)
    .some((line) => line.includes(textureRef) && flagPattern.test(line))
}

export async function inspectObjDeps(objPath: string): Promise<ObjDependencyReport> {
  const report: ObjDependencyReport = {
    declaredMtls: [],
    missingMtls: [],
    missingTextures: [],
    unresolvableTextures: [],
  }

  if (path.extname(objPath).toLowerCase() !== '.obj') return report

  const objDir = path.dirname(path.resolve(objPath))
  report.declaredMtls = parseMtllibNames(await readMtllibLines(objPath))

  for (const mtlRef of report.declaredMtls) {
    const mtlPath = resolveRelaxed(objDir, mtlRef)
    if (!mtlPath) {
      report.missingMtls.push(mtlRef)
      continue
    }

    let mtlText: string
    try {
      mtlText = fs.readFileSync(mtlPath, 'utf-8')
    } catch {
      report.missingMtls.push(mtlRef)
      continue
    }

    const mtlDir = path.dirname(mtlPath)
    for (const textureRef of parseMtlTextureRefs(mtlText)) {
      if (isUnresolvableByObj2gltf(mtlText, textureRef)) {
        report.unresolvableTextures.push(`${mtlRef} → ${textureRef}`)
        continue
      }
      if (!resolveRelaxed(mtlDir, textureRef)) {
        report.missingTextures.push(`${mtlRef} → ${textureRef}`)
      }
    }
  }

  return report
}

/** 把检查结果转成面向用户的警告文案；没有问题时返回空数组 */
export function describeObjDepIssues(report: ObjDependencyReport): string[] {
  const warnings: string[] = []

  if (report.missingMtls.length > 0) {
    warnings.push(
      `模型声明的材质库缺失（${report.missingMtls.join('、')}），已使用默认材质。` +
        `请把 .mtl 与 .obj 一起上传`,
    )
  }
  if (report.missingTextures.length > 0) {
    warnings.push(`材质引用的 ${report.missingTextures.length} 个贴图缺失：${report.missingTextures.join('；')}`)
  }
  if (report.unresolvableTextures.length > 0) {
    warnings.push(
      `以下贴图的文件名含空格且带选项参数，转换器无法解析，材质会缺这部分贴图：` +
        `${report.unresolvableTextures.join('；')}。建议把贴图文件名里的空格去掉后重新导出`,
    )
  }

  return warnings
}
