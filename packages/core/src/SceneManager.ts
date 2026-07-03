// TODO: 封装 Scene / Renderer / Camera / render loop / resize

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

import { CameraControlManager } from './CameraControlManager'
import { OrbitCameraControl } from './cameraControl/OrbitCameraControl'
import { GhostCameraControl } from './cameraControl/GhostCameraControl'
import { RaycastManager } from './RaycastManager'
import { StatsManager } from './StatsManager'
import { TriangleStatsManager } from './TriangleStatsManager'
import { ViewManager, type ViewPreset } from './ViewManager'
import { Easing, Group, Tween } from '@tweenjs/tween.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'


export class SceneManager {
  canvas: HTMLCanvasElement
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  private controlManager: CameraControlManager
  controls: OrbitControls
  orbitControl!: OrbitCameraControl
  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2
  /**
   * 所有可以交互的对象集合
   */
  objects: Set<THREE.Object3D>
  private environment: THREE.Group | null = null
  private geoSystem: THREE.Group | null = null
  private gisConfig: null = null
  private gridHelper: THREE.Mesh | null = null
  private gridVisible: boolean = false
  private axesHelper: THREE.AxesHelper | null = null
  private axesVisible: boolean = false
  private ambientLight: THREE.AmbientLight | null = null

  private statsManager: StatsManager
  private triangleStatsManager: TriangleStatsManager
  private raycastManager: RaycastManager = new RaycastManager()
  viewManager!: ViewManager

  private events: Record<string, Function[]> = {}
  private isReady: boolean = false
  private lastTime: number = 0

  private rafId: number | null = null
  private isDisposed: boolean = false

  private tweenGroup = new Group()

  environmentUrl: string | null = null

  private animate = (time: number) => {}
  _onCanvasClick = (e: MouseEvent) => {}

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

    // 设置渲染器，开启 alpha
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping // 色调映射
    this.renderer.toneMappingExposure = 1.0 // 曝光补偿
    this.renderer.outputColorSpace = THREE.SRGBColorSpace // 输出颜色空间

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture


    this.controlManager = new CameraControlManager(this.camera, this.renderer.domElement)

    const orbitControl = new OrbitCameraControl(this.camera, this.renderer.domElement)
    this.orbitControl = orbitControl
    this.controlManager.register('orbit', orbitControl)

    const ghostControl = new GhostCameraControl(this.camera, this.renderer.domElement)
    this.controlManager.register('ghost', ghostControl)

    this.controlManager.setMode('orbit')

    // 监听相机模式切换事件
    this.controlManager.onModeChange = (event: { mode: string; previous: string }) => {
      this.emit('control-mode-changed', event)
    }

    // 获取轨道控制器
    this.controls = orbitControl.getOrbitControls()

    // 视图管理器（透视/正交切换）
    this.viewManager = new ViewManager(this.camera, this.controls, window.innerWidth, window.innerHeight, (view) =>
      this.emit('view-changed', { view }),
    )

    // 射线检测
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    this.objects = new Set<THREE.Object3D>()

    this.statsManager = new StatsManager(this.canvas.parentElement || document.body, 'top-right', false)
    this.triangleStatsManager = new TriangleStatsManager(this.renderer, this.scene)

    this._onCanvasClick = this._onCanvasClickFn.bind(this)
    this.canvas.addEventListener('click', this._onCanvasClick)
    this.animate = this.animateFn.bind(this)
    this.animate(new Date().getTime())
  }

  /**
   * 订阅事件
   * @param name 事件名称
   * @param callback 事件回调函数
   */
  on(name: string, callback: Function) {
    if (!this.events[name]) {
      this.events[name] = []
    }
    this.events[name].push(callback)
  }

  /**
   * 取消订阅事件
   * @param name 事件名称
   * @param callback 事件回调函数
   */
  off(name: string, callback: Function) {
    if (this.events[name]) {
      this.events[name] = this.events[name].filter((fn) => fn !== callback)
    }
  }

  emit(name: string, ...args: any[]) {
    if (this.events[name]) {
      this.events[name].forEach((fn) => fn(...args))
    }
  }

  /**
   * 设置场景是否准备好
   * @param isReady 是否准备好
   */
  setReady(isReady: boolean) {
    this.isReady = isReady
    if (isReady) {
      this.emit('scene-ready', { isReady: true })
    }
  }

  /**
   * 动画帧, 负责渲染场景和更新控制器
   * @param time 动画帧间隔
   */
  animateFn(time: number) {
    if (this.isDisposed) return
    this.rafId = requestAnimationFrame(this.animate)

    const deltaTime = (time - this.lastTime) / 1000
    this.lastTime = time

    this.statsManager.begin()

    this.controlManager.update(deltaTime)

    this.renderer.render(this.scene, this.viewManager.activeCamera)
    /**
     * 更新一系列的效果
     */

    this.statsManager.end()
  }

  /**
   * 设置相机模式
   * @param mode 模式名称
   * @param options 模式选项
   * @returns 是否成功
   */
  setControlMode(mode: string, options?: Record<string, any>) {
    return this.controlManager.setMode(mode, options)
  }

  getControlMode() {
    return this.controlManager.getMode()
  }

  /**
   * 客户端坐标(clientX/clientY) 转为归一化屏幕坐标 (-1 ~ 1)
   * @param clientX 鼠标相对视口的 X 坐标
   * @param clientY 鼠标相对视口的 Y 坐标
   * @param target 复用的 Vector2，避免频繁分配
   */
  clientToNormalizedScreen(clientX: number, clientY: number, target = new THREE.Vector2()): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect()
    target.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    )
    return target
  }

  /**
   * 计算放置对象的世界坐标：优先命中已有物体表面，否则落到地面，最后回退到原点
   * @param clientX 鼠标相对视口的 X 坐标
   * @param clientY 鼠标相对视口的 Y 坐标
   * @param options recursive - 是否递归检测子对象，默认 true
   */
  getPlacementPosition(clientX: number, clientY: number, options: { recursive?: boolean } = {}): THREE.Vector3 {
    const screen = this.clientToNormalizedScreen(clientX, clientY)
    const intersects = this.raycastObjects(screen, { recursive: options.recursive ?? true })
    if (intersects.length > 0) return intersects[0].point.clone()
    return this.raycastGround(screen) || new THREE.Vector3(0, 0, 0)
  }

  /**
   * 将对象放到世界坐标，自动叠加 userData.groundOffset（基础几何体离地偏移）
   * @param object 需要放置的对象
   * @param position 目标世界坐标
   */
  placeObjectAt(object: THREE.Object3D, position: THREE.Vector3): void {
    object.position.copy(position)
    if (object.userData.groundOffset) {
      object.position.y += object.userData.groundOffset
    }
  }

  _onCanvasClickFn(e: MouseEvent) {
    // 只处理左键点击
    if (e.button !== 0) return
    // 获取点击的归一化屏幕位置
    const screenPosition = this.clientToNormalizedScreen(e.clientX, e.clientY)
    const raycastTargets = [...this.objects]
    const intersects = this.raycastManager.raycast(screenPosition, this.camera, raycastTargets)

    const clickData: Record<string, any> = {
      screenPosition: { x: e.clientX, y: e.clientY },
      originalEvent: e,
      object: null,
      worldPosition: null,
      point: null,
      face: null,
      lnglat: null,
    }
    if (intersects.length > 0) {
      const hit = intersects[0]
      clickData.object = hit.object
      clickData.worldPosition = {
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z,
      }
      clickData.point = hit.point
      clickData.face = hit.face
      if (this.geoSystem) {
        // const lnglat = this.worldToLngla
      }
    } else {
      // 未点中对象，与平面 Y=0 相交
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const groundPoint = this.raycastManager.raycastPlane(screenPosition, this.camera, plane)
      if (groundPoint) {
        clickData.worldPosition = {
          x: groundPoint.x,
          y: groundPoint.y,
          z: groundPoint.z,
        }
        clickData.point = groundPoint
        if (this.geoSystem) {
          // const lnglat = this.worldToLngla
        }
      }
    }
    this.emit('scene-click', clickData)
  }

  /**
   * 射线检测物体
   * @param screenPosition 归一化屏幕坐标
   * @param options 选项
   * @returns 与射线相交的物体列表
   */
  raycastObjects(screenPosition: THREE.Vector2, options: Record<string, any> = {}) {
    const { includeTileMap = true, ...raycastOptions } = options
    const targets = [...this.objects]
    // if(includeTileMap && this.tileMapManager && this.tileMapManager.mapGroup.visible) {}

    return this.raycastManager.raycast(screenPosition, this.camera, targets, raycastOptions)
  }

  /**
   * 获取鼠标指向的地面上的哪个点
   * @param screenPosition 归一化屏幕坐标
   * @returns 交点
   */
  raycastGround(screenPosition: THREE.Vector2) {
    // three.js 的三维坐标，y 轴向上，z轴朝外
    // 定义一个水平地面。new THREE.Vector3(0, 1, 0)是法向量，0 表示平面过原点
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    return this.raycastManager.raycastPlane(screenPosition, this.camera, plane)
  }

  // ==================== BVH Helper 可视化 API ====================

  setBVHHelperVisible(visible: boolean, depth = 10) {
    if (visible) {
      this.raycastManager.showBVHHelpers(this.scene, [...this.objects], depth)
    } else {
      this.raycastManager.hideBVHHelpers(this.scene)
    }
  }

  updateBVHHelperDepth(depth: number) {
    this.raycastManager.updateBVHDepth(depth)
  }

  isBVHHelperVisible() {
    return this.raycastManager.isBVHHelperVisible()
  }

  //  ==================== 性能监控 API ====================

  toggleStats(enable: boolean) {
    this.statsManager.toggle(enable)
  }

  isStatsEnabled() {
    return this.statsManager.isEnabled()
  }

  toggleTriangleStats(enable: boolean, callback: Function, interval = 200) {
    this.triangleStatsManager.toggle(enable, callback, interval)
  }

  setTriangleStatsCallback(callback: Function, interval = 200) {
    this.triangleStatsManager.startLiveUpdate(callback, interval)
  }

  getTriangleStats() {
    return this.triangleStatsManager.getStats()
  }

  isTriangleStatsEnabled() {
    return this.triangleStatsManager.isEnabled()
  }

  markTriangleStatsDirty() {
    this.triangleStatsManager.makeDirty()
  }

  //  ======== 对象描边 outlineManager =======

  //  ====== 对象高亮 highManager =====

  //  ========== three 流程 ================

  onWindowResize(width?: number, height?: number) {
    if (!this.canvas) return
    const w = width || this.canvas.clientWidth || 1
    const h = height || this.canvas.clientHeight || 1

    this.viewManager.updateAspect(w, h)
    this.renderer.setSize(w, h, false)

    // 同步更新标签渲染器尺寸
    // if (this.labelManager) {
    //   this.labelManager.onResize(w, h);
    // }

    // // 同步更新描边管理器尺寸
    // if (this.outlineManager) {
    //   this.outlineManager.resize(w, h);
    // }
  }

  setCameraFar(far: number) {
    if (this.camera && this.camera.isPerspectiveCamera) {
      this.camera.far = far
      // 更新透视矩阵，用来计算裁剪坐标
      this.camera.updateProjectionMatrix()
    }
  }

  getCameraFar() {
    if (this.camera && this.camera.isPerspectiveCamera) {
      return this.camera.far
    }
    return 1000000
  }

  /**
   * 加载环境贴图(HDR)
   * @param url 环境贴图url
   */
  loadEnvironment(url: string) {
    return new Promise((resolve, reject) => {
      const loader = new HDRLoader()
      loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping
          this.scene.background = texture
          this.scene.environment = texture
          this.environmentUrl = url
          resolve(texture)
        },
        undefined,
        (error) => {
          console.error('加载 HDR 环境贴图失败:', error)
          reject(error)
        },
      )
    })
  }

  setAmbientLight(color: string, intensity: number) {
    if (!this.ambientLight) {
      // 默认环境色
      this.ambientLight = new THREE.AmbientLight(color, intensity)
      this.scene.background = new THREE.Color(color).convertSRGBToLinear()
      this.scene.add(this.ambientLight)
    }
    if (this.ambientLight) {
      this.ambientLight.color.set(color)
      this.ambientLight.intensity = intensity
      this.scene.background = new THREE.Color(color).convertSRGBToLinear()
    }
  }

  addObject2Scene(object: THREE.Object3D) {
    this.scene.add(object)
    this.objects.add(object)
    this.markTriangleStatsDirty()
    this.raycastManager.buildBVH(object)
  }

  removeObjectFromScene(object: THREE.Object3D) {
    this.scene.remove(object)
    this.objects.delete(object)
    this.markTriangleStatsDirty()
    this.raycastManager.disposeBVH(object)
  }

  findObjectByUuid(uuid: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    this.scene.traverse((child) => {
      if (child.uuid === uuid) {
        found = child
      }
    })
    return found
  }

  findObjectByName(name: string): Array<THREE.Object3D> {
    let found: Array<THREE.Object3D> = []
    this.scene.traverse((child) => {
      if (child.name === name) {
        found?.push(child)
      }
      if (!child.name && child.uuid === name) {
        found.push(child)
      }
    })
    return found
  }

  clearScene() {
    this.objects.forEach((object) => {
      this.scene.remove(object)
    })
    this.objects.clear()
    this.markTriangleStatsDirty()
  }

  /**
   * 根据场景里面的所有物体来设置相机的位置
   * 使得所有物体都在相机视野范围内
   */
  fitCameraToScene() {
    if (this.objects.size === 0) return
    const box = new THREE.Box3()

    this.objects.forEach((object) => {
      box.expandByObject(object)
    })
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    // 调整 FOV 距离
    const fov = this.camera.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)))
    // 增加一点缓冲距离
    cameraZ *= 1.5

    // 相机位置，沿着相机位置和目标位置的向量方向，移动 cameraZ 距离
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    const newPos = direction.multiplyScalar(cameraZ).add(center)

    this.camera.position.copy(newPos)
    this.camera.lookAt(center)
    this.controls.target.copy(center)
    this.controls.update()
  }

  getCameraView(callback: Function): { position: THREE.Vector3; target: THREE.Vector3 } {
    const position = this.camera.position.clone()
    const target = this.controls.target.clone()
    const view = {
      position,
      target,
    }
    if (callback && typeof callback === 'function') {
      callback(view)
    }
    return view
  }

  /**
   * 设置相机视角 支持动画过渡
   * @param options 配置选项，position - 目标位置 {x, y, z}，target - 目标观察点 {x, y, z}，duration=1500 - 动画时长（毫秒），0 表示立即跳转，onComplete - 完成回调
   * @returns 是否成功
   */
  setCameraView(options: Record<string, any>) {
    const { position, target, duration = 1500, onComplete } = options
    const endTarget = target || this.controls.target.clone()
    if (duration <= 0) {
      this.camera.position.set(position.x, position.y, position.z)
      this.controls.target.set(endTarget.x, endTarget.y, endTarget.z)
      this.controls.update()
      if (onComplete && typeof onComplete === 'function') {
        onComplete()
      }
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const startPosition = this.camera.position.clone()
      const startTarget = this.controls.target.clone()

      new Tween(startPosition, this.tweenGroup)
        .to(position, duration)
        .easing(Easing.Quadratic.Out)
        .onUpdate(() => {
          this.camera.position.set(startPosition.x, startPosition.y, startPosition.z)
        })
        .start()
      new Tween(startTarget, this.tweenGroup)
        .to(endTarget, duration)
        .easing(Easing.Quadratic.Out)
        .onUpdate(() => {
          this.controls.target.set(startTarget.x, startTarget.y, startTarget.z)
          this.controls.update()
        })
        .onComplete(() => {
          if (onComplete && typeof onComplete === 'function') {
            onComplete()
          }
          resolve(true)
        })
        .start()
    })
  }

  getCameraPosition(): { x: number; y: number; z: number } {
    const pos = this.camera.position
    return { x: pos.x, y: pos.y, z: pos.z }
  }

  setCameraPosition(position: { x: number; y: number; z: number }) {
    this.camera.position.set(position.x, position.y, position.z)
    this.controls.update()
  }

  /**
   * 辅助网格
   */
  setGridHelper(visible: boolean, length = 30, width = 30, widthSegments: number, lengthSegment: number) {
    this.gridVisible = visible
    // if(this.gisConfig)

    if (this.gridHelper) {
      this.scene.remove(this.gridHelper)
      this.gridHelper = null
    }

    if (visible) {
      const resolvedLength = Math.max(1, length)
      const resolvedWidth = Math.max(1, width)
      const segW = Math.max(1, widthSegments ?? Math.round(resolvedWidth / 10))
      const segL = Math.max(1, lengthSegment ?? Math.round(resolvedLength / 10))

      const geometry = new THREE.PlaneGeometry(resolvedWidth, resolvedLength, segW, segL)
      const material = new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      })
      const gridPlane = new THREE.Mesh(geometry, material)
      // 放置到 XZ 平面
      gridPlane.rotation.x = -Math.PI / 2
      this.gridHelper = gridPlane
      this.scene.add(gridPlane)
    }
  }

  isGridVisible(): boolean {
    return this.gridVisible
  }

  /**
   * 切换地平面网格显示/隐藏
   * 自动根据场景内容推算合适的网格大小，场景为空时使用默认值
   */
  toggleGrid(): boolean {
    const next = !this.gridVisible
    if (next) {
      // 根据场景包围盒推算合适的网格尺寸
      let size = 20
      if (this.objects.size > 0) {
        const box = new THREE.Box3()
        this.objects.forEach((obj) => box.expandByObject(obj))
        if (!box.isEmpty()) {
          const s = box.getSize(new THREE.Vector3())
          // 取 XZ 最大轴长，向上取整到最近的 10 的倍数，并留 50% 余量
          const maxXZ = Math.max(s.x, s.z)
          size = Math.ceil((maxXZ * 1.5) / 10) * 10
          size = Math.max(size, 10)
        }
      }
      // 每格 1 单位
      const segments = size
      this.setGridHelper(true, size, size, segments, segments)
    } else {
      this.setGridHelper(false, 0, 0, 0, 0)
    }
    return this.gridVisible
  }

  setAxesHelper(visible: boolean, size = 10) {
    this.axesVisible = visible
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper)
      this.axesHelper = null
    }
    if (visible) {
      const axesHelper = new THREE.AxesHelper(size)
      this.axesHelper = axesHelper
      this.scene.add(axesHelper)
    }
  }

  isAxesVisible(): boolean {
    return this.axesVisible
  }

  /**
   * 切换世界坐标轴显示/隐藏
   * 坐标轴大小自动根据场景包围盒推算，场景为空时使用默认值
   */
  toggleAxes(): boolean {
    const next = !this.axesVisible
    if (next) {
      let size = 5
      if (this.objects.size > 0) {
        const box = new THREE.Box3()
        this.objects.forEach((obj) => box.expandByObject(obj))
        if (!box.isEmpty()) {
          const s = box.getSize(new THREE.Vector3())
          size = Math.max(s.x, s.y, s.z) * 0.6
          size = Math.max(size, 1)
        }
      }
      this.setAxesHelper(true, size)
    } else {
      this.setAxesHelper(false)
    }
    return this.axesVisible
  }

  //  ===== GIS =====

  //  ======== 天气效果 ========

  //  ========== 视图切换 ================

  /**
   * 切换相机视图预设
   * @param view 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left'
   */
  setView(view: ViewPreset): void {
    this.viewManager.setView(view)
  }

  /**
   * 获取当前视图预设
   */
  getView(): ViewPreset {
    return this.viewManager.view
  }

  /**
   * 当前是否为透视视图
   */
  isPerspectiveView(): boolean {
    return this.viewManager.isPerspective
  }

  //  ========== 销毁 ================

  /**
   * 释放材质及其引用的纹理
   */
  private disposeMaterial(material: THREE.Material) {
    material.dispose?.()
    for (const key of Object.keys(material)) {
      const value = material[key as keyof typeof material]
      // 纹理对象具有 minFilter 属性，据此判断并释放
      if (value && typeof value === 'object' && 'minFilter' in value) {
        ;(value as THREE.Texture).dispose?.()
      }
    }
  }

  /**
   * 递归释放物体的几何体与材质
   */
  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            if (material instanceof THREE.Material) this.disposeMaterial(material)
          })
        } else if (child.material instanceof THREE.Material) {
          this.disposeMaterial(child.material)
        }
      }
    })
  }

  /**
   * 销毁场景管理器，释放所有资源
   * 停止渲染循环、移除事件监听、销毁各子管理器，并释放 GPU 资源
   */
  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true

    // 停止渲染循环
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    // 移除事件监听
    this.canvas.removeEventListener('click', this._onCanvasClick)

    // 销毁子管理器
    this.controlManager.dispose()
    this.viewManager.dispose()
    this.triangleStatsManager.dispose()
    this.statsManager.disable()

    // 隐藏并释放 BVH Helper，销毁所有交互对象的 BVH
    this.raycastManager.hideBVHHelpers(this.scene)
    this.objects.forEach((object) => {
      this.raycastManager.disposeBVH(object)
    })

    // 释放场景中所有物体的几何体与材质
    this.disposeObject(this.scene)

    // 释放辅助对象
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper)
      this.gridHelper.geometry?.dispose()
      if (this.gridHelper.material instanceof THREE.Material) {
        this.gridHelper.material.dispose()
      }
      this.gridHelper = null
    }
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper)
      this.axesHelper.dispose()
      this.axesHelper = null
    }

    // 释放环境贴图
    if (this.scene.background instanceof THREE.Texture) {
      this.scene.background.dispose()
    }
    if (this.scene.environment) {
      this.scene.environment.dispose()
      this.scene.environment = null
    }

    // 清空场景与对象集合
    this.scene.clear()
    this.objects.clear()

    // 清理补间动画
    this.tweenGroup.removeAll()

    // 释放渲染器
    this.renderer.dispose()
    this.renderer.forceContextLoss()

    // 清空事件订阅
    this.events = {}
  }
}
