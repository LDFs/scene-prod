/**
 * 上传文件到云服务器
 */
import COS from 'cos-nodejs-sdk-v5'
import fs from 'fs'

const BUCKET = 'scene-prod-1324477319'
const REGION = 'ap-guangzhou'

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KRY,
})

/** 文件不存在等不可重试的错误，标记后跳过退避重试 */
class NonRetryableUploadError extends Error {
  readonly nonRetryable = true
}

/* 自己封装的上传方法 */
async function uploadFile(filePath: string, filename: string): Promise<COS.UploadFileResult> {
  const Key = filename.replace(/^\/+/, '')

  if (!fs.existsSync(filePath)) {
    throw new NonRetryableUploadError(`本地文件不存在，无法上传: ${filePath}`)
  }

  return new Promise((resolve, reject) => {
    cos.uploadFile(
      {
        Bucket: BUCKET, // 填入您自己的存储桶，必须字段
        Region: REGION, // 存储桶所在地域，例如 ap-beijing，必须字段
        Key, // 存储在桶中的文件键；必须字段
        FilePath: filePath, // 必须
        ACL: 'public-read', // 👈 对象设为公有读
        SliceSize: 1024 * 1024 * 5, // 触发分块上传的阈值，超过5MB使用分块上传，非必须
      },
      function (err, data) {
        if (err) {
          reject(err instanceof Error ? err : new Error(err.message || JSON.stringify(err)))
        } else {
          console.log(`[COS] 上传成功: ${Key} → ${data.Location}`)
          resolve(data)
        }
      },
    )
  })
}

/**
 * 带指数退避重试的上传。重试耗尽后抛出最后一次的错误，绝不静默失败。
 * 文件不存在这类不可重试的错误会立即抛出。
 */
async function uploadFileWithRetry(filePath: string, remotePath: string, retries = 2): Promise<COS.UploadFileResult> {
  let lastError: Error = new Error('未知上传错误')

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await uploadFile(filePath, remotePath)
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (err?.nonRetryable) break
      if (attempt < retries) {
        const delay = 500 * 2 ** attempt
        console.warn(`[COS] 上传失败，${delay}ms 后重试 (${attempt + 1}/${retries}) ${remotePath}: ${lastError.message}`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastError
}

type UploadTask = {
  /** 结果映射用的逻辑键，例如 'compressed' / 'lod1' / 'textures.diffuse.1024' */
  key: string
  localPath: string
  remotePath: string
}

type UploadBatchResult = {
  /** key → COS Location，只包含上传成功的 */
  urls: Record<string, string>
  /** 上传失败的明细，调用方负责决定是否致命 */
  errors: Array<{ key: string; remotePath: string; message: string }>
}

/**
 * 并发批量上传。单个文件失败不影响其他文件，全部结果（含失败明细）一并返回，
 * 由调用方判断哪些失败是致命的。
 */
async function uploadBatch(tasks: UploadTask[], concurrency = 4): Promise<UploadBatchResult> {
  const urls: Record<string, string> = {}
  const errors: UploadBatchResult['errors'] = []

  let cursor = 0
  const worker = async () => {
    // 遍历所有任务
    while (cursor < tasks.length) {
      const task = tasks[cursor++]
      try {
        const res = await uploadFileWithRetry(task.localPath, task.remotePath)
        urls[task.key] = res.Location
      } catch (err: any) {
        errors.push({ key: task.key, remotePath: task.remotePath, message: err?.message ?? String(err) })
      }
    }
  }

  // 将所有任务分成 min(concurrency, tasks.length) 份
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return { urls, errors }
}

/**
 * 从完整 URL 或路径中提取 COS 对象键
 * 例如: https://xxx.com/assets/compressed/xxx.glb
 *  ->  assets/compressed/xxx.glb
 */
function extractCosKey(urlOrKey: string): string {
  if (!urlOrKey) return ''
  let pathname = urlOrKey
  // 没有协议头时（如 host/assets/...）补上 https:// 再解析，否则 new URL 会抛错
  const normalized = /^https?:\/\//i.test(urlOrKey) ? urlOrKey : 'https://' + urlOrKey
  try {
    // 带域名的 URL，取 pathname 部分
    pathname = new URL(normalized).pathname
  } catch {
    // 仍不是合法 URL，按原样当作 key/路径处理
  }
  // 去掉前导斜杠，并对编码字符解码（COS Key 需要原始字符）
  pathname = pathname.replace(/^\/+/, '')
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // 解码失败则保留原值
  }
  return pathname
}

function deleteSingleObject(Key: string) {
  cos.deleteObject(
    {
      Bucket: BUCKET,
      Region: REGION,
      Key, // 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
    },
    function (err, data) {
      // 注意：COS DeleteObject 幂等，键不存在也返回 204，err 为 null 不代表确实删除了文件
      console.log(`删除结果(Key=${Key})：err:`, err, 'data:', data)
    },
  )
}

function deleteObject(urlOrKey: string) {
  const Key = extractCosKey(urlOrKey)
  if (!Key) {
    console.warn('[deleteObject] 无效的对象键，跳过删除:', urlOrKey)
    return
  }
  deleteSingleObject(Key)
}

export { uploadFile, uploadFileWithRetry, uploadBatch, deleteObject, extractCosKey }
export type { UploadTask, UploadBatchResult }
