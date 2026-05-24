import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { BaseCameraControl } from './BaseCameraControl'

/**
 * 轨道相机控制器
 * 封装 Three.js 的 OrbitControls 控制器
 */
export class OrbitCameraControl extends BaseCameraControl {
  private orbitControls: OrbitControls

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    super(camera, domElement)
    this.orbitControls = new OrbitControls(camera, domElement)
    this.orbitControls.enableDamping = true
    this.orbitControls.enabled = false
  }

  enable(options: Record<string, any>): void {
    super.enable(options)
    this.orbitControls.enabled = true
  }

  disable(): void {
    super.disable()
    this.orbitControls.enabled = false
  }

  update(deltaTime: number): void {
    if(this.enabled){
      this.orbitControls.update(deltaTime)
    }
  }

  dispose(): void {
    this.disable()
    this.orbitControls.dispose()
  }

  getOrbitControls(): OrbitControls {
    return this.orbitControls
  }
}
