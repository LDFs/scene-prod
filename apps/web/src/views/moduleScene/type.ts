

export type CameraOptions = {
  initPosition: {
    x: number,
    y: number,
    z: number
  }
}

export interface Tickable {
  tick: (delta: number) => void
}

export type AssetItem = {
  path: string
  type: string
  id: string
}