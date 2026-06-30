/**
 * 上传文件到云服务器
 */
import COS from 'cos-nodejs-sdk-v5'

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KRY,
})

/* 自己封装的上传方法 */
async function uploadFile(filePath: string, filename: string): Promise<COS.UploadFileResult> {
  return new Promise((resolve, reject) => {
    cos.uploadFile(
      {
        Bucket: 'scene-prod-1324477319', // 填入您自己的存储桶，必须字段
        Region: 'ap-guangzhou', // 存储桶所在地域，例如 ap-beijing，必须字段
        Key: filename.replace(/^\/+/, ''), // 存储在桶中的文件键；必须字段
        FilePath: filePath, // 必须
        ACL: 'public-read', // 👈 对象设为公有读
        SliceSize: 1024 * 1024 * 5, // 触发分块上传的阈值，超过5MB使用分块上传，非必须
        onTaskReady: function (taskId) {
          // 非必须
          console.log(taskId)
        },
        onProgress: function (progressData) {
          // 非必须
          console.log(JSON.stringify(progressData))
        },
        // 支持自定义 headers 非必须
        Headers: {
          'x-cos-meta-test': 123,
        },
        onFileFinish: function (err, data, options) {
          console.log(options.Key + '上传' + (err ? '失败' : '完成'), data)
        },
      },
      function (err, data) {
        if (err) {
          console.log('上传失败', err)
          reject(err)
        } else {
          console.log('上传成功', data)
          resolve(data)
        }
      },
    )
  })
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
      Bucket: 'scene-prod-1324477319',
      Region: 'ap-guangzhou',
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

export { uploadFile, deleteObject, extractCosKey }
