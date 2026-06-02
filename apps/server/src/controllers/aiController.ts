import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createQwenClient, type QwenClient, type ChatMessage } from '@scene-prod/ai'

// 懒加载单例：避免在未配置 API Key 时于模块加载阶段抛错
let client: QwenClient | null = null
function getClient(): QwenClient {
  if (!client) client = createQwenClient()
  return client
}

const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
})

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
})

/** 非流式对话：POST /api/scene-prod/ai/chat */
async function chat(req: FastifyRequest, res: FastifyReply) {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).send({ success: false, message: '参数校验失败', errors: parsed.error.issues })
  }

  try {
    const { messages, ...options } = parsed.data
    const result = await getClient().chat(messages as ChatMessage[], options)
    res.status(200).send({ success: true, ...result })
  } catch (error) {
    req.log.error(error, 'AI chat failed')
    res.status(500).send({ success: false, message: 'AI 对话失败' })
  }
}

/** 流式对话（SSE）：POST /api/scene-prod/ai/chat/stream */
async function chatStream(req: FastifyRequest, res: FastifyReply) {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).send({ success: false, message: '参数校验失败', errors: parsed.error.issues })
  }

  // 接管底层响应流，以 SSE 形式持续推送
  res.hijack()
  res.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  // 客户端断开时中止上游请求
  const abort = new AbortController()
  req.raw.on('close', () => abort.abort())

  try {
    const { messages, ...options } = parsed.data
    for await (const delta of getClient().chatStream(messages as ChatMessage[], { ...options, signal: abort.signal })) {
      res.raw.write(`data: ${JSON.stringify({ delta })}\n\n`)
    }
    res.raw.write('data: [DONE]\n\n')
  } catch (error) {
    req.log.error(error, 'AI chatStream failed')
    res.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'AI 流式对话失败' })}\n\n`)
  } finally {
    res.raw.end()
  }
}

export { chat, chatStream }
