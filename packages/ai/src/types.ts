/** 对话角色 */
export type ChatRole = 'system' | 'user' | 'assistant'

/** 单条对话消息 */
export interface ChatMessage {
  role: ChatRole
  content: string
}

/** 单次对话请求的可选参数（不传则回退到全局配置） */
export interface ChatCompletionOptions {
  /** 覆盖默认模型 */
  model?: string
  /** 覆盖默认采样温度 */
  temperature?: number
  /** 覆盖单次回复最大 token 数 */
  maxTokens?: number
  /** 是否流式返回 */
  stream?: boolean
  /** 透传给底层客户端的中止信号 */
  signal?: AbortSignal
}

/** 一次非流式对话的归一化返回结果 */
export interface ChatCompletionResult {
  /** 模型生成的文本 */
  content: string
  /** 实际使用的模型 */
  model: string
  /** token 用量统计（若服务端返回） */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
