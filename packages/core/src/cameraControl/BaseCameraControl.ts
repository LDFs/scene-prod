import * as THREE from 'three'

/**
 * 相机控制基类
 */
export class BaseCameraControl {
  camera: THREE.PerspectiveCamera
  domElement: HTMLCanvasElement
  enabled: boolean
  
  /**
   * 构造函数 
   * @param camera 相机
   * @param domElement 渲染器的DOM元素
   */
  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    this.camera = camera
    this.domElement = domElement
    this.enabled = false
  }

  /**
   * 启用控制器
   */
  enable(options?: Record<string, any>): void {
    this.enabled = true
  }

  /**
   * 禁用控制器
   */
  disable(): void {
    this.enabled = false
  }

  /**
   * 更新控制器
   * @param deltaTime 时间差
   */
  update(deltaTime: number): void {
    // 子类实现
  }

  /**
   * 销毁控制器
   */
  dispose(): void {
    this.disable()
  }
}