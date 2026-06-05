import type { Object3D, Vector3, Euler, Color } from 'three'
import { z } from 'zod'
import { SerializedObjectSchema, SceneDataSchema } from '../schema'

export type SerializedObject = z.infer<typeof SerializedObjectSchema>

export type SceneData = z.infer<typeof SceneDataSchema>

export type SceneMetadata = Omit<SceneData, 'objects'>

export type SceneResponse = {
  objects: SerializedObject[]
  metadata: SceneMetadata
}

export type ObjectState = {
  position: Vector3
  rotation: Euler
  scale: Vector3
}

export type MaterialState = {
  color: Color
  roughness: number
  metalness: number
  emissive: Color
  emissiveIntensity: number
  opacity: number
  alphaTest: number
  blending: number
  side: number
  transparent: boolean
  depthTest: boolean
  depthWrite: boolean
  vertexColors: boolean
  wireframe: boolean
  flatShading: boolean
}

export type PropertyType = {
  name: string
  visible: boolean
}