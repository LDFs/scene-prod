import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { repairObjVertexLine, parseMtllibNames } from '@scene-prod/shared'
import { resolveRelaxed } from './objDeps'

/**
 * 转换前把 OBJ 处理成 obj2gltf 能正确吃下的样子。修两类**静默失败**：
 *
 * 1. **非有限顶点值**（`vt nan ...`）。obj2gltf 的 vt 正则匹配不到 `nan`，这些行
 *    既不算 UV 也不算顶点，被直接丢弃 → globalUvs 少了条目 → 其后所有 UV 索引
 *    整体错位 → 最终在某个 face 上抛出 "UV index N is out of bounds"，报错点离
 *    真正的原因非常远。置零即可保住索引对齐。
 *
 * 2. **mtllib 扩展名不是小写 `.mtl`**。getMtlPaths 里是
 *    `path.extname(token) !== ".mtl"` 的大小写敏感比较，不等就整条 continue，
 *    于是 `mtllib CUBE.MTL` 的材质全丢、且**完全没有报错**，产物只剩一个空材质。
 *    这里把材质文件复制成小写扩展名，并改写声明。
 *
 * 两个实现约束：
 *   - **不就地改写**。直传 .obj 时 inputPath 指向用户的原始上传文件
 *     (uploads/models/)，改坏了就没有第二份。
 *   - 副本必须落在**与原文件同一目录**。obj2gltf 按 OBJ 所在目录解析 mtllib，
 *     换目录会导致材质全丢。
 *
 * 顶点扫描采用流式（样本 OBJ 有 26MB，不能无条件整份读进内存再拷一份），
 * 且只在确实需要时才写副本。
 */

const REPAIRED_SUFFIX = '.__repaired.obj'

export interface ObjRepairResult {
  /** 交给 obj2gltf 的输入路径：需要修复时是副本，否则就是原路径 */
  inputPath: string
  /** 转换结束后需要删除的临时文件 */
  cleanupPaths: string[]
  /** 被置零的非有限顶点行数 */
  fixedCount: number
  /** 扩展名被规范成小写 .mtl 的声明 */
  normalizedMtls: string[]
}

/** 逐行读取，行内容交给 callback */
async function forEachLine(filePath: string, onLine: (line: string) => void): Promise<void> {
  const input = fs.createReadStream(filePath)
  try {
    const reader = readline.createInterface({ input, crlfDelay: Infinity })
    for await (const line of reader) {
      onLine(line)
    }
  } finally {
    input.destroy()
  }
}

/** obj2gltf 只认小写 .mtl 扩展名 */
function needsMtlExtensionFix(uri: string): boolean {
  return /\.mtl$/i.test(uri) && !/\.mtl$/.test(uri)
}

/**
 * 把 mtllib 声明的扩展名规范成小写，并把材质文件复制一份到新名字下。
 *
 * @returns 声明替换表（原声明 → 新声明）与需要清理的复制文件
 */
function normalizeMtlExtensions(
  objPath: string,
  declaredMtls: string[],
): { rewrites: Map<string, string>; copies: string[]; normalized: string[] } {
  const rewrites = new Map<string, string>()
  const copies: string[] = []
  const normalized: string[] = []
  const objDir = path.dirname(objPath)

  for (const mtlRef of declaredMtls) {
    if (!needsMtlExtensionFix(mtlRef)) continue

    const actual = resolveRelaxed(objDir, mtlRef)
    if (!actual) continue // 文件本来就不在，交给依赖检查去报缺失

    const lowered = mtlRef.replace(/\.mtl$/i, '.mtl')
    const target = path.resolve(objDir, lowered)

    try {
      // 大小写不敏感的文件系统上 target 可能就是 actual 自己，此时无需复制
      if (path.resolve(actual) !== target) {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(actual, target)
        copies.push(target)
      }
      rewrites.set(mtlRef, lowered)
      normalized.push(mtlRef)
    } catch (error: any) {
      console.warn(`[ObjRepair] 规范化材质扩展名失败 (${mtlRef}): ${error.message}`)
    }
  }

  return { rewrites, copies, normalized }
}

export async function repairObjForConversion(objPath: string): Promise<ObjRepairResult> {
  // 第一遍：只数、只收集声明，不产生任何文件
  let nonFiniteCount = 0
  const mtllibLines: string[] = []
  await forEachLine(objPath, (line) => {
    if (repairObjVertexLine(line) !== null) nonFiniteCount++
    if (/^\s*mtllib\s/i.test(line)) mtllibLines.push(line)
  })

  const { rewrites, copies, normalized } = normalizeMtlExtensions(objPath, parseMtllibNames(mtllibLines.join('\n')))

  // 两类问题都没有 → 原样使用，不做任何拷贝
  if (nonFiniteCount === 0 && rewrites.size === 0) {
    return { inputPath: objPath, cleanupPaths: copies, fixedCount: 0, normalizedMtls: normalized }
  }

  const repairedPath = path.join(
    path.dirname(objPath),
    path.basename(objPath, path.extname(objPath)) + REPAIRED_SUFFIX,
  )

  const output = fs.createWriteStream(repairedPath)
  let fixedCount = 0

  try {
    await forEachLine(objPath, (line) => {
      const repaired = repairObjVertexLine(line)
      if (repaired !== null) fixedCount++
      let out = repaired ?? line

      if (rewrites.size > 0 && /^\s*mtllib\s/i.test(out)) {
        for (const [from, to] of rewrites) {
          if (out.includes(from)) out = out.replace(from, to)
        }
      }
      output.write(out + '\n')
    })

    await new Promise<void>((resolve, reject) => {
      output.end((error?: Error | null) => (error ? reject(error) : resolve()))
    })
  } catch (error) {
    output.destroy()
    // 半成品副本留在磁盘上只会干扰后续判断
    fs.rmSync(repairedPath, { force: true })
    copies.forEach((p) => fs.rmSync(p, { force: true }))
    throw error
  }

  if (fixedCount > 0) {
    console.log(`[ObjRepair] 已修复 ${fixedCount} 处非有限顶点值 -> ${repairedPath}`)
  }
  if (normalized.length > 0) {
    console.log(`[ObjRepair] 已规范材质扩展名: ${normalized.join('、')}`)
  }

  return {
    inputPath: repairedPath,
    cleanupPaths: [repairedPath, ...copies],
    fixedCount,
    normalizedMtls: normalized,
  }
}
