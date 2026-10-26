// TODO: 用 zod 定义与 types.ts 对应的运行时校验 schema
// zod 主要是用来校验数据结构的，比如传入的参数是否符合预期，避免运行时出错。
import { z } from 'zod'
import { PropertyDefinitions } from './propertyDefinitions'

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
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
})

const QuaternionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  w: z.number(),
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
  // 源模型的结构指纹，加载时比对以检测源文件是否已变更（导致 modifications 路径失配）
  modelVersion: z.string().optional(),
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
  cameraPosition: Vec3Schema.optional(),
  cameraQuaternion: QuaternionSchema.optional(),
  // 改场景是否发布，是的话才可以预览查看
  isPublished: z.boolean().default(false)
})

// ── Scene Command Schemas ──────────────────────────────────────────────────────
// 描述 AI 的操作意图；属性修改由执行器转换为 HandleActualCommand。
// AI 只提供目标 ID 和新值，旧值在执行时读取，不暴露任意属性路径或 setter。

/** 从字段表生成判别联合，保留每个 property 与 value 的类型对应关系。 */
function propertyAssignmentSchema<S extends Record<string, { schema: z.ZodTypeAny }>>(definitions: S) {
  type Option = {
    [K in keyof S & string]: z.ZodObject<{ property: z.ZodLiteral<K>; value: S[K]['schema'] }>
  }[keyof S & string]
  const options = Object.entries(definitions).map(([property, definition]) =>
    z.object({ property: z.literal(property), value: definition.schema }),
  )
  // Object.entries 会擦除键的字面量类型；每个分支均由同一字段表的键和值构建。
  return z.discriminatedUnion('property', options as unknown as [Option, ...Option[]])
}

const ObjectPropertyTargetSchema = z.object({
  scope: z.literal('object'),
  objectId: z.string().min(1),
}).strict()

const MaterialPropertyTargetSchema = z.object({
  scope: z.literal('material'),
  objectId: z.string().min(1),
  materialIndex: z.union([z.number().int().nonnegative(), z.literal('all')]).default(0),
  includeDescendants: z.boolean().default(false),
}).strict()

const ScenePropertyTargetSchema = z.object({ scope: z.literal('scene') }).strict()

export const SetPropertyCommandSchema = z.union([
  z.object({ commandType: z.literal('set_property'), target: ObjectPropertyTargetSchema })
    .and(propertyAssignmentSchema(PropertyDefinitions.object)),
  z.object({ commandType: z.literal('set_property'), target: MaterialPropertyTargetSchema })
    .and(propertyAssignmentSchema(PropertyDefinitions.material)),
  z.object({ commandType: z.literal('set_property'), target: ScenePropertyTargetSchema })
    .and(propertyAssignmentSchema(PropertyDefinitions.scene)),
])

const CreateObjectCommandSchema = z.object({
  commandType: z.literal('create'),
  // 对应 AddObjectCommand：需要完整构造出 THREE.Mesh
  objectType: z.enum(['box', 'sphere']),
  name: z.string(),
  position: Vec3Schema.default({ x: 0, y: 0, z: 0 }),
  rotation: Vec3Schema.default({ x: 0, y: 0, z: 0 }), // 单位：弧度
  scale: Vec3Schema.default({ x: 1, y: 1, z: 1 }),
  // 材质 —— 对应 MeshStandardMaterial 构造参数
  color: z.string().default('#ffffff'),             // hex 或 CSS 颜色名
  roughness: z.number().min(0).max(1).default(0.8),
  metalness: z.number().min(0).max(1).default(0),
  opacity: z.number().min(0).max(1).default(1),
  wireframe: z.boolean().default(false),
  // BoxGeometry 可选尺寸（默认 1×1×1）
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  // SphereGeometry 可选参数
  radius: z.number().positive().optional(),
  // 允许与现有物体重叠（跳过自动位置修正）
  allowOverlap: z.boolean().default(false),
})

const DeleteObjectCommandSchema = z.object({
  commandType: z.literal('delete'),
  name: z.string().optional(),
  id: z.string().min(1),
})

const AddModelCommandSchema = z.object({
  commandType: z.literal('add_model'),
  // 从模型库中取出已有模型加入场景（前端异步加载 GLTF 后构造 AddObjectCommand）
  modelName: z.string(),          // 库中模型的名称，必须取自系统提供的模型库清单
  name: z.string().optional(),    // 加入场景后实例的名称，缺省使用 modelName
  position: Vec3Schema.optional(),
  rotation: Vec3Schema.optional(), // 单位：弧度
  scale: Vec3Schema.optional(),    // 相对倍数，作用在尺寸归一化之后；缺省为 1
  // 允许与现有物体重叠（跳过自动位置修正）
  allowOverlap: z.boolean().default(false),
})

const ObjectLifecycleCommandSchema = z.discriminatedUnion('commandType', [
  CreateObjectCommandSchema,
  DeleteObjectCommandSchema,
  AddModelCommandSchema,
])

export const SceneCommandSchema = z.union([SetPropertyCommandSchema, ObjectLifecycleCommandSchema])

/** AI 返回的完整结构：自然语言说明 + 命令列表 */
export const AISceneResponseSchema = z.object({
  explanation: z.string(),
  commands: z.array(SceneCommandSchema),
})

// 从 schema 推导 TypeScript 类型，不重复手写
export type SceneCommand = z.infer<typeof SceneCommandSchema>
export type AISceneResponse = z.infer<typeof AISceneResponseSchema>
export type CreateObjectCommand = z.infer<typeof CreateObjectCommandSchema>
export type DeleteObjectCommand = z.infer<typeof DeleteObjectCommandSchema>
export type AddModelCommand = z.infer<typeof AddModelCommandSchema>
export type SetPropertyCommand = z.infer<typeof SetPropertyCommandSchema>
export type ObjectPropertyName = keyof typeof PropertyDefinitions.object
export type MaterialPropertyName = keyof typeof PropertyDefinitions.material
export type ScenePropertyName = keyof typeof PropertyDefinitions.scene
export type MaterialPropertyTarget = z.infer<typeof MaterialPropertyTargetSchema>
export type vec3Type = z.infer<typeof Vec3Schema>
