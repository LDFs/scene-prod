// TODO: 基于 Raycaster 的拾取与框选
import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { TransformController } from './TransformController'
export class Picker {
  private sceneManager: SceneManager
  private transformController: TransformController
  private mouse = new THREE.Vector2()
  private canvas: HTMLCanvasElement
  private pointerDownPos = new THREE.Vector2()
  private readonly DRAG_THRESHOLD = 5
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
    this.canvas.addEventListener('pointerdown', this.onRightPointerDown.bind(this))
    this.callbackObj = callbackObj
  }

  onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    this.pointerDownPos.set(event.clientX, event.clientY)
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this), { once: true })
  }

  onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return
    if (this.transformController?.isDragging) return
    const dx = event.clientX - this.pointerDownPos.x
    const dy = event.clientY - this.pointerDownPos.y
    if (Math.sqrt(dx * dx + dy * dy) > this.DRAG_THRESHOLD) return

    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1
    const intersects = this.sceneManager.raycastObjects(this.mouse, { recursive: true })

    if (intersects.length > 0) {
      this.callbackObj.selectObject(this.getModelRoot(intersects[0].object))
    } else {
      this.callbackObj.clearSelection()
    }
  }

  onRightPointerDown(event: PointerEvent) {
    if (event.button !== 2) return

    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1

    // 命中模型时，将其包围盒中心作为本次右键旋转的轴心
    const intersects = this.sceneManager.raycastObjects(this.mouse, { recursive: true })
    if (intersects.length > 0) {
      const root = this.getModelRoot(intersects[0].object)
      const center = new THREE.Vector3()
      new THREE.Box3().setFromObject(root).getCenter(center)
      this.sceneManager.orbitControl?.setPendingPivot(center)
    } else {
      this.sceneManager.orbitControl?.setPendingPivot(null)
    }
  }

  private getModelRoot(object: THREE.Object3D): THREE.Object3D {
    let current = object
    while (current.parent && !current.userData.isModelRoot) {
      current = current.parent
    }
    return current
  }
}
