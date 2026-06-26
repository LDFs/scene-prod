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
        Key: filename, // 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
        FilePath: filePath, // 必须
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

// function myDelete() {

//   cos.deleteObject({

//   });
// }

export { uploadFile }
