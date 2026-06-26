import { AssetModel } from '../models/assetModel'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import path from 'path'
import fs from 'fs'
import { AssetType } from '@scene-prod/shared'
import { assetQueue, processAsset } from '@/pipeline'
import { uploadFile } from '@/services/upFile'

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

    // 保存文件到本地
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const ext = path.extname(mainFile.filename).toLowerCase()
    const newFilename = `${uniqueSuffix}${ext}`
    const savePath = path.join(__dirname, 'uploads', 'models', newFilename)
    await fs.promises.writeFile(savePath, mainBuffer)

    let thumbnailUrl = ''
    if (thumbnailFile && thumbnailBuffer) {
      const thumbExt = path.extname(thumbnailFile.filename).toLowerCase() || '.png'
      const thumbFilename = `${uniqueSuffix}_thumb${thumbExt}`
      const thumbnailSavePath = path.join(__dirname, 'uploads', 'thumbnails', thumbFilename)
      await fs.promises.writeFile(thumbnailSavePath, thumbnailBuffer)
      thumbnailUrl = `/uploads/thumbnails/${thumbFilename}`
    }

    let assetType = 'model'
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      assetType = 'texture'
    } else if (['.hdr'].includes(ext)) {
      assetType = 'hdri'
    } else if (['.gltf', '.glb', '.zip', 'obj'].includes(ext)) {
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

    // 处理缩略图，上传到云存储, 在数据库中存储对应的url
    if (thumbnailFile) {
      const thumbExt = path.extname(thumbnailFile.filename).toLowerCase() || '.png'
      const thumbFilename = `${uniqueSuffix}_thumb${thumbExt}`
      const thumbnailSavePath = path.join(__dirname, 'uploads', 'thumbnails', thumbFilename)

      const remotePath = `/assets/thumbnails/${asset._id.toString()}.png`

      try {
        const res = await uploadFile(thumbnailSavePath, remotePath)
        if (res) {
          await AssetModel.findByIdAndUpdate(asset._id, {
            'cloudUrls.thumbnail': res.Location,
          })
          asset.cloudUrls = { thumbnail: res.Location }
        }
      } catch (err) {}
    }
    // HDRI 和贴图文件上传到云存储, 在数据库中存储对应的url
    if (assetType === 'hdri' || assetType === 'texture') {
    }

    // 如果是模型类型，加入处理队列
    if (assetType === 'model') {
      await assetQueue.add('process', { assetId: asset._id.toString() })
      console.log(`[Upload] 资产已加入处理队列: ${asset._id}`)
    }

    return res.status(200).send({ success: true, asset, message: '资产上传成功' })
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
      filter.type = type as AssetType
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

export { uploadAsset, getAssets, getAssetById, deleteAsset, downloadAsset, getAssetByName }
