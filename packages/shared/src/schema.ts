// TODO: 用 zod 定义与 types.ts 对应的运行时校验 schema
// zod 主要是用来校验数据结构的，比如传入的参数是否符合预期，避免运行时出错。
import { z } from 'zod'

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
})
