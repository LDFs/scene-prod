// TODO: 数据库管理器，管理数据库的连接和查询

import type { SceneData, SceneResponse } from '@scene-prod/shared'

export class DBManager {
  private apiBaseURL: string = ''
  constructor(url: string) {
    this.apiBaseURL = url || 'http://localhost:3001/api/scene-prod'
  }

  /**
   * 初始化数据库
   * 对于 API 模式，这里只是占位符
   * @returns 是否成功
   */
  async init() {
    return true
  }

  /**
   * 保存场景
   * @param sceneData 场景数据
   * @returns 是否成功
   */
  async saveScene(sceneData: SceneData) {
    try {
      const response = await fetch(`${this.apiBaseURL}/scene/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          objects: sceneData.objects,
          metadata: {
            sceneId: sceneData.sceneId || 'default',
            name: sceneData.name,
            description: sceneData.description,
            cameraFar: sceneData.cameraFar,
            lastModified: sceneData.lastModified || Date.now(),
            objectCount: sceneData.objectCount || sceneData.objects.length,
            environmentUrl: sceneData.environmentUrl || null,
            gisConfig: sceneData.gisConfig || null,
            backgroundColor: sceneData.backgroundColor || '#ffffff',
            ambientIntensity: sceneData.ambientIntensity || 1.0,
            cameraPosition: sceneData.cameraPosition || { x: 5, y: 5, z: 5 },
          }
        })
      })

      const data = await response.json()
      if(data.success) {
        console.log('场景保存成功:', data.message)
        return true
      } else {
        console.error('场景保存失败:', data.message)
        return false
      }
    } catch (error) {
      console.error('场景保存失败:', error)
      return false
    }
  }

  async getSceneData(sceneId = 'default'): Promise<SceneResponse | null> {
    try {
      const response = await fetch(`${this.apiBaseURL}/scene/load?sceneId=${sceneId}`)
      const data = await response.json()
      if(data.success) {
        return {
          objects: data.objects || [],
          metadata: data.metadata || {}
        }
      } else {
        console.error('场景加载失败:', data.message)
        return null
      }
    } catch (error) {
      console.error('场景加载失败:', error)
      return null
    }
  }

  /**
   * 公开（只读）加载已发布场景
   * 走 /share/public 接口，未发布的场景返回 null
   * @param sceneId 场景ID
   */
  async getPublicSceneData(sceneId = 'default'): Promise<SceneResponse | null> {
    try {
      const response = await fetch(`${this.apiBaseURL}/share/public?sceneId=${sceneId}`)
      const data = await response.json()
      if(data.success) {
        return {
          objects: data.objects || [],
          metadata: data.metadata || {}
        }
      } else {
        console.error('公开场景加载失败:', data.message)
        return null
      }
    } catch (error) {
      console.error('公开场景加载失败:', error)
      return null
    }
  }

  async clearAllObjects(sceneId = 'default'): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseURL}/scene/clear?sceneId=${sceneId}`,  {
        method: 'DELETE'
      })
      const data = await response.json()
      if(!data.success){
        console.error('清除场景对象失败:', data.message)
        return false
      }
    }catch (error) {
      console.error('清除场景对象失败:', error)
      return false
    }
    return true
  }
}