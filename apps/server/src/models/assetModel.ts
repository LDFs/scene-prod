import mongoose from 'mongoose'
import type { Asset } from '@scene-prod/shared'

/**
 * 资产数据模型
 * 字段定义以 @scene-prod/shared 中的 Asset 类型为准，两者通过泛型绑定保持同步
 */
const AssetSchema = new mongoose.Schema<Asset>({
  name: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['model', 'texture', 'effect', 'tileset', 'material'], // 资产类型
    default: 'model'
  },
  format: {
    type: String,
    required: true // 例如: gltf, glb, jpg, hdr 等
  },
  filePath: {
    type: String,
    required: false // tileset 类型可能没有本地路径（外部 URL 注册）
  },
  fileSize: {
    type: Number,
    required: false // tileset 不记录文件大小
  },
  url: {
    type: String,
    required: false // tileset 使用 tilesetUrl
  },
  thumbnail: {
    type: String // 缩略图 URL（可选）
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed // 额外的元数据
  },

  // ========== 3D Tiles (Tileset) 专用字段 ==========

  // tileset.json 的访问 URL (本地或外部)
  tilesetUrl: {
    type: String // 例如: https://example.com/tileset.json 或 /data/tilesets/xxx/tileset.json
  },

  // ========== 流水线处理相关字段 ==========

  // 处理状态
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed', 'skipped'],
    default: 'skipped' // 默认跳过，兼容旧数据
  },
  processingError: {
    type: String // 处理失败时的错误信息
  },
  processingWarning: {
    // 处理成功但有非致命问题时的说明：ZIP 内多模型只用了一个、OBJ 缺 MTL 已回落
    // 默认材质、修复了 nan 顶点值等。与 processingError 分开，避免"能用但有瑕疵"
    // 和"彻底失败"混在一个字段里
    type: String
  },

  // 处理后的输出文件 (本地相对路径)
  processedFiles: {
    compressed: String,      // 压缩后的 GLB 文件路径
    lod0: String,            // LOD0 高精度
    lod1: String,            // LOD1 中精度
    lod2: String,            // LOD2 低精度
    // 纹理名 → { original | 2048 | 1024 | 512 } → 路径，键不固定故用 Mixed
    textures: mongoose.Schema.Types.Mixed
  },

  // 云端绝对路径 (腾讯云 COS)
  cloudUrls: {
    compressed: String,      // COS compressed GLB URL
    thumbnail: String,       // COS 缩略图 URL
    file: String,            // COS 原始文件 URL (HDRI/贴图)
    lod0: String,            // COS LOD0 URL
    lod1: String,            // COS LOD1 URL
    lod2: String,            // COS LOD2 URL
    // 与 processedFiles.textures 同构，值为 COS 地址
    textures: mongoose.Schema.Types.Mixed
  },

  // 预计算边界数据
  bounds: {
    box: {
      min: { x: Number, y: Number, z: Number },
      max: { x: Number, y: Number, z: Number }
    },
    sphere: {
      center: { x: Number, y: Number, z: Number },
      radius: Number
    },
    dimensions: { x: Number, y: Number, z: Number }, // 各轴尺寸 (max - min)
    longestEdge: Number                              // 最长边，尺寸归一化参考
  },

  // 尺寸归一化
  sizing: {
    normalizeScale: Number,
    unitGuess: String,
    source: { type: String, enum: ['heuristic', 'manual', 'category'] }
  },

  // 模型统计信息
  stats: {
    triangleCount: Number,
    vertexCount: Number,
    materialCount: Number,
    textureCount: Number
  }
}, {
  timestamps: true
});

const AssetModel = mongoose.model('Asset', AssetSchema)
export { AssetModel }
