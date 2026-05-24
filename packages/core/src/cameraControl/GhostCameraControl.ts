import * as THREE from 'three'
import { BaseCameraControl } from './BaseCameraControl'
import { ControlType } from './types'

export class GhostCameraControl extends BaseCameraControl {
  /**移动速度配置 */
  moveSpeed = 10
  boostMultiplier = 2
  /** 视角灵敏度 */
  lookSpeed = 0.002

  /**按键状态 */
  keys: ControlType = {
    forward: false,  // W
    backward: false, // S
    left: false, // A
    right: false, // D
    boost: false, // Shift
    up: false, // E
    down: false, // Q
  }

  /** 鼠标状态 */
  isRightMouseDown = false
  pointerLockEnabled = false
  isPointerLocked = false

  /**相机欧拉角 */
  euler: THREE.Euler = new THREE.Euler(0,0,0,'YXZ')

  /** 临时向量 */
  _moveDirection = new THREE.Vector3()
  _right = new THREE.Vector3()
  _forward = new THREE.Vector3()

  /** 绑定事件处理器 */
  _onKeyDown = (event: KeyboardEvent) => {}
  _onKeyUp = (event: KeyboardEvent) => {}
  _onMouseDown = (event: MouseEvent) => {}
  _onMouseUp = (event: MouseEvent) => {}
  _onMouseMove = (event: MouseEvent) => {}
  _onPointerLockChange = () => {}
  _onContextMenu = (event: MouseEvent) => {}

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    super(camera, domElement)

    this._onKeyDown = this._onKeyDownFn.bind(this)
    this._onKeyUp = this._onKeyUpFn.bind(this)
    this._onMouseDown = this._onMouseDownFn.bind(this)
    this._onMouseUp = this._onMouseUpFn.bind(this)
    this._onMouseMove = this._onMouseMoveFn.bind(this)
    this._onPointerLockChange = this._onPointerLockChangeFn.bind(this)
    this._onContextMenu = this._onContextMenuFn.bind(this)
  }

  /**
   * 启用控制器
   * @param options 配置选项
   */
  enable(options: Record<string, any>): void {
    super.enable(options)

    this.pointerLockEnabled = options.pointerLock ?? false
    // 从相机当前朝向初始化欧拉角
    this.euler.setFromQuaternion(this.camera.quaternion)
    document.addEventListener('keydown', this._onKeyDown)
    document.addEventListener('keyup', this._onKeyUp)
    document.addEventListener('mousedown', this._onMouseDown)
    document.addEventListener('mouseup', this._onMouseUp)
    document.addEventListener('mousemove', this._onMouseMove)
    document.addEventListener('contextmenu', this._onContextMenu)
    // pointerLock 模式
    if(this.pointerLockEnabled){
      document.addEventListener('pointerlockchange', this._onPointerLockChange)
      this.domElement.requestPointerLock()
    }
  }

  disable(): void {
    super.disable()

    Object.keys(this.keys).forEach((key: string) => {
      if(key in this.keys){
        this.keys[key as keyof ControlType] = false
      }
    })
    this.isRightMouseDown = false

    document.removeEventListener('keydown', this._onKeyDown)
    document.removeEventListener('keyup', this._onKeyUp)
    document.removeEventListener('mousedown', this._onMouseDown)
    document.removeEventListener('mouseup', this._onMouseUp)
    document.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('contextmenu', this._onContextMenu)

    if(this.pointerLockEnabled){
      document.removeEventListener('pointerlockchange', this._onPointerLockChange)
      document.exitPointerLock()
    }
  }

  /**
   * 每帧更新
   * @param deltaTime 帧间隔时间
   */
  update(deltaTime: number): void {
    if(!this.enabled) return

    const speed = this.moveSpeed * (this.keys.boost ? this.boostMultiplier : 1)
    const distance = speed * deltaTime

    // 计算前进方向
    this.camera.getWorldDirection(this._forward)
    this._forward.y = 0
    this._forward.normalize()

    // 计算右方向
    this._right.crossVectors(this._forward, new THREE.Vector3(0, 1, 0).normalize())

    // 重置移动方向
    this._moveDirection.set(0,0,0)

    if(this.keys.forward) {
      this._moveDirection.add(this._forward)
    }
    if(this.keys.backward) {
      this._moveDirection.sub(this._forward)
    }
    if(this.keys.left) {
      this._moveDirection.sub(this._right)
    }
    if(this.keys.right) {
      this._moveDirection.add(this._right)
    }
    if(this.keys.up) {
      this._moveDirection.y += 1
    }
    if(this.keys.down) {
      this._moveDirection.y -= 1
    }

    // 归一化并应用移动距离
    if(this._moveDirection.lengthSq() > 0) {
      this._moveDirection.normalize()
      this.camera.position.addScaledVector(this._moveDirection, distance)
    }
  }

  // ========== 事件处理 ==========

  _onKeyDownFn(event: KeyboardEvent): void {
    if(!this.enable) return 

    switch(event.code) {
      case 'KeyW':
        this.keys.forward = true
        break
      case 'KeyS':
        this.keys.backward = true
        break
      case 'KeyA':
        this.keys.left = true
        break
      case 'KeyD':
        this.keys.right = true
        break
      case 'KeyE':
        this.keys.up = true
        break
      case 'KeyQ':
        this.keys.down = true
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.boost = true
        break
      default:
        break
    }
  }

  _onKeyUpFn(event: KeyboardEvent): void {
    switch(event.code) {
      case 'KeyW':
        this.keys.forward = false
        break
      case 'KeyS':
        this.keys.backward = false
        break
      case 'KeyA':
        this.keys.left = false
        break
      case 'KeyD':
        this.keys.right = false
        break
      case 'KeyE':
        this.keys.up = false
        break
      case 'KeyQ':
        this.keys.down = false
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.boost = false
        break
      default:
        break
    }
  }

  _onMouseDownFn(event: MouseEvent): void {
    if(!this.enable) return 

    // 右键按下时启用视角控制
    if(event.button === 2) {
      this.isRightMouseDown = true
    }

    if(this.pointerLockEnabled && !this.isPointerLocked) {
      this.domElement.requestPointerLock()
    }
  }

  _onMouseUpFn(event: MouseEvent): void {
    if(event.button === 2) {
      this.isRightMouseDown = false
    }
  }

  _onMouseMoveFn(event: MouseEvent): void {
    if(!this.enable) return 
    // 只有在指针锁定或右键按下时才允许视角控制
    const canLook = this.isPointerLocked || this.isRightMouseDown
    if(!canLook) return 

    const moveX = event.movementX || 0
    const moveY = event.movementY || 0

    this.euler.y -= moveX * this.lookSpeed
    this.euler.x -= moveY * this.lookSpeed

    // 限制俯仰角范围
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x))

    // 应用到相机，更新朝向
    this.camera.quaternion.setFromEuler(this.euler)
  }

  _onPointerLockChangeFn(): void {
    this.isPointerLocked = document.pointerLockElement === this.domElement
  }

  _onContextMenuFn(event: MouseEvent): void {
    // 禁用右键菜单
    event.preventDefault()
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.disable()
  }
}