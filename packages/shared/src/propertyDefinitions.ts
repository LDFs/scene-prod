import { z } from 'zod'
import type * as THREE from 'three'
import type { SceneMetadata } from './types/scene'

export interface PropertyChangeHooks {
  onObjectChange?: () => void
  onMaterialChange?: () => void
  onSceneChange?: () => void
}

/** 由调用方决定如何保存和执行变更，shared 不依赖命令类。 */
export interface PropertyChangeFactory<Result> {
  <State>(oldValue: State, newValue: State, setter: (value: State) => void): Result
}

export interface PropertyDefinition<Target, Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: Schema
  description: string
  createChange<Result>(
    target: Target, rawValue: unknown, hooks: PropertyChangeHooks, create: PropertyChangeFactory<Result>,
  ): Result
}

interface DefinitionOptions<Target, Schema extends z.ZodTypeAny, State> {
  schema: Schema
  description: string
  read: (target: Target) => State
  fromValue: (target: Target, value: z.output<Schema>) => State
  write: (target: Target, value: State) => void
  after?: (target: Target, hooks: PropertyChangeHooks) => void
  validate?: (target: Target, value: State) => void
}

function defineProperty<Target>() {
  return <Schema extends z.ZodTypeAny, State>(
    options: DefinitionOptions<Target, Schema, State>,
  ): PropertyDefinition<Target, Schema> => ({
    schema: options.schema,
    description: options.description,
    createChange<Result>(target: Target, rawValue: unknown, hooks: PropertyChangeHooks, create: PropertyChangeFactory<Result>): Result {
      const value = options.schema.parse(rawValue)
      const newValue = options.fromValue(target, value)
      options.validate?.(target, newValue)
      const oldValue = options.read(target)
      return create(oldValue, newValue, (next) => {
        options.validate?.(target, next)
        options.write(target, next)
        options.after?.(target, hooks)
      })
    },
  })
}

/** 普通标量属性只需声明字段、schema 和说明，读写及快照规则由此处统一提供。 */
function fieldProperty<Target, Fields, K extends keyof Fields, Schema extends z.ZodType<Fields[K]>>(
  fields: (target: Target) => Fields,
  key: K,
  schema: Schema,
  description: string,
  after?: (target: Target, hooks: PropertyChangeHooks) => void,
  validate?: (target: Target, value: Fields[K]) => void,
): PropertyDefinition<Target, Schema> {
  return defineProperty<Target>()<Schema, Fields[K]>({
    schema, description,
    read: (target) => fields(target)[key],
    // Schema 的输出已由泛型约束限定为该字段类型。
    fromValue: (_, value) => value as Fields[K],
    write: (target, value) => { fields(target)[key] = value },
    after, validate,
  })
}

function objectField<K extends keyof THREE.Object3D, Schema extends z.ZodType<THREE.Object3D[K]>>(
  key: K, schema: Schema, description: string,
) {
  return fieldProperty((object: THREE.Object3D) => object, key, schema, description,
    (_, hooks) => hooks.onObjectChange?.())
}

function transformField(key: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z') {
  const description = key === 'rotation'
    ? '有限数值，绝对旋转角度，单位为弧度。'
    : key === 'position' ? '有限数值，绝对局部坐标。' : '有限数值，绝对缩放倍数。'
  return fieldProperty((object: THREE.Object3D) => object[key], axis, z.number().finite(), description, (object, hooks) => {
    object.userData[`${key}Modified`] = true
    hooks.onObjectChange?.()
  })
}

export interface MaterialPropertyContext {
  material: THREE.MeshStandardMaterial
  owners: readonly THREE.Mesh[]
}

function materialChanged(target: MaterialPropertyContext, hooks: PropertyChangeHooks) {
  target.material.needsUpdate = true
  for (const owner of target.owners) owner.userData.materialModified = true
  hooks.onMaterialChange?.()
}

function materialField<K extends keyof THREE.MeshStandardMaterial, Schema extends z.ZodType<THREE.MeshStandardMaterial[K]>>(
  key: K, schema: Schema, description: string,
) {
  return fieldProperty((target: MaterialPropertyContext) => target.material, key, schema, description, materialChanged)
}

const HexColorSchema = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i, '颜色应为 #RGB 或 #RRGGBB')

function materialColor(key: 'color' | 'emissive', description: string) {
  return defineProperty<MaterialPropertyContext>()({
    schema: HexColorSchema, description,
    read: (target) => target.material[key].clone(),
    fromValue: (target, value) => target.material[key].clone().set(value),
    write: (target, value) => { target.material[key].copy(value) },
    after: materialChanged,
  })
}

/** 场景渲染能力由 core 注入，描述表不引用 SceneManager、Vue 或 Pinia。 */
export interface ScenePropertyContext {
  metadata: SceneMetadata
  runtime: {
    setAmbientLight: (color: string, intensity: number) => void
    setCameraFar: (far: number) => void
    getCameraNear: () => number
  }
}

function sceneField<K extends keyof SceneMetadata, Schema extends z.ZodType<SceneMetadata[K]>>(
  key: K, schema: Schema, description: string,
  apply?: (target: ScenePropertyContext) => void,
  validate?: (target: ScenePropertyContext, value: SceneMetadata[K]) => void,
) {
  return fieldProperty((target: ScenePropertyContext) => target.metadata, key, schema, description, (target, hooks) => {
    apply?.(target)
    target.metadata.lastModified = new Date()
    hooks.onSceneChange?.()
  }, validate)
}

function applySceneLighting({ runtime, metadata }: ScenePropertyContext) {
  runtime.setAmbientLight(metadata.backgroundColor, metadata.ambientIntensity)
}

/** 新增属性在此声明一次，schema、LLM 说明和运行时行为均使用同一份定义。 */
export const PropertyDefinitions = {
  object: {
    name: objectField('name', z.string(), '字符串，对象的新名称。'),
    visible: objectField('visible', z.boolean(), '布尔值，控制对象是否可见。'),
    'position.x': transformField('position', 'x'),
    'position.y': transformField('position', 'y'),
    'position.z': transformField('position', 'z'),
    'rotation.x': transformField('rotation', 'x'),
    'rotation.y': transformField('rotation', 'y'),
    'rotation.z': transformField('rotation', 'z'),
    'scale.x': transformField('scale', 'x'),
    'scale.y': transformField('scale', 'y'),
    'scale.z': transformField('scale', 'z'),
  },
  material: {
    color: materialColor('color', '十六进制颜色字符串，#RGB 或 #RRGGBB。'),
    emissive: materialColor('emissive', '自发光颜色，十六进制字符串，#RGB 或 #RRGGBB。'),
    roughness: materialField('roughness', z.number().min(0).max(1), '数值，粗糙度，范围 0～1。'),
    metalness: materialField('metalness', z.number().min(0).max(1), '数值，金属度，范围 0～1。'),
    opacity: materialField('opacity', z.number().min(0).max(1), '数值，不透明度，范围 0～1；半透明还需设置 transparent 为 true。'),
    emissiveIntensity: materialField('emissiveIntensity', z.number().finite().min(0), '有限数值，自发光强度，不小于 0。'),
    alphaTest: materialField('alphaTest', z.number().min(0).max(1), '数值，透明度裁剪阈值，范围 0～1。'),
    blending: materialField('blending', z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), '整数，混合模式，范围 0～5。'),
    side: materialField('side', z.union([z.literal(0), z.literal(1), z.literal(2)]), '整数，0 为正面，1 为背面，2 为双面。'),
    wireframe: materialField('wireframe', z.boolean(), '布尔值，是否显示线框。'),
    flatShading: materialField('flatShading', z.boolean(), '布尔值，是否使用平面着色。'),
    transparent: materialField('transparent', z.boolean(), '布尔值，是否启用透明渲染。'),
    depthTest: materialField('depthTest', z.boolean(), '布尔值，是否进行深度测试。'),
    depthWrite: materialField('depthWrite', z.boolean(), '布尔值，是否写入深度缓冲。'),
    vertexColors: materialField('vertexColors', z.boolean(), '布尔值，是否使用顶点颜色。'),
  },
  scene: {
    name: sceneField('name', z.string(), '字符串，当前场景的新名称。'),
    description: sceneField('description', z.string(), '字符串，当前场景的描述。'),
    backgroundColor: sceneField('backgroundColor', HexColorSchema, '背景色，十六进制字符串，#RGB 或 #RRGGBB。', applySceneLighting),
    ambientIntensity: sceneField('ambientIntensity', z.number().finite().nonnegative(), '有限数值，环境光强度，不小于 0。', applySceneLighting),
    cameraFar: sceneField('cameraFar', z.number().finite().positive(), '有限正数，相机远裁剪距离，必须大于当前近裁剪距离。', ({ runtime, metadata }) => {
      runtime.setCameraFar(metadata.cameraFar)
    }, ({ runtime }, value) => {
      if (value <= runtime.getCameraNear()) throw new Error('相机远裁剪距离必须大于近裁剪距离')
    }),
  },
}

export function describeProperties(definitions: Record<string, { description: string }>): string {
  return Object.entries(definitions).map(([property, definition]) => `  - ${property}: ${definition.description}`).join('\n')
}
