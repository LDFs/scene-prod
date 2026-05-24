// TODO: 资产上传 / 列表（/api/g3d/assets），依赖 @fastify/multipart
import type { FastifyInstance } from 'fastify'
import { getAssets, getAssetById, deleteAsset, downloadAsset, uploadAsset } from '../controllers/assetController'

export default async function assetRoutes(fastify: FastifyInstance) {
  fastify.post('/api/scene-prod/assets/upload', uploadAsset)
  fastify.get('/api/scene-prod/assets/list', getAssets)
  fastify.get('/api/scene-prod/assets/get', getAssetById)
  fastify.delete('/api/scene-prod/assets/delete', deleteAsset)
  fastify.get('/api/scene-prod/assets/download', downloadAsset)
  // fastify.get('/api/scene-prod/assets/processing-status', getProcessingStatus)
}
