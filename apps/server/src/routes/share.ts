// 分享链接：发布/取消发布场景，以及公开（只读）加载已发布场景
import type { FastifyInstance } from 'fastify'
import { publishScene, unpublishScene, getPublicScene } from '../controllers/shareController'

export default async function shareRoutes(fastify: FastifyInstance) {
  fastify.post('/api/scene-prod/share/publish', publishScene)
  fastify.post('/api/scene-prod/share/unpublish', unpublishScene)
  fastify.get('/api/scene-prod/share/public', getPublicScene)
}
