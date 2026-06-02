import { z } from 'zod'

/**
 * Qwen（通义千问）默认通过阿里云 DashScope 的 OpenAI 兼容接口访问。
 * 文档：https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
 */
export const QWEN_DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const QWEN_DEFAULT_MODEL = 'qwen-plus'

const AiConfigSchema = z.object({
  /** DashScope / Qwen API Key，必填，切勿硬编码到仓库中 */
  apiKey: z.string().min(1, 'AI_API_KEY / QWEN_API_KEY 未配置'),
  /** OpenAI 兼容接口地址 */
  baseURL: z.string().url().default(QWEN_DEFAULT_BASE_URL),
  /** 默认模型，如 qwen-plus / qwen-max / qwen-turbo */
  model: z.string().min(1).default(QWEN_DEFAULT_MODEL),
  /** 采样温度，0~2，越高越发散 */
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  /** 单次回复最大 token 数，留空则使用模型默认 */
  maxTokens: z.coerce.number().int().positive().optional(),
  /** 请求超时时间（毫秒） */
  timeout: z.coerce.number().int().positive().default(60_000),
})

export type AiConfig = z.infer<typeof AiConfigSchema>

/** 显式覆盖项，所有字段可选 */
export type AiConfigOverrides = Partial<AiConfig>

/** 去掉值为 undefined 的字段，确保 zod 的 default 能够生效 */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

/**
 * 从环境变量 + 显式覆盖项加载并校验 AI 配置。
 * 优先级：overrides > QWEN_* 专属变量 > AI_* 通用变量 > 默认值。
 */
export function loadAiConfig(overrides: AiConfigOverrides = {}): AiConfig {
  const fromEnv = omitUndefined({
    apiKey: process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? process.env.AI_API_KEY,
    baseURL: process.env.QWEN_BASE_URL ?? process.env.AI_BASE_URL,
    model: process.env.QWEN_MODEL ?? process.env.AI_MODEL,
    temperature: process.env.AI_TEMPERATURE,
    maxTokens: process.env.AI_MAX_TOKENS,
    timeout: process.env.AI_TIMEOUT,
  })

  const merged = { ...fromEnv, ...omitUndefined(overrides as Record<string, unknown>) }

  const parsed = AiConfigSchema.safeParse(merged)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
    throw new Error(`[@scene-prod/ai] AI 配置无效：\n${issues}`)
  }
  return parsed.data
}
