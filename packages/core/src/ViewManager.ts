import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * 视图预设：透视视图 + 六个正交标准视图
 */
export type ViewPreset = 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left'

export const VIEW_PRESET_LABELS: Record<ViewPreset, string> = {
  perspective: '透视视图',
  top: '顶视图',
  bottom: '底视图',
  front: '前视图',
  back: '后视图',
  right: '右视图',
  left: '左视图',
}

/** 正交视图的方向配置（相对于 target 的单位方向 + up 向量） */
interface OrthoViewConfig {
  direction: THREE.Vector3 // 相机相对于 target 的方向（单位向量）
  up: THREE.Vector3
}

const ORTHO_VIEW_CONFIGS: Record<Exclude<ViewPreset, 'perspective'>, OrthoViewConfig> = {
  top:    { direction: new THREE.Vector3(0, 1, 0),   up: new THREE.Vector3(0, 0, -1) },
  bottom: { direction: new THREE.Vector3(0, -1, 0),  up: new THREE.Vector3(0, 0, 1)  },
  front:  { direction: new THREE.Vector3(0, 0, 1),   up: new THREE.Vector3(0, 1, 0)  },
  back:   { direction: new THREE.Vector3(0, 0, -1),  up: new THREE.Vector3(0, 1, 0)  },
  right:  { direction: new THREE.Vector3(1, 0, 0),   up: new THREE.Vector3(0, 1, 0)  },
  left:   { direction: new THREE.Vector3(-1, 0, 0),  up: new THREE.Vector3(0, 1, 0)  },
}

export class ViewManager {
  private perspCamera: THREE.PerspectiveCamera
  private orthoCamera: THREE.OrthographicCamera
  private controls: OrbitControls
  private currentView: ViewPreset = 'perspective'
  private width: number
  private height: number

  /**
   * 正交相机的视口半高（世界单位），控制缩放级别
   * 用 scroll 或外部调用 setOrthoSize 来修改
   */
  private orthoSize: number = 10

  private onViewChange?: (view: ViewPreset) => void

  constructor(
    perspCamera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    width: number,
    height: number,
    onViewChange?: (view: ViewPreset) => void,
  ) {
    this.perspCamera = perspCamera
    this.controls = controls
    this.width = width
    this.height = height
    this.onViewChange = onViewChange

    const aspect = width / height
    this.orthoCamera = new THREE.OrthographicCamera(
      -this.orthoSize * aspect,
       this.orthoSize * aspect,
       this.orthoSize,
      -this.orthoSize,
      0.001,
      100000,
    )
  }

  // ─── 只读属性 ───────────────────────────────────────────────────────────────

  /** 当前渲染时应使用的相机 */
  get activeCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.currentView === 'perspective' ? this.perspCamera : this.orthoCamera
  }

  get view(): ViewPreset {
    return this.currentView
  }

  get isPerspective(): boolean {
    return this.currentView === 'perspective'
  }

  // ─── 视图切换 ────────────────────────────────────────────────────────────────

  /**
   * 切换视图预设
   * @param view 目标视图
   */
  setView(view: ViewPreset): void {
    if (view === this.currentView) return
    const previous = this.currentView
    this.currentView = view

    if (view === 'perspective') {
      this._activatePerspective()
    } else {
      this._activateOrtho(view)
    }

    this.onViewChange?.(view)
    console.log(`[ViewManager] 视图切换: ${previous} → ${view}`)
  }

  // ─── 内部切换逻辑 ─────────────────────────────────────────────────────────

  private _activatePerspective(): void {
    // 把正交相机的位置/目标同步回透视相机，保持用户看的方向一致
    const target = this.controls.target.clone()
    const orthoPos = this.orthoCamera.position.clone()
    const dir = orthoPos.clone().sub(target).normalize()

    // orthoSize 保存了正交视图的可见半高，反推透视相机应在的距离，使视野范围一致
    const fovRad = this.perspCamera.fov * (Math.PI / 180)
    const dist = this.orthoSize / Math.tan(fovRad / 2)

    this.perspCamera.position.copy(dir.multiplyScalar(dist).add(target))
    this.perspCamera.up.set(0, 1, 0)
    this.perspCamera.lookAt(target)

    // 绑定回透视相机
    ;(this.controls as any).object = this.perspCamera
    this.controls.target.copy(target)

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    this.controls.enableRotate = true
    this.controls.update()
  }

  private _activateOrtho(view: Exclude<ViewPreset, 'perspective'>): void {
    const config = ORTHO_VIEW_CONFIGS[view]
    const target = this.controls.target.clone()

    // 从当前透视相机的距离 + FOV 反推正交视口半高，保证切换前后可见范围一致
    const perspDist = this.perspCamera.position.distanceTo(target)
    const fovRad = this.perspCamera.fov * (Math.PI / 180)
    this.orthoSize = Math.max(perspDist * Math.tan(fovRad / 2), 0.1)

    // 正交相机距离 target 要足够远，避免近裁面裁切场景；距离不影响正交投影的画面大小
    const dist = Math.max(perspDist * 10, 1000)
    this.orthoCamera.position.copy(
      config.direction.clone().multiplyScalar(dist).add(target),
    )
    this.orthoCamera.up.copy(config.up)
    this.orthoCamera.lookAt(target)
    this.updateOrthoAspect()

    // 绑定到正交相机
    ;(this.controls as any).object = this.orthoCamera
    this.controls.target.copy(target)

    // 正交视图：左键平移，中键缩放，右键旋转
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }
    // 正交视图默认禁止旋转（标准 CAD 行为），可按需开启
    this.controls.enableRotate = false
    this.controls.screenSpacePanning = true
    this.controls.update()
  }

  // ─── 窗口大小 ─────────────────────────────────────────────────────────────

  /**
   * 窗口/画布尺寸变化时调用
   */
  updateAspect(width: number, height: number): void {
    this.width = width
    this.height = height
    this.perspCamera.aspect = width / height
    this.perspCamera.updateProjectionMatrix()
    if (!this.isPerspective) {
      this.updateOrthoAspect()
    }
  }

  // ─── 正交缩放 ─────────────────────────────────────────────────────────────

  /**
   * 设置正交相机视口半高（世界单位），控制缩放
   */
  setOrthoSize(size: number): void {
    this.orthoSize = Math.max(0.01, size)
    this.updateOrthoAspect()
  }

  getOrthoSize(): number {
    return this.orthoSize
  }

  // ─── 内部工具 ─────────────────────────────────────────────────────────────

  private updateOrthoAspect(): void {
    const aspect = this.width / this.height
    this.orthoCamera.left   = -this.orthoSize * aspect
    this.orthoCamera.right  =  this.orthoSize * aspect
    this.orthoCamera.top    =  this.orthoSize
    this.orthoCamera.bottom = -this.orthoSize
    this.orthoCamera.updateProjectionMatrix()
  }

  dispose(): void {
    this.onViewChange = undefined
  }
}
