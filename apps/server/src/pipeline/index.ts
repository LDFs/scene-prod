import { AssetModel } from '../models/assetModel'
import { assetQueue } from './queue'
import fs from 'fs'
import path from 'path'
import { uploadFile } from '@/services/upFile'

import { calculateBounds } from './processors/boundsCalculator'
import { compressDraco } from './processors/dracoCompressor'
import { formatConvert } from './processors/formatConverter'
import { generateLODs } from './processors/lodGenerator'
import { optimizeTextures } from './processors/textureOptimizer'
import { extractZip } from './processors/zipExtractor'
import { sanitize } from './processors/sanitizer'
import { optimizeSceneGraph } from './processors/optimizeSceneGraph'
import { AssetWithId } from '@scene-prod/shared'
import { ProcessAssetType } from './type'

const __dirname = path.resolve()

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
    originalFormat: '',
  }
  console.log(`[Pipeline] 开始处理资产: ${asset.name} (${asset._id})`)

  // Step 0: ZIP 解压 (如果需要)
  if (context.originalFormat === 'zip') {
    console.log('[Pipeline] Step 0: ZIP 解压')
    context.inputPath = await extractZip(context)
  }

  // Step 1: 格式转换 (OBJ/FBX/STL → GLB)
  console.log('[Pipeline] Step 1: 格式转换')
  context.gltfPath = await formatConvert(context)

  // Step 2: 清洗验证 (移除相机/灯光)
  console.log('[Pipeline] Step 2: 清洗验证')
  await sanitize(context)

  // Step 2.5: 场景图优化（压平层级 + 去重）
  console.log('[Pipeline] Step 2.5: 场景图优化')
  await optimizeSceneGraph(context)

  // Step 3: Draco 压缩
  console.log('[Pipeline] Step 3: Draco 压缩')
  context.compressedPath = await compressDraco(context)

  // Step 4: 纹理优化 (KTX2 + 多分辨率)
  console.log('[Pipeline] Step 4: 纹理优化')
  context.textures = await optimizeTextures(context)

  // Step 5: LOD 生成
  console.log('[Pipeline] Step 5: LOD 生成')
  context.lods = await generateLODs(context)

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

    // 上传 compressed 到云存储
    let compressedCloudUrl = null
    if (context.compressedPath) {
      // 将相对路径转为绝对路径
      const localPath = path.join(__dirname, context.compressedPath)
      const remotePath = `/assets/compressed/${assetId}.glb`
      try {
        const res = await uploadFile(localPath, remotePath)
        compressedCloudUrl = res.Location
      } catch (err) {}
    }

    // 更新资产记录
    await AssetModel.findByIdAndUpdate(assetId, {
      processingStatus: 'ready',
      processedFiles: {
        compressed: '/' + context.compressedPath.replace(/\\/g, '/').replace(/^\/+/, ''),
        lod0: context.lods ? context.lods[0] : null,
        lod1: context.lods ? context.lods[1] : null,
        lod2: context.lods ? context.lods[2] : null,
        texture: context.textures || {},
      },
      bounds: context.bounds,
      stats: context.stats,
      'cloudUrls.compressed': compressedCloudUrl,
    })
    console.log('[保存到服务器路径]：', context.compressedPath)
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
