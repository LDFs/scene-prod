import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { ProcessAssetType } from '../type'

const execAsync = promisify(exec)

/**
 * 格式转换处理器
 * 将 OBJ/FBX/STL 转换为 GLB
 */
export async function formatConvert(context: ProcessAssetType) {
  const ext = path.extname(context.inputPath).toLowerCase()

  // glTF/GLB 无需转换
  if (['.gltf', '.glb'].includes(ext)) {
    console.log('[FormatConverter] 已是 glTF 格式，跳过转换')
    return context.inputPath
  }

  const baseName = path.basename(context.inputPath, ext)
  const outputDir = 'uploads/processed/models'
  // 相对路径用于数据库存储
  const relativeOutputPath = path.join(outputDir, `${context.assetId}_${baseName}.glb`)

  // 绝对路径用于命令执行
  const absoluteInputPath = path.resolve(context.inputPath)
  const absoluteOutputPath = path.resolve(relativeOutputPath)
  const absoluteOutputDir = path.dirname(absoluteOutputPath)

  // 确保输出目录存在
  if (!fs.existsSync(absoluteOutputDir)) {
    fs.mkdirSync(absoluteOutputDir, { recursive: true })
  }

  try {
    if (ext === '.fbx') {
      // FBX2glTF 会自动添加 .glb 后缀，所以 -o 参数不应包含 .glb
      const outputPath = absoluteOutputPath.replace('.glb', '')
      console.log(`[FormatConverter] 使用 FBX2glTF 转换 FBX`)

      // fbx2gltf 使用 Autodesk 官方 FBX SDK，精度最高
      // --binary 输出 .glb 单文件，--khr-materials-unlit 可选
      await execAsync(`npx fbx2gltf --binary --input "${absoluteInputPath}" --output "${outputPath}"`)
    } else if (ext === 'obj') {
      // OBJ 转换 - 需要 obj2gltf
      console.log('[FormatConverter] 使用 obj2gltf 转换 OBJ')
      await execAsync(`npx obj2gltf -i "${absoluteInputPath}" -o "${absoluteOutputPath}"`)
    } else if (ext === '.stl') {
      // STL 转换 - 使用 gltf-transform 或其他工具
      console.log('[FormatConverter] STL 转换暂不支持，请使用 GLB 格式')
      throw new Error('STL 格式转换暂不支持')
    } else {
      throw new Error(`[FormatConverter] 暂不支持的格式: ${ext}`)
    }

    if (!fs.existsSync(absoluteOutputPath)) {
      throw new Error(`[FormatConverter] 转换后文件不存在: ${absoluteOutputPath}`)
    }

    console.log(`[FormatConverter] 转换完成: ${relativeOutputPath}`)
    return relativeOutputPath
  } catch (error: any) {
    console.error(`[FormatConverter] 转换失败 (${ext}):`, error.message)
    if (error.stdout) console.log('stdout:', error.stdout)
    if (error.stderr) console.log('stderr:', error.stderr)
    throw error
  }
}
