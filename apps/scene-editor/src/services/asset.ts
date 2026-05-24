import { AssetWithId } from '@scene-prod/shared'
import { ASSET_BASE_URL, BASE_URL } from '../../config.js'

export async function uploadAsset(file: File, thumbnail: Blob | null = null): Promise<{ success: boolean, message: string, asset: any }> {
  const formData = new FormData()
  formData.append('file', file)
  if (thumbnail) {
    const thumbnailName = thumbnail instanceof File ? thumbnail.name : `thumbnail_${Date.now()}.png`
    formData.append('thumbnail', thumbnail, thumbnailName)
  }
  try {

    const response = await fetch(`${ASSET_BASE_URL}/upload`, {
      method: 'POST',
      body: formData
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('上传资产失败:', error)
    return {
      success: false,
      message: '上传资产失败',
      asset: null
    }
  }
}

export async function getAssets(type: string): Promise<{ success: boolean, message: string, assets: AssetWithId[] }> {
  try {
    const url = type ? `${ASSET_BASE_URL}/list?type=${type}` : `${ASSET_BASE_URL}/list`;
    const response = await fetch(url)
    const data = await response.json()
    return data
  } catch (error) {
    console.error('获取资产列表失败:', error)
    return {
      success: false,
      message: '获取资产列表失败',
      assets: []
    }
  }
}

export async function deleteAsset(id: string): Promise<{ success: boolean, message: string }> {
  try {
    const response = await fetch(`${ASSET_BASE_URL}/delete?id=${id}`, {
      method: 'DELETE'
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('删除资产失败:', error)
    return {
      success: false,
      message: '删除资产失败'
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

export async function getProcessingStatus(id: string): Promise<{ success: boolean, message: string, status: string }> {
  try {
    const response = await fetch(`${ASSET_BASE_URL}/processing-status?id=${id}`)
    const data = await response.json()
    return data
  } catch (error) {
    console.error('获取处理状态失败:', error)
    return {
      success: false,
      message: '获取处理状态失败',
      status: 'unknown'
    }
  }
}

/**
 * 等待资产处理完成
 * @param id 资产ID
 * @param interval 检查间隔时间，默认2秒
 * @param maxAttempts 最大尝试次数，默认10次
 * @returns 处理结果
 */
export async function waitForProcessing(id: string, interval: number = 2000, maxAttempts: number = 10): Promise<{ success: boolean, message: string, status: string }> {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = async () => {
      attempts++
      try {
        const result = await getProcessingStatus(id)
        if(result.status === 'ready') {
          resolve(result)
        } else if(result.status === 'failed') {
          reject(new Error(result.message))
        } else if(attempts >= maxAttempts) {
          reject(new Error('处理超时'))
        } else {
          setTimeout(check, interval)
        }
      } catch (error) {
        reject(error)
      }
    }

    check()
  })
}

export function getAssetUrl(asset: AssetWithId): string {
  if (!asset.url) return ''
  // 补全后端 base URL，避免 loadGLTFModel 向前端 dev server 请求
  return asset.url.startsWith('http') ? asset.url : `${BASE_URL}${asset.url}`
}

export function getModelUrl(asset: AssetWithId): string {
  if(asset.cloudUrls?.compressed) {
    return asset.cloudUrls.compressed
  }
  if(asset.processingStatus === 'ready' && asset.processedFiles?.compressed) {
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
  if(asset.processingStatus !== 'ready' || !asset.processedFiles) {
    return ''
  }
  const lodKey = `lod${lod}`
  const lodPath = asset.processedFiles[lodKey as keyof typeof asset.processedFiles]
  if(lodPath) {
    return `${BASE_URL}${lodPath}`
  }
  return ''
}