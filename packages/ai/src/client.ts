import OpenAI from 'openai'
import { loadAiConfig, type AiConfig, type AiConfigOverrides } from './config'
import type { ChatCompletionOptions, ChatCompletionResult, ChatMessage } from './types'

/**
 * Qwen 客户端：基于 DashScope 的 OpenAI 兼容接口封装。
 * 内部持有一个 OpenAI SDK 实例与一份已校验的配置。
 */
export class QwenClient {
  readonly config: AiConfig
  readonly raw: OpenAI

  constructor(overrides: AiConfigOverrides = {}) {
    this.config = loadAiConfig(overrides)
    this.raw = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
    })
  }

  /** 非流式对话补全 */
  async chat(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<ChatCompletionResult> {
    const completion = await this.raw.chat.completions.create(
      {
        model: options.model ?? this.config.model,
        messages,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stream: false,
      },
      { signal: options.signal },
    )

    const choice = completion.choices[0]
    const usage = completion.usage

    return {
      content: choice?.message?.content ?? '',
      model: completion.model,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    }
  }

  /** 流式对话补全，逐段产出文本增量 */
  async *chatStream(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.raw.chat.completions.create(
      {
        model: options.model ?? this.config.model,
        messages,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stream: true,
      },
      { signal: options.signal },
    )

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }
}

/** 便捷工厂方法 */
export function createQwenClient(overrides: AiConfigOverrides = {}): QwenClient {
  return new QwenClient(overrides)
}
