// TODO: Project CRUD（GET/POST/PUT/DELETE /api/scene-prod/projects）
import type { FastifyInstance } from 'fastify'
import { getScenes, createScene, deleteScene, saveScene, loadScene } from '../controllers/projectController'

export default async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/api/scene-prod/scene/list', getScenes)
  fastify.post('/api/scene-prod/scene/create', createScene)
  fastify.delete('/api/scene-prod/scene/delete', deleteScene)
  fastify.post('/api/scene-prod/scene/save', saveScene)
  fastify.get('/api/scene-prod/scene/load', loadScene)
}
