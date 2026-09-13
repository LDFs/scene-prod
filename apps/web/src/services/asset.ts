import { AssetWithId, pageType } from '@scene-prod/shared'
import { ASSET_BASE_URL, BASE_URL } from '../../config.js'

export async function uploadAsset(
  file: File,
  thumbnail: Blob | null = null,
): Promise<{ success: boolean; message: string; asset: any }> {
  const formData = new FormData()
  formData.append('file', file)
  if (thumbnail) {
    const thumbnailName = thumbnail instanceof File ? thumbnail.name : `thumbnail_${Date.now()}.png`
    formData.append('thumbnail', thumbnail, thumbnailName)
  }
  try {
    const response = await fetch(`${ASSET_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('上传资产失败:', error)
    return {
      success: false,
      message: '上传资产失败',
      asset: null,
    }
  }
}

export async function getAssets(params: {
  type: string
  page: number
  pageSize: number
}): Promise<{ success: boolean; message: string; assets: AssetWithId[]; pagination: pageType }> {
  try {
    const url = params.type
      ? `${ASSET_BASE_URL}/list?type=${params.type}&page=${params.page}&pageSize=${params.pageSize}`
      : `${ASSET_BASE_URL}/list?page=${params.page}&pageSize=${params.pageSize}`
    const response = await fetch(url)
    const data = await response.json()
    return data
  } catch (error) {
    console.error('获取资产列表失败:', error)
    return {
      success: false,
      message: '获取资产列表失败',
      assets: [],
      pagination: {
        page: 0,
        pageSize: 0,
        total: 0,
        totalPages: 0,
      },
    }
  }
}

export async function getAssetByName(
  type: string,
  name: String,
): Promise<{ success: boolean; message: string; asset: AssetWithId | null }> {
  try {
    const url = `${ASSET_BASE_URL}/get-by-name?type=${type}&name=${name}`
    const response = await fetch(url)
    const data = await response.json()
    return data
  } catch (error) {
    console.error('获取资产失败:', error)
    return {
      success: false,
      message: '获取资产失败',
      asset: null,
    }
  }
}

export async function renameAsset(
  id: string,
  name: string,
): Promise<{ success: boolean; message: string; asset?: AssetWithId }> {
  try {
    const response = await fetch(`${ASSET_BASE_URL}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('重命名资产失败:', error)
    return {
      success: false,
      message: '重命名资产失败',
    }
  }
}

export async function deleteAsset(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${ASSET_BASE_URL}/delete?id=${id}`, {
      method: 'DELETE',
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('删除资产失败:', error)
    return {
      success: false,
      message: '删除资产失败',
    }
  }
}

export async function downloadAsset(id: string, filename: string) {
  const url = `${ASSET_BASE_URL}/download?id=${id}`
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function getProcessingStatus(
  id: string,
): Promise<{ success: boolean; message: string; status: string; warning?: string }> {
  try {
    const response = await fetch(`${ASSET_BASE_URL}/processing-status?id=${id}`)
    const data = await response.json()
    return data
  } catch (error) {
    console.error('获取处理状态失败:', error)
    return {
      success: false,
      message: '获取处理状态失败',
      status: 'unknown',
    }
  }
}

export type ProcessingOutcome = {
  /** 是否处理成功（ready 或无需处理的 skipped） */
  ok: boolean
  status: 'ready' | 'failed' | 'skipped' | 'timeout' | 'unknown'
  message: string
  /**
   * 处理成功但有非致命问题时的说明（ZIP 内多模型只用了一个、OBJ 缺 .mtl 已回落
   * 默认材质、修复了无效顶点值、部分产物未同步到云存储……）。
   * 资产可用，但用户需要知道结果与预期有出入。
   */
  warning?: string
}

/**
 * 轮询等待资产处理完成。
 *
 * 终态（ready / failed / skipped）都通过返回值告知，不用 reject 表达"处理失败"
 * ——那是业务结果而非异常，调用方需要照常拿到失败原因展示给用户。
 *
 * @param interval 轮询间隔，默认 2 秒
 * @param timeout 最长等待时间，默认 5 分钟。Draco 压缩 + LOD 生成 + 纹理优化
 *                在大模型上耗时可达数分钟，超时不代表失败，只是不再等待。
 */
export async function waitForProcessing(
  id: string,
  interval: number = 2000,
  timeout: number = 5 * 60 * 1000,
): Promise<ProcessingOutcome> {
  const deadline = Date.now() + timeout

  while (true) {
    const result = await getProcessingStatus(id)

    if (result.status === 'ready') {
      return { ok: true, status: 'ready', message: result.message, warning: result.warning }
    }
    if (result.status === 'skipped') {
      return { ok: true, status: 'skipped', message: result.message, warning: result.warning }
    }
    if (result.status === 'failed') {
      return { ok: false, status: 'failed', message: result.message }
    }
    // 查询本身失败（网络错误、资产不存在）不重试，直接如实返回
    if (!result.success) {
      return { ok: false, status: 'unknown', message: result.message }
    }
    if (Date.now() + interval >= deadline) {
      return {
        ok: false,
        status: 'timeout',
        message: '处理时间较长，请稍后刷新列表查看结果',
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

export function getAssetUrl(asset: AssetWithId): string {
  if (!asset.url) return ''
  // 补全后端 base URL，避免 loadGLTFModel 向前端 dev server 请求
  return asset.url.startsWith('http') ? asset.url : `${BASE_URL}${asset.url}`
}

export function getModelUrl(asset: AssetWithId): string {
  if (asset.cloudUrls?.compressed) {
    if (asset.cloudUrls?.compressed.startsWith('http')) return asset.cloudUrls?.compressed
    return 'https://' + asset.cloudUrls.compressed
  }
  if (asset.processingStatus === 'ready' && asset.processedFiles?.compressed) {
    return `${BASE_URL}${asset.processedFiles.compressed}`
  }
  return getAssetUrl(asset)
}

/**
 * 获取 LOD 模型 URL
 * @param asset
 * @param lod LOD 级别，0 1 2
 * @returns LOD 模型 URL
 */
export function getLodUrl(asset: AssetWithId, lod: number): string {
  const lodKey = `lod${lod}` as 'lod0' | 'lod1' | 'lod2'

  // 优先走云存储
  const cloudUrl = asset.cloudUrls?.[lodKey]
  if (cloudUrl) {
    return cloudUrl.startsWith('http') ? cloudUrl : 'https://' + cloudUrl
  }

  if (asset.processingStatus !== 'ready' || !asset.processedFiles) {
    return ''
  }
  const lodPath = asset.processedFiles[lodKey]
  if (lodPath) {
    return `${BASE_URL}${lodPath}`
  }
  return ''
}
