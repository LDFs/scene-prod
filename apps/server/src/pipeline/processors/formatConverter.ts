import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { ProcessAssetType } from '../type'
import { repairObjForConversion } from '../utils/objRepair'

const execAsync = promisify(exec)
const __dirname = path.resolve()

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
  const outputDir = '/uploads/processed/models'
  // 相对路径用于数据库存储
  const relativeOutputPath = path.join(outputDir, `${context.assetId}_${baseName}.glb`)

  // 绝对路径用于命令执行
  const absoluteInputPath = path.resolve(context.inputPath)
  const absoluteOutputPath = path.join(__dirname, relativeOutputPath)
  const absoluteOutputDir = path.dirname(absoluteOutputPath)

  // 确保输出目录存在
  if (!fs.existsSync(absoluteOutputDir)) {
    fs.mkdirSync(absoluteOutputDir, { recursive: true })
  }

  // OBJ 有两类会静默失败的问题（nan 顶点值、mtllib 扩展名大小写），转换前先在
  // 副本上修掉，原文件不动。详见 objRepair。
  let cleanupPaths: string[] = []

  try {
    let conversionInputPath = absoluteInputPath

    if (ext === '.obj') {
      const repair = await repairObjForConversion(absoluteInputPath)
      conversionInputPath = repair.inputPath
      cleanupPaths = repair.cleanupPaths

      if (repair.fixedCount > 0) {
        context.warnings.push(
          `模型有 ${repair.fixedCount} 处顶点/UV 数据是无效值（nan/inf），已置零处理。` +
            `这部分区域的贴图坐标可能不正确，建议在建模软件里重新导出`,
        )
      }
      if (repair.normalizedMtls.length > 0) {
        console.log(`[FormatConverter] 已修正材质库扩展名大小写: ${repair.normalizedMtls.join('、')}`)
      }
    }

    if (ext === '.fbx') {
      // 检查本地 bin 目录是否有 FBX2glTF
      const localBin = path.join(process.cwd(), 'bin', 'FBX2glTF.exe');
      const fbxCommand = fs.existsSync(localBin) ? `"${localBin}"` : 'FBX2glTF';

      // FBX2glTF 会自动添加 .glb 后缀，所以 -o 参数不应包含 .glb
      const outputPath = absoluteOutputPath.replace('.glb', '')
      console.log(`[FormatConverter] 使用 FBX2glTF 转换 FBX`)

      // fbx2gltf 使用 Autodesk 官方 FBX SDK，精度最高
      // --binary 输出 .glb 单文件，--khr-materials-unlit 可选
      const { stdout, stderr } = await execAsync(`${fbxCommand} --binary --input "${absoluteInputPath}" --output "${outputPath}"`)

      if (stdout) console.log('[FormatConverter] stdout:', stdout);
      if (stderr) console.log('[FormatConverter] stderr:', stderr);
    } else if (ext === '.obj') {
      // OBJ 转换 - 需要 obj2gltf。输入用可能被修复过的副本，输出名仍取原始
      // baseName，不让 ".__repaired" 污染资产名
      console.log('[FormatConverter] 使用 obj2gltf 转换 OBJ')
      await execAsync(`npx obj2gltf -i "${conversionInputPath}" -o "${absoluteOutputPath}"`)
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

    console.log(`[FormatConverter] 转换完成: ${absoluteOutputPath}`)
    return absoluteOutputPath
  } catch (error: any) {
    console.error(`[FormatConverter] 转换失败 (${ext}):`, error.message)
    if (error.stdout) console.log('stdout:', error.stdout)
    if (error.stderr) console.log('stderr:', error.stderr)
    throw error
  } finally {
    // 修复产生的临时文件只服务于这一次转换。直传 .obj 时它们落在 uploads/models/
    // 下，不在 pipeline 的 tempDir 清理范围内，必须自己删
    for (const tempPath of cleanupPaths) {
      try {
        fs.rmSync(tempPath, { force: true })
      } catch (cleanupError: any) {
        console.warn('[FormatConverter] 清理临时文件失败:', cleanupError.message)
      }
    }
  }
}
