// TODO: 基于 Raycaster 的拾取与框选
import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { TransformController } from './TransformController'
export class Picker {
  private sceneManager: SceneManager
  private transformController: TransformController
  private mouse = new THREE.Vector2()
  private canvas: HTMLCanvasElement
  private callbackObj: {
    selectObject: (object: THREE.Object3D) => void
    clearSelection: () => void
  } = {
    selectObject: () => {},
    clearSelection: () => {},
  }

  constructor(sceneManager: SceneManager, transformController: TransformController, callbackObj: {
    selectObject: (object: THREE.Object3D) => void
    clearSelection: () => void
  }) {
    this.sceneManager = sceneManager
    this.transformController = transformController
    this.canvas = sceneManager.renderer.domElement
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this))
    this.callbackObj = callbackObj
  }

  onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    if (this.transformController && this.transformController.isDragging) return

    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1
    const intersects = this.sceneManager.raycastObjects(this.mouse, { recursive: true })

    if (intersects.length > 0) {
      const selectedObject = intersects[0].object
      this.callbackObj.selectObject(selectedObject)
    } else {
      this.callbackObj.clearSelection()
    }
  }
}
