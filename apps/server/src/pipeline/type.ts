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
    dimensions: {
      x: number
      y: number
      z: number
    }
    longestEdge: number
  } | null
  stats:  {
    triangleCount: number,
    vertexCount: number
    materialCount: number,
    textureCount: number,
  } | null,
  // 形如 { 纹理名: { original: 路径, '2048': 路径, '1024': 路径, '512': 路径 } }
  textures: Record<string, Record<string, string>>,
  lods: Array<string> | null,
  tempDir: string,
  originalFormat: string
}
