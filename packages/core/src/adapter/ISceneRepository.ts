import type { SceneData, SceneResponse } from '@scene-prod/shared'

/**
 * 场景数据仓储抽象
 *
 * core 只依赖此抽象来存取场景数据，不关心底层用的是 HTTP、IPC、还是本地存储。
 * 具体实现（传输协议、端点约定、鉴权等）由宿主应用注入。
 */
export class ISceneRepository {
  /** 初始化仓储（如建立连接）；无需初始化时返回 true */
  async init(): Promise<boolean> {
    return true
  }

  /** 加载场景数据 */
  async getSceneData(sceneId: string): Promise<SceneResponse | null> {
    return null
  }

  /** 加载已发布（公开只读）的场景数据；未发布返回 null */
  async getPublicSceneData(sceneId: string): Promise<SceneResponse | null> {
    return null
  }

  /** 保存场景 */
  async saveScene(sceneData: SceneData): Promise<boolean> {
    return false
  }

  /** 清空场景内所有对象 */
  async clearAllObjects(sceneId: string): Promise<boolean> {
    return false
  }
}
