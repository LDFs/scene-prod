export type AssetType = 'model' | 'texture' | 'hdri' | 'effect' | 'tileset'

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'skipped'

export type Asset = {
  name: string
  originalName: string
  type: AssetType
  format: string
  filePath?: string
  fileSize?: number
  url?: string
  thumbnail?: string
  metadata?: Record<string, unknown>

  // 3D Tiles (Tileset) 专用
  tilesetUrl?: string

  // 流水线处理
  processingStatus?: ProcessingStatus
  processingError?: string
  processedFiles?: {
    compressed?: string
    lod0?: string
    lod1?: string
    lod2?: string
    textures?: {
      original?: string
      '2k'?: string
      '1k'?: string
      '512'?: string
    }
  }

  // 云端路径 (又拍云 CDN)
  cloudUrls?: {
    compressed?: string
    thumbnail?: string
    file?: string
  }

  // 预计算边界数据
  bounds?: {
    box?: {
      min: { x: number; y: number; z: number }
      max: { x: number; y: number; z: number }
    }
    sphere?: {
      center: { x: number; y: number; z: number }
      radius: number
    }
  }

  // 模型统计信息
  stats?: {
    triangleCount?: number
    vertexCount?: number
    materialCount?: number
    textureCount?: number
  }
}

export type AssetWithId = Asset & {
  _id: string
}