import type { Vector3, Euler } from 'three'
import type { z } from 'zod'
import type { SerializedObjectSchema, SceneDataSchema } from '../schema'

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
