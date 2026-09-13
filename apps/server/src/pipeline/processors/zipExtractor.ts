import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs'
import { ProcessAssetType } from '../type'

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']
const MAX_NESTED_DEPTH = 3 // 最大嵌套 ZIP 深度

/**
 * 递归解压目录中的所有嵌套 ZIP 文件
 * @param {string} dirPath - 目录路径
 * @param {number} depth - 剩余递归深度
 */
function extractNestedZips(dirPath: string, depth = MAX_NESTED_DEPTH) {
  if (depth <= 0) {
    console.warn('[ZipExtractor] 达到最大嵌套深度，停止解压')
    return
  }

  const files = fs.readdirSync(dirPath)

  for (const file of files) {
    const fullPath = path.join(dirPath, file)

    // 跳过不存在的文件（可能已被删除）
    if (!fs.existsSync(fullPath)) {
      continue
    }

    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      // 递归处理子目录
      extractNestedZips(fullPath, depth)
    } else if (path.extname(file).toLowerCase() === '.zip') {
      console.log(`[ZipExtractor] 发现嵌套 ZIP: ${file} (深度: ${MAX_NESTED_DEPTH - depth + 1})`)

      try {
        const nestedZip = new AdmZip(fullPath)
        const nestedOutputDir = path.join(path.dirname(fullPath), path.basename(file, '.zip'))

        fs.mkdirSync(nestedOutputDir, { recursive: true })
        nestedZip.extractAllTo(nestedOutputDir, true)

        console.log(`[ZipExtractor] 嵌套 ZIP 解压完成: ${file} -> ${nestedOutputDir}`)

        // 删除已解压的 ZIP
        fs.unlinkSync(fullPath)

        // 递归处理新解压的目录
        extractNestedZips(nestedOutputDir, depth - 1)
      } catch (err: any) {
        console.warn(`[ZipExtractor] 解压嵌套 ZIP 失败: ${file}`, err.message)
      }
    }
  }
}

/**
 * 解压 ZIP 并查找模型文件
 * @param {Object} context - 处理上下文
 * @returns {string} 解压后的主模型文件路径
 */
async function extractZip(context: ProcessAssetType) {
  const { inputPath, assetId } = context
  const ext = path.extname(inputPath).toLowerCase()

  if (ext !== '.zip') {
    return inputPath
  }

  console.log(`[ZipExtractor] 开始解压: ${inputPath}`)

  const outputDir = path.join('uploads/temp', assetId)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  try {
    // 顶层解压
    const zip = new AdmZip(inputPath)
    zip.extractAllTo(outputDir, true)

    // 递归解压嵌套 ZIP
    extractNestedZips(outputDir, MAX_NESTED_DEPTH)

    // 查找模型文件
    const files = getAllFiles(outputDir)
    const { chosen, ignored } = findMainModel(files)

    if (!chosen) {
      throw new Error('ZIP 包中未找到支持的模型文件 (.gltf, .glb, .obj, .fbx, .stl)')
    }

    console.log(`[ZipExtractor] 找到主模型: ${chosen}`)

    // 一个资产只对应一个模型，多出来的必须明确告知——此前是静默丢弃，
    // 用户既不知道少了东西，也不知道用的到底是哪一个
    if (ignored.length > 0) {
      const label = (p: string) => path.relative(outputDir, p).replace(/\\/g, '/')
      console.warn(`[ZipExtractor] 压缩包内有 ${ignored.length + 1} 个模型，已忽略: ${ignored.map(label).join(', ')}`)
      context.warnings.push(
        `压缩包内发现 ${ignored.length + 1} 个模型，已使用「${label(chosen)}」，` +
          `忽略「${ignored.map(label).join('」「')}」。如需分别导入请拆分压缩包`,
      )
    }

    // 记录临时目录以便后续清理
    context.tempDir = outputDir

    return chosen
  } catch (error: any) {
    console.error('[ZipExtractor] 解压失败:', error.message)
    throw error
  }
}

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dirPath: string, arrayOfFiles: Array<string> = []) {
  const files = fs.readdirSync(dirPath)
  arrayOfFiles = arrayOfFiles || []

  files.forEach(function (file) {
    const fullPath = path.join(dirPath, file)
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles)
    } else {
      arrayOfFiles.push(fullPath)
    }
  })

  return arrayOfFiles
}

/** 取文件大小，读不到时当 0，不要让排序因为一个坏文件整体抛错 */
function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size
  } catch {
    return 0
  }
}

/**
 * 查找主模型文件。
 *
 * 排序规则必须是**确定性**的：此前只按扩展名优先级排，同扩展名之间的先后完全
 * 取决于 readdirSync 的返回顺序，于是"两个 obj 选哪个"是随机的——真实案例里就
 * 因此选中了坏的那个、丢掉了能正常转换的那个。
 *
 * 规则：扩展名优先级 → 文件体积降序 → 路径升序
 *   - 扩展名优先：gltf/glb 无需转换，最可靠
 *   - 体积降序：同一模型的多种格式导出里，大的那个通常细节更全
 *     （样本：25.9MB/131k 顶点带 UV 优于 7MB/69k 顶点无 UV）
 *   - 路径升序：兜底，保证完全可复现
 *
 * @returns chosen 为选中的模型，ignored 为同包内其余模型（需要告知用户）
 */
function findMainModel(files: string[]): { chosen: string | null; ignored: string[] } {
  // 过滤出支持的文件
  const candidates = files.filter((file) => {
    const ext = path.extname(file).toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(ext) && !file.includes('__MACOSX')
  })

  if (candidates.length === 0) return { chosen: null, ignored: [] }

  candidates.sort((a, b) => {
    const extA = path.extname(a).toLowerCase()
    const extB = path.extname(b).toLowerCase()
    const byExt = SUPPORTED_EXTENSIONS.indexOf(extA) - SUPPORTED_EXTENSIONS.indexOf(extB)
    if (byExt !== 0) return byExt

    const bySize = sizeOf(b) - sizeOf(a)
    if (bySize !== 0) return bySize

    return a.localeCompare(b)
  })

  return { chosen: candidates[0], ignored: candidates.slice(1) }
}

export { extractZip }
