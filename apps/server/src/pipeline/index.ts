import { AssetModel } from '../models/assetModel'
import { assetQueue } from './queue'
import fs from 'fs'
import path from 'path'

import { calculateBounds } from './processors/boundsCalculator'
import { compressDraco } from './processors/dracoCompressor'
import { formatConvert } from './processors/formatConverter'
import { AssetWithId } from '@scene-prod/shared'
import { ProcessAssetType } from './type'

async function processAsset(asset: AssetWithId) {
  const context: ProcessAssetType = {
    assetId: asset._id.toString(),
    inputPath: asset.filePath || '',
    originalName: asset.format,
    gltfPath: '',
    compressedPath: '',
    bounds: null,
    stats: null,
    lods: null,
    textures: {},
    tempDir: '',
  }
  console.log(`[Pipeline] 开始处理资产: ${asset.name} (${asset._id})`)

  // Step 1: 格式转换 (OBJ/FBX/STL → GLB)
  console.log('[Pipeline] Step 1: 格式转换')
  context.gltfPath = await formatConvert(context)

  // Step 3: Draco 压缩
  console.log('[Pipeline] Step 3: Draco 压缩')
  context.compressedPath = await compressDraco(context)

  // Step 6: 边界盒计算
  console.log('[Pipeline] Step 6: 边界盒计算')
  const boundsResult = await calculateBounds(context)
  context.bounds = boundsResult.bounds
  context.stats = boundsResult.stats

  console.log(`[Pipeline] 处理完成: ${asset.name}`)
  return context
}

assetQueue.process('process', async (job) => {
  const { assetId } = job.data
  let context = null

  try {
    // 获取资产记录。.lean() — 让 Mongoose 返回纯 JS 对象而不是 Document 实例
    const rawAsset = await AssetModel.findById(assetId).lean()
    if (!rawAsset) {
      throw new Error(`资产不存在: ${assetId}`)
    }
    // 处理 Mongoose 返回的类型
    const asset: AssetWithId = { ...rawAsset, _id: rawAsset._id.toString() }
    // 更新状态为处理中
    await AssetModel.findByIdAndUpdate(assetId, {
      processingStatus: 'processing',
      processingError: null,
    })

    // 执行流水线
    context = await processAsset(asset)

    // 更新资产记录
    await AssetModel.findByIdAndUpdate(assetId, {
      processingStatus: 'ready',
      processedFiles: {
        compressed: context.compressedPath,
        lod0: context.lods ? context.lods[0] : null,
        lod1: context.lods ? context.lods[1] : null,
        lod2: context.lods ? context.lods[2] : null,
        texture: context.textures || {},
      },
      bounds: context.bounds,
      stats: context.stats,
    })
    return { success: true, assetId }
  } catch (error: any) {
    console.error(`[Pipeline] 处理失败: ${assetId}`, error)

    // 更新失败状态
    await AssetModel.findByIdAndUpdate(assetId, {
      processingStatus: 'failed',
      processingError: error.message,
    })

    throw error
  } finally {
    // 清理临时文件
    if (context && context.tempDir) {
      try {
        console.log(`[Pipeline] 清理临时目录: ${context.tempDir}`)
        fs.rmSync(context.tempDir, { recursive: true, force: true })
      } catch (cleanupError: any) {
        console.warn('[Pipeline] 清理临时目录失败:', cleanupError.message)
      }
    }
  }
})

export { assetQueue, processAsset }
