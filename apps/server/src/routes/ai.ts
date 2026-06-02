import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { chat, chatStream } from '../controllers/aiController'

/**
 * API Key 保护：校验请求头中的密钥。
 * 支持 `Authorization: Bearer <key>` 或 `x-api-key: <key>`。
 * 未配置 AI_GATEWAY_KEY 时放行（仅建议在本地开发使用）。
 */
async function requireApiKey(req: FastifyRequest, res: FastifyReply) {
  const expected = process.env.AI_GATEWAY_KEY
  if (!expected) {
    req.log.warn('AI_GATEWAY_KEY 未配置，AI 路由当前处于开放状态')
    return
  }

  const auth = req.headers['authorization']
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-api-key'] as string | undefined)
  if (token !== expected) {
    return res.status(401).send({ success: false, message: '未授权：缺少或错误的 API Key' })
  }
}

export default async function aiRoutes(fastify: FastifyInstance) {
  fastify.post('/api/scene-prod/ai/chat', { preHandler: requireApiKey }, chat)
  fastify.post('/api/scene-prod/ai/chat/stream', { preHandler: requireApiKey }, chatStream)
}
