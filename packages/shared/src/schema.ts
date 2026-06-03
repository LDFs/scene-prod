// TODO: 用 zod 定义与 types.ts 对应的运行时校验 schema
// zod 主要是用来校验数据结构的，比如传入的参数是否符合预期，避免运行时出错。
import { z } from 'zod'

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
})


/**
 * AI 生成的场景数据结构
 */
export const AISceneJsonSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
})

const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
})

export const SerializedObjectSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  url: z.string(),
  sceneId: z.string(),
  visible: z.boolean(),
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema,
  modificationTime: z.number().optional(),
  modifications: z.record(z.string(), z.any()).optional(),
  geometry: z.object({
    type: z.string(),
    parameters: z.record(z.string(), z.any()),
  }).optional(),
  material: z.record(z.string(), z.any()).optional(),
})

export const SceneDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  cameraFar: z.number(),
  lastModified: z.coerce.date(),
  objectCount: z.number().int(),
  environmentUrl: z.string(),
  gisConfig: z.record(z.string(), z.any()).nullish(),
  objects: z.array(SerializedObjectSchema),
  sceneId: z.string(),
  thumbnail: z.string().optional(),
  cloudUrls: z.string().optional(),
  backgroundColor: z.string(),
  ambientIntensity: z.number(),
})
