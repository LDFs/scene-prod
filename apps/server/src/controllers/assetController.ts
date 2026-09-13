import { AssetModel } from '../models/assetModel'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import path from 'path'
import fs from 'fs'
import { AssetType } from '@scene-prod/shared'
import { assetQueue, processAsset } from '@/pipeline'
import { uploadFileWithRetry, deleteObject } from '@/services/upFile'
import { collectExternalUris, parseGltf } from '@/pipeline/utils/gltfDeps'

const __dirname = path.resolve() // 在哪个地方运行的这个服务

// 确保上传目录存在
const uploadDirs = [
  'uploads/models', // 兼容旧数据
  'uploads/thumbnails', // 缩略图
  'uploads/raw', // 原始上传文件
  'uploads/processed/models', // 压缩后模型
  'uploads/processed/lods', // LOD 版本
  'uploads/processed/textures', // 优化后纹理
  'uploads/temp', // 临时处理目录
]

uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

async function uploadAsset(req: FastifyRequest, res: FastifyReply) {
  try {
    const parts = req.files()
    let mainFile: MultipartFile | null = null
    let mainBuffer: Buffer | null = null
    let thumbnailFile: MultipartFile | null = null
    let thumbnailBuffer: Buffer | null = null

    // 必须在循环内立即消费每个 part 的流，否则 multipart 会阻塞等待流排空
    for await (const part of parts) {
      if (part.fieldname === 'file') {
        mainFile = part
        mainBuffer = await part.toBuffer()
      } else if (part.fieldname === 'thumbnail') {
        thumbnailFile = part
        thumbnailBuffer = await part.toBuffer()
      } else {
        await part.toBuffer() // 排空未知字段，避免阻塞
      }
    }

    if (!mainFile || !mainBuffer) {
      return res.status(400).send({ success: false, message: '主文件不能为空' })
    }

    // 检查文件是否被截断（超过 limits.fileSize）
    if (mainFile.file.truncated) {
      return res.status(413).send({ success: false, message: '文件过大' })
    }

    const ext = path.extname(mainFile.filename).toLowerCase()

    // .gltf 靠相对 uri 引用 .bin 和贴图。单文件上传必然缺依赖，处理流水线和前端
    // 加载都会失败，且失败点离原因很远。入口直接拒绝，避免坏数据入库并占用云存储。
    if (ext === '.gltf') {
      let externalUris: string[] = []
      try {
        externalUris = collectExternalUris(parseGltf(mainBuffer.toString('utf-8'), mainFile.filename))
      } catch (err: any) {
        return res.status(400).send({ success: false, message: err.message })
      }
      if (externalUris.length > 0) {
        return res.status(400).send({
          success: false,
          message: `该 .gltf 依赖 ${externalUris.length} 个外部文件（${externalUris.join(
            '、',
          )}），单独上传会缺少资源。请连同依赖一起打包成 .zip 再上传`,
          missingDependencies: externalUris,
        })
      }
    }

    // 保存文件到本地
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const newFilename = `${uniqueSuffix}${ext}`
    const savePath = path.join(__dirname, 'uploads', 'models', newFilename)
    await fs.promises.writeFile(savePath, mainBuffer)

    let thumbnailUrl = ''
    let thumbnailSavePath = ''
    if (thumbnailFile && thumbnailBuffer) {
      const thumbExt = path.extname(thumbnailFile.filename).toLowerCase() || '.png'
      const thumbFilename = `${uniqueSuffix}_thumb${thumbExt}`
      thumbnailSavePath = path.join(__dirname, 'uploads', 'thumbnails', thumbFilename)
      await fs.promises.writeFile(thumbnailSavePath, thumbnailBuffer)
      thumbnailUrl = `/uploads/thumbnails/${thumbFilename}`
    }

    let assetType = 'model'
    // .hdr 也归到 texture：它和普通贴图在上传、存储、流水线上的处理完全一致，
    // 真正需要区分的只有加载器（HDRLoader vs TextureLoader），而那看的是 format
    if (['.jpg', '.jpeg', '.png', '.webp', '.hdr', '.exr'].includes(ext)) {
      assetType = 'texture'
    } else if (['.gltf', '.glb', '.zip', '.obj', '.fbx'].includes(ext)) {
      assetType = 'model'
    } else if (['.mtl'].includes(ext)) {
      assetType = 'material'
    } else if (['.tileset'].includes(ext)) {
      assetType = 'tileset'
    }

    const assetData = {
      name: path.basename(mainFile.filename, ext),
      originalName: mainFile.filename,
      type: assetType,
      format: ext.substring(1),
      filePath: `uploads/models/${newFilename}`,
      fileSize: mainBuffer.length,
      url: `/uploads/models/${newFilename}`,
      processingStatus: assetType === 'model' ? 'pending' : 'skipped',
      thumbnail: thumbnailUrl,
    }

    const asset = new AssetModel(assetData)
    await asset.save()

    // 云存储上传失败不回滚已建的资产记录（文件仍在本地，可后续补传），
    // 但必须记录日志并随响应返回，绝不静默吞掉
    const warnings: string[] = []

    // 处理缩略图，上传到云存储, 在数据库中存储对应的url
    if (thumbnailSavePath) {
      const remotePath = `/assets/thumbnails/${asset._id.toString()}.png`
      try {
        const res = await uploadFileWithRetry(thumbnailSavePath, remotePath)
        await AssetModel.findByIdAndUpdate(asset._id, {
          'cloudUrls.thumbnail': res.Location,
        })
        if (!asset.cloudUrls) asset.cloudUrls = {}
        asset.cloudUrls.thumbnail = res.Location
      } catch (err: any) {
        const message = err?.message ?? String(err)
        console.error(`[Upload] 缩略图上传云存储失败 (assetId=${asset._id}): ${message}`)
        req.log.error({ err, assetId: asset._id.toString(), remotePath }, '缩略图上传云存储失败')
        warnings.push(`缩略图上传云存储失败: ${message}`)
      }
    }
    // 贴图文件（含 .hdr 环境贴图）上传到云存储, 在数据库中存储对应的url
    if (assetType === 'texture') {
      const remotePath = `/assets/${assetType}/${asset._id.toString()}${ext}`
      try {
        const res = await uploadFileWithRetry(savePath, remotePath)
        await AssetModel.findByIdAndUpdate(asset._id, {
          'cloudUrls.file': res.Location,
        })
        if (!asset.cloudUrls) asset.cloudUrls = {}
        asset.cloudUrls.file = res.Location
        console.log(`[Upload] ${assetType} 已上传到云端: ${res.Location}`)
      } catch (err: any) {
        // 这是资产本体，前端靠 cloudUrls.file 访问，失败必须让调用方知道
        const message = err?.message ?? String(err)
        console.error(`[Upload] ${assetType} 上传云存储失败 (assetId=${asset._id}): ${message}`)
        req.log.error({ err, assetId: asset._id.toString(), remotePath }, `${assetType} 上传云存储失败`)
        warnings.push(`${assetType} 文件上传云存储失败: ${message}`)
      }
    }

    // 如果是模型类型，加入处理队列
    if (assetType === 'model') {
      // 给队列添加处理器
      await assetQueue.add('process', { assetId: asset._id.toString() })
      console.log(`[Upload] 资产已加入处理队列: ${asset._id}`)
    }

    return res.status(200).send({
      success: true,
      asset,
      ...(warnings.length > 0 ? { warnings } : {}),
      message: warnings.length > 0 ? '资产上传成功，但部分文件未同步到云存储' : '资产上传成功',
    })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '上传资产失败' })
  }
}

async function getAssets(req: FastifyRequest, res: FastifyReply) {
  try {
    const { type, page = 1, pageSize = 10 } = req.query as { type: string; page: number; pageSize: number }
    const skip = (page - 1) * pageSize

    const filter: any = {}
    if (type) {
      filter.type = type
    }

    const total = await AssetModel.countDocuments(filter)
    const assets = await AssetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize)
    return res.status(200).send({
      success: true,
      assets,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      message: '获取资产列表成功',
    })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '获取资产列表失败' })
  }
}

/**
 * 根据名称和类型来获取模型或材质
 */
async function getAssetByName(req: FastifyRequest, res: FastifyReply) {
  try {
    const { type = 'model', name } = req.query as { type: string; name: string }
    if (!name) return res.status(400).send({ success: false, message: '未给出名称 name' })
    const filter: any = { type, name }
    const asset = await AssetModel.findOne(filter)
    return res.status(200).send({
      success: true,
      asset,
      message: '获取成功',
    })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '获取资产失败' })
  }
}

/**
 * 重命名资产。
 *
 * name 不只是展示用的标签：getAssetByName 以 (type, name) 作为查询键，
 * Viewport 就靠它按名字取材质。所以同类型下的重名必须挡掉，
 * 否则 findOne 会静默返回其中一条，表现为"改了个名字，场景里的材质就换了"。
 */
async function renameAsset(req: FastifyRequest, res: FastifyReply) {
  try {
    const { id, name } = req.body as { id?: string; name?: string }
    if (!id) {
      return res.status(400).send({ success: false, message: '缺少参数 id' })
    }

    const newName = (name ?? '').trim()
    if (!newName) {
      return res.status(400).send({ success: false, message: '名称不能为空' })
    }
    if (newName.length > 100) {
      return res.status(400).send({ success: false, message: '名称不能超过 100 个字符' })
    }

    const asset = await AssetModel.findById(id)
    if (!asset) {
      return res.status(404).send({ success: false, message: '资产不存在' })
    }

    // 改成一样的名字直接当作成功，不必写库
    if (asset.name !== newName) {
      const duplicated = await AssetModel.exists({ _id: { $ne: asset._id }, type: asset.type, name: newName })
      if (duplicated) {
        return res.status(409).send({ success: false, message: '同类型下已存在同名资产' })
      }
      asset.name = newName
      await asset.save()
    }

    return res.status(200).send({ success: true, asset, message: '重命名成功' })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '重命名失败' })
  }
}

async function getAssetById(req: FastifyRequest, res: FastifyReply) {
  try {
    const { id } = req.query as { id: string }
    const asset = await AssetModel.findById(id)

    if (!asset) {
      return res.status(404).send({ success: false, message: '资产不存在' })
    }
    return res.status(200).send({ success: true, asset, message: '获取资产成功' })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '获取资产失败' })
  }
}

/**
 * 查询资产的流水线处理状态。
 *
 * 上传接口返回 200 只代表"文件已收下、任务已入队"，真正的处理在 Bull 队列里
 * 异步进行。失败信息此前只写进数据库、无人读取，前端因此完全看不到异步失败。
 * 这个端点就是那条回传通道。
 */
async function getProcessingStatus(req: FastifyRequest, res: FastifyReply) {
  try {
    const { id } = req.query as { id: string }
    if (!id) {
      return res.status(400).send({ success: false, message: '缺少参数 id', status: 'unknown' })
    }

    const asset = await AssetModel.findById(id)
      .select('processingStatus processingError processingWarning name')
      .lean()
    if (!asset) {
      return res.status(404).send({ success: false, message: '资产不存在', status: 'unknown' })
    }

    const status = asset.processingStatus ?? 'skipped'
    return res.status(200).send({
      success: true,
      status,
      // 前端直接展示这条，所以过滤掉纯内部细节
      message: status === 'failed' ? toUserFacingError(asset.processingError) : '获取处理状态成功',
      // 处理成功但有瑕疵时的说明。这些原文都是前置检查/流水线主动写的面向用户文案，
      // 不像 processingError 那样可能混进第三方库的内部细节，可以直接透出
      ...(asset.processingWarning ? { warning: asset.processingWarning } : {}),
    })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '获取处理状态失败', status: 'unknown' })
  }
}

/**
 * 把流水线的错误原文转成对用户有意义的说明。
 *
 * processingError 里既有用户能据此行动的原因（缺依赖资源、格式不支持），也有
 * gltf-transform / Draco 抛出的内部细节。后者直接展示只会让人困惑，统一收敛成
 * 一句兜底话术，具体内容留在服务端日志里排查。
 */
function toUserFacingError(raw?: string | null): string {
  if (!raw) return '模型处理失败'

  // 这些是前置校验和格式转换主动抛出的、面向用户的原因，原文透出
  const actionablePatterns = [
    /缺少 \d+ 个依赖资源/,
    /缺少 \.bin 或贴图/,
    /未找到支持的模型文件/,
    /不是有效的 glTF JSON/,
    /格式转换暂不支持/,
    /暂不支持的格式/,
    /云存储上传失败/,
  ]
  if (actionablePatterns.some((pattern) => pattern.test(raw))) {
    return raw
  }
  return '模型处理失败，请检查文件是否完整或联系管理员'
}

async function deleteAsset(req: FastifyRequest, res: FastifyReply) {
  try {
    const { id } = req.query as { id: string }
    const asset = await AssetModel.findById(id)
    if (!asset) {
      return res.status(404).send({ success: false, message: '资产不存在' })
    }

    const safeUnlink = (filePath: string) => {
      if (!filePath) return
      const normalizedPath = filePath.replace(/\\/g, '/')
      if (fs.existsSync(normalizedPath)) {
        try {
          fs.unlinkSync(normalizedPath)
          console.log('[Delete] 已删除：', normalizedPath)
        } catch (error) {
          console.error('[Delete] 删除失败：', normalizedPath, error)
        }
      } else {
        console.log('[Delete] 文件不存在：', normalizedPath)
      }
    }

    const dbPath2FsPath = (dbPath: string): string => {
      if (!dbPath) return ''
      let fsPath = dbPath.startsWith('/') ? dbPath.substring(1) : dbPath
      fsPath = fsPath.replace(/\\/g, '/')
      return fsPath
    }

    console.log(`[Delete] 开始删除资产文件: ${asset.name}`)
    console.log(`[Delete] 原始文件路径: ${asset.filePath}`)
    console.log(`[Delete] 缩略图路径: ${asset.thumbnail}`)
    console.log(`[Delete] processedFiles:`, JSON.stringify(asset.processedFiles, null, 2))

    safeUnlink(asset.filePath ?? '')
    safeUnlink(asset.thumbnail ?? '')
    // 删除处理后的文件
    if (asset.processedFiles) {
      safeUnlink(dbPath2FsPath(asset.processedFiles.compressed ?? ''))
      safeUnlink(dbPath2FsPath(asset.processedFiles.lod0 ?? ''))
      safeUnlink(dbPath2FsPath(asset.processedFiles.lod1 ?? ''))
      safeUnlink(dbPath2FsPath(asset.processedFiles.lod2 ?? ''))
      // 删除纹理文件
      if (asset.processedFiles.textures) {
        const textures = asset.processedFiles.textures
        // 纹理可能是对象格式（按纹理名称分组）
        if (typeof textures === 'object') {
          Object.values(textures).forEach((texGroup) => {
            if (typeof texGroup === 'string') {
              safeUnlink(dbPath2FsPath(texGroup))
            } else if (typeof texGroup === 'object' && texGroup !== null) {
              Object.values(texGroup).forEach((texPath) => {
                if (typeof texPath === 'string') {
                  safeUnlink(dbPath2FsPath(texPath))
                }
              })
            }
          })
        }
      }
    }

    // 删除云端文件
    if (asset.cloudUrls) {
      console.log('[删除云端文件]:', asset.cloudUrls)
      const cloud = asset.cloudUrls
      const cloudSingles = [cloud.compressed, cloud.thumbnail, cloud.file, cloud.lod0, cloud.lod1, cloud.lod2]
      cloudSingles.forEach((url) => url && deleteObject(url))
      // 纹理是 { 纹理名: { 分辨率: url } } 两层结构
      if (cloud.textures && typeof cloud.textures === 'object') {
        Object.values(cloud.textures).forEach((variants) => {
          if (!variants || typeof variants !== 'object') return
          Object.values(variants).forEach((url) => typeof url === 'string' && deleteObject(url))
        })
      }
    }

    // 删除数据库记录
    await AssetModel.findByIdAndDelete(id)
    return res.status(200).send({ success: true, message: '资产删除成功' })
  } catch (error) {
    req.log.error(error)
    return res.status(500).send({ success: false, message: '删除资产失败' })
  }
}

/**
 * 下载资产
 */
async function downloadAsset(req: FastifyRequest, res: FastifyReply) {
  try {
    const { id } = req.query as { id: string }
    const asset = await AssetModel.findById(id)

    if (!asset) {
      return res.status(404).send({
        success: false,
        message: '资产不存在',
      })
    }

    if (!fs.existsSync(asset.filePath ?? '')) {
      return res.status(404).send({
        success: false,
        message: '文件不存在',
      })
    }

    // 这是express的下载方式
    // res.download(asset.filePath??'', asset.originalName);
    const stat = fs.statSync(asset.filePath ?? '')
    // 设置下载响应头
    res
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(asset.originalName)}"`)
      .header('Content-Length', stat.size)
    // 返回文件流
    return res.send(fs.createReadStream(asset.filePath ?? ''))
  } catch (error) {
    console.error('下载资产失败:', error)
    res.status(500).send({
      success: false,
      message: '下载失败',
      error: error instanceof Error ? error.message : '未知错误',
    })
  }
}

export {
  uploadAsset,
  getAssets,
  getAssetById,
  deleteAsset,
  downloadAsset,
  getAssetByName,
  getProcessingStatus,
  renameAsset,
}
