import path from 'path'
import { uploadBatch, type UploadTask } from '@/services/upFile'
import type { ProcessAssetType } from '../type'

const __dirname = path.resolve()

/** COS Key 与 Mongo 字段名都不接受任意字符，纹理名统一收敛成安全字符 */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'texture'
}

export type PublishResult = {
  /** 可直接展开进 findByIdAndUpdate 的点号路径更新，只包含上传成功的项 */
  updates: Record<string, unknown>
  /** 上传失败明细 */
  errors: Array<{ key: string; remotePath: string; message: string }>
  /** compressed 是资产本体，它失败即视为致命 */
  fatal: boolean
  total: number
}

/**
 * 把流水线产物（compressed / LOD0-2 / 多分辨率纹理）全部推到 COS。
 * 单个文件失败不会中断其余上传，失败明细原样返回给调用方处理。
 */
export async function publishToCloud(assetId: string, context: ProcessAssetType): Promise<PublishResult> {
  const toAbs = (p: string) => (path.isAbsolute(p) ? p : path.join(__dirname, p))

  const tasks: UploadTask[] = []
  // 同一个本地文件只上传一次（LOD 生成失败时会回退成 compressedPath），别名事后指回源 key
  const aliases: Array<[string, string]> = []

  const addTask = (key: string, localPath: string, remotePath: string) => {
    if (!localPath) return
    const abs = toAbs(localPath)
    const dup = tasks.find((t) => t.localPath === abs)
    if (dup) {
      aliases.push([key, dup.key])
      return
    }
    tasks.push({ key, localPath: abs, remotePath })
  }

  addTask('compressed', context.compressedPath, `assets/compressed/${assetId}.glb`)

  context.lods?.forEach((lodPath, level) => {
    addTask(`lod${level}`, lodPath, `assets/lods/${assetId}_LOD${level}.glb`)
  })

  // context.textures 形如 { 纹理名: { original: 路径, 2048: 路径, ... } }
  for (const [rawTexName, variants] of Object.entries(context.textures ?? {})) {
    if (!variants || typeof variants !== 'object') continue
    const texName = safeName(rawTexName)
    for (const [variant, texPath] of Object.entries(variants)) {
      if (typeof texPath !== 'string') continue
      addTask(`textures.${texName}.${variant}`, texPath, `assets/textures/${assetId}/${texName}_${variant}.png`)
    }
  }

  if (tasks.length === 0) {
    return { updates: {}, errors: [], fatal: false, total: 0 }
  }

  console.log(`[Cloud] 开始上传 ${tasks.length} 个文件到 COS (assetId=${assetId})`)
  const { urls, errors } = await uploadBatch(tasks)

  // 复用去重掉的上传结果
  for (const [key, sourceKey] of aliases) {
    if (urls[sourceKey]) urls[key] = urls[sourceKey]
  }

  // 用点号路径逐项更新，避免整体赋值 cloudUrls 抹掉上传阶段已写入的 thumbnail / file
  const updates: Record<string, unknown> = {}
  const cloudTextures: Record<string, Record<string, string>> = {}

  for (const [key, url] of Object.entries(urls)) {
    if (key.startsWith('textures.')) {
      const [, texName, variant] = key.split('.')
      ;(cloudTextures[texName] ??= {})[variant] = url
    } else {
      updates[`cloudUrls.${key}`] = url
    }
  }
  if (Object.keys(cloudTextures).length > 0) {
    updates['cloudUrls.textures'] = cloudTextures
  }

  return {
    updates,
    errors,
    fatal: errors.some((e) => e.key === 'compressed'),
    total: tasks.length,
  }
}
