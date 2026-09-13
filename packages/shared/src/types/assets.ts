
export type AssetType = 'model' | 'texture' | 'effect' | 'tileset' | 'material'

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
  /**
   * 处理成功（status 为 ready）但有非致命问题时的说明，多条以「；」连接。
   * 例：ZIP 内有多个模型只用了其中一个、OBJ 缺 .mtl 已回落默认材质、
   * 修复了无效顶点值、部分产物未同步到云存储。
   *
   * 与 processingError 分开：那个字段代表"资产不可用"，这个代表"能用但有瑕疵"。
   */
  processingWarning?: string
  processedFiles?: {
    compressed?: string
    lod0?: string
    lod1?: string
    lod2?: string
    // 纹理名 → { original | '2048' | '1024' | '512' } → 路径
    textures?: Record<string, Record<string, string>>
  }

  // 云端路径 (腾讯云 COS)
  cloudUrls?: {
    compressed?: string
    thumbnail?: string
    file?: string
    lod0?: string
    lod1?: string
    lod2?: string
    // 与 processedFiles.textures 同构，值为 COS 地址
    textures?: Record<string, Record<string, string>>
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
    // 各轴尺寸 (max - min)，文件原始单位
    dimensions?: { x: number; y: number; z: number }
    // 最长边，用于尺寸归一化的参考量
    longestEdge?: number
  }

  // 尺寸归一化：把模型换算到米的缩放因子及其来源
  sizing?: {
    normalizeScale: number // 实例化进场景时乘到模型根 scale 上，使其落在米制
    unitGuess: string // 猜测的原始单位：'m' | 'cm' | 'mm' | 'unknown'
    source: 'heuristic' | 'manual' | 'category' // 来源；manual/category 可覆盖 heuristic
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

export type pageType = {
  page: number, pageSize: number, total: number, totalPages: number
}