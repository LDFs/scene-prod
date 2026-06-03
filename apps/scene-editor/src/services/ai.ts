// 封装与 scene-prod-server AI 接口的 HTTP 调用
import { API_BASE_URL } from '../../config.js'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatResult {
  success: boolean
  content: string
  model?: string
  message?: string
}

/**
 * 非流式对话：POST /api/scene-prod/ai/chat
 * @param messages 完整的对话上下文
 */
export async function chatWithAI(messages: ChatMessage[]): Promise<ChatResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    })
    const data = await response.json()

    if (data.success) {
      return { success: true, content: data.content as string, model: data.model }
    }
    console.error('AI 对话失败:', data.message)
    return { success: false, content: '', message: data.message ?? 'AI 对话失败' }
  } catch (error) {
    console.error('AI 对话失败:', error)
    return { success: false, content: '', message: '网络错误，请稍后重试' }
  }
}

export async function chatWithAIStream(messages: ChatMessage[], onDelta: (delta: string) => void, onComplete: () => void, onError: (message: string) => void) {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    })
    const reader = response.body?.getReader()
    if (!reader) {
      onError('无法读取 AI 响应流')
      return
    }
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (chunk) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            onComplete()
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.delta) onDelta(parsed.delta)
          } catch {
            // 忽略非 JSON 帧
          }
        }
      }
      if (done) break
    }
    onComplete()
  } catch (error: unknown) {
    if(error instanceof Error) {
      console.error('AI 流式对话失败:', error)
      onError(error.message)
    } else {
      console.error('AI 流式对话失败:', error)
      onError('未知错误，请稍后重试')
    }
  }
}
