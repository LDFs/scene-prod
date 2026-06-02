# @scene-prod/ai

scene-prod 的 AI 接入层，封装通义千问（Qwen）大模型。底层通过阿里云 DashScope 的 **OpenAI 兼容接口** 调用，因此直接复用 `openai` SDK。

## 目录结构

```
src/
  config.ts   # 配置加载与 zod 校验（环境变量 / 显式覆盖）
  client.ts   # QwenClient 客户端封装（chat / chatStream）
  types.ts    # 对话相关类型
  index.ts    # 统一导出
```

## 配置

复制 `.env.example` 为 `.env` 并填入 `QWEN_API_KEY`。配置优先级：

> 显式覆盖 > `QWEN_*` 专属变量 > `AI_*` 通用变量 > 内置默认值

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `QWEN_API_KEY` / `DASHSCOPE_API_KEY` / `AI_API_KEY` | API Key（必填） | — |
| `QWEN_BASE_URL` / `AI_BASE_URL` | OpenAI 兼容接口地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` / `AI_MODEL` | 默认模型 | `qwen-plus` |
| `AI_TEMPERATURE` | 采样温度 | `0.7` |
| `AI_MAX_TOKENS` | 单次回复最大 token | 模型默认 |
| `AI_TIMEOUT` | 请求超时（毫秒） | `60000` |

## 使用

```ts
import { createQwenClient } from '@scene-prod/ai'

const ai = createQwenClient()

// 非流式
const res = await ai.chat([
  { role: 'system', content: '你是一个 3D 场景助手' },
  { role: 'user', content: '帮我生成一个森林场景的描述' },
])
console.log(res.content)

// 流式
for await (const delta of ai.chatStream([{ role: 'user', content: '你好' }])) {
  process.stdout.write(delta)
}
```
