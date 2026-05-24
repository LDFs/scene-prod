// TODO: 相机控制管理器，管理相机控制器，支持相机模式切换，支持相机状态保存和恢复

import * as THREE from 'three'
import { BaseCameraControl } from './cameraControl/BaseCameraControl'

/**
 * 相机控制管理器
 */
export class CameraControlManager {
  private camera: THREE.PerspectiveCamera
  private controls: Map<string, BaseCameraControl>
  private domElement: HTMLCanvasElement
  private activeMode: string | null = null
  private activeControl: BaseCameraControl | null = null
  onModeChange: Function|null = null

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    this.camera = camera
    this.domElement = domElement
    this.controls = new Map<string, BaseCameraControl>()
  }

  register(name: string, control: BaseCameraControl): void {
    this.controls.set(name, control)
  }

  /**
   * 切换相机的模式。保存相机的当前状态，切换新的控制器后，恢复相机的状态
   * @param name 模式名称
   * @param options 模式选项
   * @returns 是否成功
   */
  setMode(name: string, options?: Record<string, any>): boolean {
    const control = this.controls.get(name)
    if(!control) {
      console.warn(`Camera control mode "${name}" not found`)
      return false
    }

    // 保存当前相机状态
    const position = this.camera.position.clone()
    const quaternion = this.camera.quaternion.clone()

    // 禁用当前控制器
    const previousMode = this.activeMode
    if(this.activeControl) {
      this.activeControl.disable()
    }

    // 启用新的控制器
    this.activeMode = name
    this.activeControl = control
    this.activeControl.enable(options)

    // 恢复相机状态
    this.camera.position.copy(position)
    this.camera.quaternion.copy(quaternion)

    // 调用模式切换回调
    if(previousMode && this.onModeChange) {
      this.onModeChange({mode: name, previous: previousMode})
    }

    return true
  }

  /**
   * 获取当前激活的模式
   */
  getMode(): string | null {
    return this.activeMode
  }

  /**
   * 获取当前激活的控制器
   */
  getActiveControl(): BaseCameraControl | null {
    return this.activeControl
  }

  /**
   * 每帧更新
   */
  update(deltaTime: number): void {
    if(this.activeControl) {
      this.activeControl.update(deltaTime)
    }
  }

  /**
   * 销毁所有控制器
   */
  dispose(): void {
    for(const control of this.controls.values()) {
      control.dispose()
    }
    this.controls.clear()
    this.activeMode = null
    this.activeControl = null
    this.onModeChange = null
  }
}