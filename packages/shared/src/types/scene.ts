import type { Object3D, Vector3, Euler, Color } from 'three'

export type SerializedObject = {
  id: string
  type: string
  name: string
  url: string
  sceneId: string
  visible: boolean
  position: { x: number, y: number, z: number }
  rotation: { x: number, y: number, z: number }
  scale: { x: number, y: number, z: number }
  modificationTime?: number
  modifications?: Record<string, any>
  geometry?: {
    type: string
    parameters: Record<string, any>
  }
  material?: Record<string, any>
}

export type SceneData = {
  name: string
  description: string
  cameraFar: number
  lastModified: Date
  objectCount: number
  environmentUrl: string
  gisConfig?: Record<string, any> | null
  objects: SerializedObject[]
  sceneId: string
  thumbnail?: String
  cloudUrls?: string
  backgroundColor: string
  ambientIntensity: number
}

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