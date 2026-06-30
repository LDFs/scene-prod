// TODO: 封装与 scene-prod-server 的 HTTP 调用
import { API_BASE_URL } from '../../config.js'
import type { SceneData } from '@scene-prod/shared';
import type { Pagination } from '../types/scenes';


export async function getScenes(page = 1, pageSize = 10) {
  try {
    const response = await fetch(`${API_BASE_URL}/scene/list?page=${page}&pageSize=${pageSize}`)
    const data = await response.json()
    if (data.success) {
      return {
        scenes: data.scenes as SceneData[],
        pagination: data.pagination,
      }
    } else {
      console.error('获取场景列表失败:', data.message)
      return {
        scenes: [],
        pagination: {
          page: page,
          pageSize: pageSize,
          total: 0,
        },
      }
    }
  } catch (error) {
    console.error('获取场景列表失败:', error)
    return {
      scenes: [],
      pagination: {
        page: page,
        pageSize: pageSize,
        total: 0,
      },
    }
  }
}

export async function createScene(name: string, description: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/scene/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name,
        description: description,
      }),
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('创建场景失败:', error)
    return {
      message: '创建场景失败',
      success: false,
      scene: null,
    }
  }
}

export async function deleteScene(sceneId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/scene/delete?sceneId=${sceneId}`, {
      method: 'DELETE',
    })
    const data = await response.json()
    if (data.success) {
      return true
    } else {
      console.error('删除场景失败:', data.message)
      return false
    }
  } catch (error) {
    console.error('删除场景失败:', error)
    return false
  }
}

/**
 * 发布场景，使其可通过分享链接公开访问
 * @returns 是否发布成功
 */
export async function publishScene(sceneId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/share/publish?sceneId=${sceneId}`, {
      method: 'POST',
    })
    const data = await response.json()
    if (data.success) {
      return true
    } else {
      console.error('发布场景失败:', data.message)
      return false
    }
  } catch (error) {
    console.error('发布场景失败:', error)
    return false
  }
}

/**
 * 取消发布场景，分享链接随即失效
 * @returns 是否取消成功
 */
export async function unpublishScene(sceneId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/share/unpublish?sceneId=${sceneId}`, {
      method: 'POST',
    })
    const data = await response.json()
    if (data.success) {
      return true
    } else {
      console.error('取消发布失败:', data.message)
      return false
    }
  } catch (error) {
    console.error('取消发布失败:', error)
    return false
  }
}

export async function getSceneData(sceneId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/scene/load?sceneId=${sceneId}`)
    const data = await response.json()
    if (data.success) {
      return data.metadata || { name: '未命名场景' }
    } else {
      console.error('获取场景失败:', data.message)
      return null
    }
  } catch (error) {
    console.error('获取场景失败:', error)
    return null
  }
}