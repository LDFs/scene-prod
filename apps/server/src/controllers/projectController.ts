import path from 'path'
import { nanoid } from 'nanoid'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { SceneModel, SceneObjectModel } from '../models/projectsModel'
import type { SerializedObject, SceneMetadata } from '@scene-prod/shared'

async function getScenes(req: FastifyRequest, res: FastifyReply) {
  try {
    const { page = 1, pageSize = 10 } = req.query as { page: number, pageSize: number }
    const scenes = await SceneModel.find().skip((page - 1) * pageSize).limit(pageSize)
    const total = await SceneModel.countDocuments()
    res.status(200).send({
      success: true,
      scenes,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    })
  } catch (error) {
    res.status(500).send({ success: false, message: '获取场景列表失败' })
  }
}

async function createScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const { name, description } = req.body as { name: string, description: string }
    const scene = new SceneModel({ sceneId: nanoid(), name, description, objectCount: 0 })

    await scene.save()

    res.status(200).send({ success: true, scene, message: '场景创建成功' })
  } catch (error) {
    res.status(500).send({ success: false, message: '创建场景失败' })
  }
}

async function deleteScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const sceneId = req.query?.sceneId as string
    await SceneModel.deleteOne({ sceneId })
    await SceneObjectModel.deleteMany({ sceneId })
    res.status(200).send({ success: true, message: '场景删除成功' })
  } catch (error) {
    res.status(500).send({ success: false, message: '删除场景失败' })
  }
}

async function saveScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const { objects, metadata } = req.body as { objects: SerializedObject[], metadata: SceneMetadata }
    const sceneId = metadata.sceneId 
    if(!sceneId) {
      return res.status(400).send({ success: false, message: '场景ID不能为空' })
    }

    await SceneObjectModel.deleteMany({ sceneId })

    if(objects && objects.length > 0) {
      const objectsWithSceneId = objects.map(obj => ({ ...obj, sceneId }))
      console.log('objectsWithSceneId---', objectsWithSceneId);
      await SceneObjectModel.insertMany(objectsWithSceneId)
    }

    const sceneData: Partial<SceneMetadata> = {
      lastModified: new Date(),
      objectCount: objects.length || 0,
    }
    Object.keys(metadata).forEach((key) => {
      if(metadata[key as keyof SceneMetadata] !== undefined){
        sceneData[key as keyof SceneMetadata] = metadata[key as keyof SceneMetadata] as never
      }
    })

    const scene = await SceneModel.findOneAndUpdate({ sceneId }, sceneData, { new: true })
    res.status(200).send({ success: true, scene, message: '场景保存成功' })
  } catch (error) {
    console.log('saveScene error', error);
    res.status(500).send({ success: false, message: '保存场景失败' })
  }
}

async function loadScene(req: FastifyRequest, res: FastifyReply) {
  try {
    const sceneId = req.query?.sceneId as string
    if(!sceneId) {
      return res.status(400).send({ success: false, message: '场景ID不能为空' })
    }

    const scene = await SceneModel.findOne({ sceneId })
    if(!scene) {
      return res.status(404).send({ success: false, message: '场景不存在' })
    }

    const objects = await SceneObjectModel.find({ sceneId })
    res.status(200).send({ success: true, objects, metadata: scene })
  } catch (error) {
    res.status(500).send({ success: false, message: '加载场景失败' })
  }
}

export { getScenes, createScene, deleteScene, saveScene, loadScene }