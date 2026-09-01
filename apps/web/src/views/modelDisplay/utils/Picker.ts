import * as THREE from 'three'
import RaycastManager from './RaycastManager'
import ISelectorAdapter from './adapter/ISelectorAdapter'

export default class Picker {
  canvas: HTMLCanvasElement
  pointerDownPos = new THREE.Vector2()
  raycastManager: RaycastManager
  objects: THREE.Object3D[]
  camera: THREE.PerspectiveCamera
  selectorAdapter: ISelectorAdapter
  private readonly DRAG_THRESHOLD = 5

  constructor(
    renderer: THREE.WebGLRenderer, 
    camera: THREE.PerspectiveCamera, 
    objects: THREE.Object3D[],
    selectorAdapter: ISelectorAdapter
  ) {
    this.canvas = renderer.domElement
    this.camera = camera
    this.raycastManager = new RaycastManager()
    this.objects = objects
    this.selectorAdapter = selectorAdapter

    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this))
  }

  // 鼠标左键点击，记录点击位置
  onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    this.pointerDownPos.set(event.clientX, event.clientY)
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this), { once: true })
  }

  onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return
    const dx = event.clientX - this.pointerDownPos.x
    const dy = event.clientY - this.pointerDownPos.y
    if (Math.sqrt(dx * dx + dy * dy) > this.DRAG_THRESHOLD) return

    const mouse = new THREE.Vector2()
    this.clientToNormalizedScreen(event.clientX, event.clientY, mouse)
    const intersects = this.raycastObjects(mouse, { recursive: true })

    if (intersects.length > 0) {
      this.selectorAdapter.selectObject(intersects[0].object)
    } else {
    }
  }

  clientToNormalizedScreen(clientX: number, clientY: number, target = new THREE.Vector2()): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect()
    target.set(((clientX - rect.left) / rect.width) * 2 - 1, (-(clientY - rect.top) / rect.height) * 2 + 1)
    return target
  }

  raycastObjects(screenPosition: THREE.Vector2, options: Record<string, any> = {}) {
    const { includeTileMap = true, ...raycastOptions } = options
    return this.raycastManager.raycast(screenPosition, this.camera, this.objects, raycastOptions)
  }

  addObjects(model: THREE.Object3D) {
    this.objects.push(model)
  }
}
