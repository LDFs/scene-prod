import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { BaseCameraControl } from './BaseCameraControl'

/**
 * 轨道相机控制器
 * 封装 Three.js 的 OrbitControls 控制器。
 * 右键旋转由本类自行实现：绕指定轴心（如选中模型中心）旋转，
 * 同时旋转相机位置与朝向，使轴心点在屏幕上保持不动，避免视图跳动。
 */
export class OrbitCameraControl extends BaseCameraControl {
  private orbitControls: OrbitControls

  /** 本次右键拖拽的旋转轴心；为空时回退到 orbitControls.target */
  private pendingPivot: THREE.Vector3 | null = null
  private activePivot = new THREE.Vector3()
  private pivotNeedsInit = false
  private isOrbiting = false
  private lastX = 0
  private lastY = 0
  /** 旋转速度（弧度/像素） */
  private rotateSpeed = 0.005

  private _onPointerDown = (e: PointerEvent) => this.onRightPointerDown(e)
  private _onPointerMove = (e: PointerEvent) => this.onRightPointerMove(e)
  private _onPointerUp = (e: PointerEvent) => this.onRightPointerUp(e)

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    super(camera, domElement)
    this.orbitControls = new OrbitControls(camera, domElement)
    this.orbitControls.enableDamping = true
    this.orbitControls.enabled = false
    // 左键平移、中键缩放；右键旋转交由本类自定义处理
    this.orbitControls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null,
    }
    this.domElement.addEventListener('pointerdown', this._onPointerDown)
  }

  /**
   * 设置下一次右键拖拽的旋转轴心（由拾取器在命中模型时调用）。
   * 仅对紧接着的这次右键拖拽生效。
   */
  setPendingPivot(pivot: THREE.Vector3 | null): void {
    this.pendingPivot = pivot ? pivot.clone() : null
  }

  private onRightPointerDown(event: PointerEvent): void {
    if (!this.enabled || event.button !== 2) return
    this.isOrbiting = true
    this.lastX = event.clientX
    this.lastY = event.clientY
    // 轴心在首次 pointermove 时再确定：此时拾取器的 pointerdown 已执行，
    // pendingPivot 才被正确设置（拾取器的监听晚于本控制器注册）
    this.pivotNeedsInit = true
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
  }

  private onRightPointerMove(event: PointerEvent): void {
    if (!this.isOrbiting) return
    if (this.pivotNeedsInit) {
      // 优先使用拾取器设置的模型中心，否则绕当前 target 旋转
      this.activePivot.copy(this.pendingPivot ?? this.orbitControls.target)
      this.pivotNeedsInit = false
    }
    const deltaX = event.clientX - this.lastX
    const deltaY = event.clientY - this.lastY
    this.lastX = event.clientX
    this.lastY = event.clientY
    if (deltaX === 0 && deltaY === 0) return

    const camera = this.camera
    const pivot = this.activePivot
    const offset = new THREE.Vector3().subVectors(camera.position, pivot)  // 相机相对轴心的向量

    // 相机当前的右向量（世界空间），用于俯仰旋转。 applyQuaternion 通过参数quaternion对Vector3进行旋转
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0)

    // 水平：绕世界 Y 轴
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, -deltaX * this.rotateSpeed)
    offset.applyQuaternion(qYaw)
    right.applyQuaternion(qYaw)

    // 垂直：绕相机右向量，并夹紧极角避免翻转
    const polar = Math.acos(THREE.MathUtils.clamp(offset.clone().normalize().y, -1, 1))
    let pitch = -deltaY * this.rotateSpeed
    const minPolar = 0.05
    const maxPolar = Math.PI - 0.05
    const newPolar = THREE.MathUtils.clamp(polar - pitch, minPolar, maxPolar)
    pitch = polar - newPolar
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitch)
    offset.applyQuaternion(qPitch)

    // ❗同步旋转相机位置与朝向，使轴心点在屏幕上保持不动
    const qTotal = qPitch.multiply(qYaw)
    camera.position.copy(pivot).add(offset)   // ！相机的位置是基于轴心和偏移量
    camera.quaternion.premultiply(qTotal)
  }

  private onRightPointerUp(event: PointerEvent): void {
    if (event.button !== 2) return
    this.isOrbiting = false
    this.pendingPivot = null
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)

    // 把 target 重新对齐到视线方向上，使 OrbitControls 恢复后的 lookAt 不产生跳变
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const dist = this.camera.position.distanceTo(this.activePivot)
    this.orbitControls.target.copy(this.camera.position).addScaledVector(forward, dist)
  }

  enable(options: Record<string, any>): void {
    super.enable(options)
    this.orbitControls.enabled = true
  }

  disable(): void {
    super.disable()
    this.orbitControls.enabled = false
    this.isOrbiting = false
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
  }

  update(deltaTime: number): void {
    // 自定义旋转进行中时跳过 OrbitControls 更新，避免其 lookAt(target) 覆盖朝向
    if (this.enabled && !this.isOrbiting) {
      this.orbitControls.update(deltaTime)
    }
  }

  dispose(): void {
    this.disable()
    this.domElement.removeEventListener('pointerdown', this._onPointerDown)
    this.orbitControls.dispose()
  }

  getOrbitControls(): OrbitControls {
    return this.orbitControls
  }
}
