export type ProcessAssetType = {
  gltfPath: string
  inputPath: string
  assetId: string
  compressedPath: string
  originalName: string
  bounds: {
    box: {
      min: {
        x: number
        y: number
        z: number
      }
      max: {
        x: number
        y: number
        z: number
      }
    }
    sphere: {
      center: {
        x: number
        y: number
        z: number
      }
      radius: number
    }
  } | null
  stats:  {
    triangleCount: number,
    vertexCount: number
    materialCount: number,
    textureCount: number,
  } | null,
  textures: {},
  lods: null,
  tempDir: ''
}
