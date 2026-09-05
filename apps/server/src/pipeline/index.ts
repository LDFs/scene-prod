import { AssetModel } from '../models/assetModel'
import { assetQueue } from './queue'
import fs from 'fs'
import { publishToCloud } from './utils/publishToCloud'

import { calculateBounds } from './processors/boundsCalculator'
import { compressDraco } from './processors/dracoCompressor'
import { formatConvert } from './processors/formatConverter'
import { generateLODs } from './processors/lodGenerator'
import { optimizeTextures } from './processors/textureOptimizer'
import { extractZip } from './processors/zipExtractor'
import { sanitize } from './processors/sanitizer'
import { optimizeSceneGraph } from './processors/optimizeSceneGraph'
import { computeSizing } from './utils/sizing'
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
    originalFormat: asset.format,
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

// 给队列声明处理器
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

    // 上传全部产物（compressed / LOD0-2 / 多分辨率纹理）到云存储
    const cloud = await publishToCloud(assetId, context)

    let uploadWarning: string | null = null
    if (cloud.errors.length > 0) {
      console.error(`[Pipeline] 云存储上传失败 ${cloud.errors.length}/${cloud.total} 个文件 (assetId=${assetId}):`)
      cloud.errors.forEach((e) => console.error(`  ✗ ${e.key} → ${e.remotePath}: ${e.message}`))
      uploadWarning = `云存储上传失败 ${cloud.errors.length}/${cloud.total} 个文件: ${cloud.errors
        .map((e) => `${e.key}(${e.message})`)
        .join('; ')}`
    } else {
      console.log(`[Pipeline] 云存储上传完成: ${cloud.total} 个文件`)
    }

    // 尺寸归一化:根据最长边启发式推断换算到米的缩放因子
    const sizing = context.bounds ? computeSizing(context.bounds.longestEdge) : null
    if (sizing) {
      console.log(`[Pipeline] 尺寸归一化: ×${sizing.normalizeScale} (猜测单位 ${sizing.unitGuess})`)
    }

    // 先落库：本地处理成果和已成功的云端地址不因个别上传失败而丢弃
    await AssetModel.findByIdAndUpdate(assetId, {
      // compressed 是资产本体，它上传失败则整单判失败，交给队列重试
      processingStatus: cloud.fatal ? 'failed' : 'ready',
      processingError: uploadWarning,
      processedFiles: {
        compressed: '/' + context.compressedPath.replace(/\\/g, '/').replace(/^\/+/, ''),
        lod0: context.lods ? context.lods[0] : null,
        lod1: context.lods ? context.lods[1] : null,
        lod2: context.lods ? context.lods[2] : null,
        textures: context.textures || {},
      },
      bounds: context.bounds,
      stats: context.stats,
      ...(sizing ? { sizing } : {}),
      ...cloud.updates,
    })
    console.log('[保存到服务器路径]：', context.compressedPath)

    if (cloud.fatal) {
      // 抛出让 Bull 重试整条流水线；catch 分支会补写 failed 状态
      throw new Error(uploadWarning ?? 'compressed 上传云存储失败')
    }

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
