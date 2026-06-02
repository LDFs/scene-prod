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
