// TODO: 用 zod 定义与 types.ts 对应的运行时校验 schema
// zod 主要是用来校验数据结构的，比如传入的参数是否符合预期，避免运行时出错。
import { cameraPosition } from 'three/tsl'
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
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
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
  cameraPosition: Vec3Schema.optional(),
  // 改场景是否发布，是的话才可以预览查看
  isPublished: z.boolean().default(false)
})

// ── Scene Command Schemas ──────────────────────────────────────────────────────
// 与 packages/core/src/commands/CommandFactory.ts 中各 Command 类一一对应。
// 前端执行器根据 commandType 分派到对应的 Command 类，AI 只需填充这些字段。

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
  // 对应 DeleteObjectCommand：按名称定位对象
  name: z.string(),
})

const TransformObjectCommandSchema = z.object({
  commandType: z.literal('transform'),
  // 对应 TransformObjectCommand：executor 负责读取旧状态，AI 只给新状态
  name: z.string(),
  position: Vec3Schema.optional(), // 绝对坐标，不填则不改
  rotation: Vec3Schema.optional(), // 绝对弧度，不填则不改
  scale: Vec3Schema.optional(),    // 绝对缩放，不填则不改
})

const ModifyMaterialCommandSchema = z.object({
  commandType: z.literal('modify_material'),
  // 对应 MaterialObjectCommand：只列出 AI 常用子集，executor 填充其余字段默认值
  name: z.string(),
  color: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  emissiveColor: z.string().optional(),
  emissiveIntensity: z.number().min(0).optional(),
  wireframe: z.boolean().optional(),
  flatShading: z.boolean().optional(),
  transparent: z.boolean().optional(),
})

const ModifyPropertyCommandSchema = z.object({
  commandType: z.literal('modify_property'),
  // 对应 PropertiyBaseCommand：name/visible
  name: z.string(),
  newName: z.string().optional(),
  visible: z.boolean().optional(),
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

export const SceneCommandSchema = z.discriminatedUnion('commandType', [
  CreateObjectCommandSchema,
  DeleteObjectCommandSchema,
  TransformObjectCommandSchema,
  ModifyMaterialCommandSchema,
  ModifyPropertyCommandSchema,
  AddModelCommandSchema,
])

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
export type TransformObjectCommand = z.infer<typeof TransformObjectCommandSchema>
export type ModifyMaterialCommand = z.infer<typeof ModifyMaterialCommandSchema>
export type ModifyPropertyCommand = z.infer<typeof ModifyPropertyCommandSchema>
export type AddModelCommand = z.infer<typeof AddModelCommandSchema>
export type vec3Type = z.infer<typeof Vec3Schema>