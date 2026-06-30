import type { FastifyRequest, FastifyReply } from 'fastify'
import { SceneModel, SceneObjectModel } from '../models/projectsModel'

/**
 * 发布场景：将场景标记为已发布，使其可通过分享链接公开访问
 */
export async function publishScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const { sceneId } = req.query as { sceneId: string }
    if (!sceneId) {
      return res.status(400).send({ success: false, message: '场景ID不能为空' })
    }

    const scene = await SceneModel.findOneAndUpdate(
      { sceneId },
      { isPublished: true, publishedAt: new Date() },
      { new: true },
    )
    if (!scene) {
      return res.status(404).send({ success: false, message: '场景不存在' })
    }

    res.status(200).send({ success: true, sceneId, message: '发布成功' })
  } catch (error) {
    res.status(500).send({ success: false, message: '发布场景失败' })
  }
}

/**
 * 取消发布：分享链接随即失效（公开加载返回 404）
 */
export async function unpublishScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const { sceneId } = req.query as { sceneId: string }
    if (!sceneId) {
      return res.status(400).send({ success: false, message: '场景ID不能为空' })
    }

    const scene = await SceneModel.findOneAndUpdate(
      { sceneId },
      { isPublished: false },
      { new: true },
    )
    if (!scene) {
      return res.status(404).send({ success: false, message: '场景不存在' })
    }

    res.status(200).send({ success: true, sceneId, message: '已取消发布' })
  } catch (error) {
    res.status(500).send({ success: false, message: '取消发布失败' })
  }
}

/**
 * 公开加载场景：仅返回已发布的场景，未发布或不存在一律 404
 * 返回结构与 loadScene 一致，便于前端复用同一套反序列化逻辑
 */
export async function getPublicScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const { sceneId } = req.query as { sceneId: string }
    if (!sceneId) {
      return res.status(400).send({ success: false, message: '场景ID不能为空' })
    }

    const scene = await SceneModel.findOne({ sceneId })
    // 未发布的场景对公开访问者不可见
    if (!scene || !(scene as unknown as { isPublished?: boolean }).isPublished) {
      return res.status(404).send({ success: false, message: '场景不存在或未发布' })
    }

    const objects = await SceneObjectModel.find({ sceneId })
    res.status(200).send({ success: true, objects, metadata: scene })
  } catch (error) {
    res.status(500).send({ success: false, message: '加载场景失败' })
  }
}
