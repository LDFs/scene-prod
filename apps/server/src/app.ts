// TODO: Fastify 实例初始化，注册插件与路由
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'
import connectDB from './plugins/db'
import projectRoutes from './routes/project'
import assetRoutes from './routes/asset'

const app = Fastify({ logger: true })
const __dirname = dirname(fileURLToPath(import.meta.url))


await connectDB()

await app.register(cors, {
  origin: ['http://localhost:5273', 'http://127.0.0.1:5273'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

await app.register(multipart, {
  limits: {
    fileSize: 1024 * 1024 * 50, // 50MB
  },
})

// 静态文件服务，用来访问上传了的静态资源
await app.register(staticFiles, {
  root: path.join(__dirname, '..', 'uploads'),
  prefix: '/uploads/',
})

await projectRoutes(app)
await assetRoutes(app)
app.get('/health', async () => ({ ok: true }))

const port = Number(process.env.PORT ?? 3100)
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
