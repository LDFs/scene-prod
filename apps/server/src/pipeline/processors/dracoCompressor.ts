import { draco } from '@gltf-transform/functions'
import path from 'path'
import fs from 'fs'
import { createNodeIO } from '../utils/ioUtil'
import { ProcessAssetType } from '../type'

/**
 * 使用 Draco 压缩 GLB 文件
 * @param {ProcessAssetType} context - 处理上下文
 * @returns {string} 压缩后文件路径
 */
export async function compressDraco(context: ProcessAssetType) {
  const io = await createNodeIO()

  const inputPath = context.gltfPath
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join('uploads/processed/models', `${baseName}_compressed.glb`)

  // 读取失败通常意味着资源不全（缺 .bin 或贴图）。这种情况不能降级继续：
  // 往下走只会把一份残缺产物推到流水线末尾，让错误暴露在前端加载场景时。
  let document
  try {
    document = await io.read(inputPath)
  } catch (error: any) {
    const message = error?.message ?? String(error)
    console.error('[DracoCompressor] 读取模型失败:', message)
    throw new Error(`读取模型失败，可能缺少 .bin 或贴图等依赖资源: ${message}`)
  }

  try {
    //应用 Draco 压缩
    await document.transform(
      draco({
        quantizePosition: 14, // 位置精度 (bits)
        quantizeNormal: 10, // 法线精度
        quantizeTexcoord: 12, // UV 精度
        quantizeColor: 8, // 顶点颜色精度
        quantizeGeneric: 12, // 其他属性精度
      }),
    )

    // 写入压缩文件
    await io.write(outputPath, document)

    // 计算压缩率
    const originalSize = fs.statSync(inputPath).size
    const compressedSize = fs.statSync(outputPath).size
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1)

    console.log(
      `[DracoCompressor] 压缩完成: ${ratio}% 减少 (${(originalSize / 1024).toFixed(1)}KB → ${(
        compressedSize / 1024
      ).toFixed(1)}KB)`,
    )

    return outputPath
  } catch (error: any) {
    console.error('[DracoCompressor] 压缩失败:', error.message)
    // 仅 Draco 压缩本身失败时降级：模型是完整的，用未压缩版本继续流水线
    return context.gltfPath
  }
}
