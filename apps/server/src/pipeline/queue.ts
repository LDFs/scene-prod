import Bull from 'bull'

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')

export const assetQueue = new Bull("asset-processing", {
  redis: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    password: process.env.PASSWORD || ''
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {type: 'exponential', delay: 1000},
    removeOnComplete: 100,
    removeOnFail: 50
  }
})

// 队列事件监听
assetQueue.on('completed', (job, result) => {
  console.log(`[Pipeline] 任务完成: ${job.id}`);
});

assetQueue.on('failed', (job, err) => {
  console.error(`[Pipeline] 任务失败: ${job.id}`, err.message);
});

assetQueue.on('error', (error) => {
  console.error('[Pipeline] 队列错误:', error);
});
