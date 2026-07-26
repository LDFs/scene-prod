// 选中对象的虚线外框：以对象自身坐标系下的包围盒为准，绘制 12 条虚线棱边
import * as THREE from 'three'

export interface SelectionBoxHelperOptions {
  /** 棱边颜色 */
  color?: THREE.ColorRepresentation
  /** 棱边不透明度 */
  opacity?: number
  /** 外框相对包围盒最长边向外扩张的比例，避免棱边与模型表面重合 */
  padding?: number
  /** 虚线实线段长度，按包围盒最长边的比例给出（与模型尺寸无关，虚线疏密恒定） */
  dashRatio?: number
  /** 虚线间隙长度，按包围盒最长边的比例给出 */
  gapRatio?: number
}

/** 极薄方向（如平面模型）的最小厚度，按包围盒最长边的比例给出，避免外框退化成一个矩形 */
const MIN_THICKNESS_RATIO = 0.004

const DEFAULT_OPTIONS: Required<SelectionBoxHelperOptions> = {
  color: 0x4ea1ff,
  opacity: 0.6,
  padding: 0.02,
  dashRatio: 0.05,
  gapRatio: 0.03,
}

/**
 * 立方体 8 个角点的编码：bit0 -> x、bit1 -> z、bit2 -> y，置位取 max，否则取 min
 * 0 - 7 的八个数字表示八个角点，对应的三位二进制数 表示它的坐标，0 - 000 - (min, min, min), 1 - 001 - (min, min, max)
 * 12 条棱边即「只有一个坐标不同」的角点对：底面 4 条 + 顶面 4 条 + 竖边 4 条
 * 12 条棱边每个数字表示这个条边由第几个点组成。
 * 这种方式定义了 每条棱边由哪些点构成 的拓扑关系
 */
const EDGE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 3], [3, 2], [2, 0],    // 底面的四条
  [4, 5], [5, 7], [7, 6], [6, 4],    // 顶面的四条
  [0, 4], [1, 5], [2, 6], [3, 7],    // 竖着的四条
]

/**
 * 选中对象的虚线外框
 *
 * 外框直接挂在 scene 下（而非作为目标的子节点），每帧用目标的 matrixWorld 同步姿态：
 * 这样外框会跟随目标的位移/旋转/缩放，同时不会污染目标的节点树
 * （节点树参与序列化、结构指纹计算与子节点修改路径，插入辅助节点会导致数据错位）。
 *
 * 包围盒的真实尺寸写在几何体顶点里、而不是靠矩阵缩放：
 * 虚线的 lineDistance 不受缩放影响，各方向棱边的虚线疏密才能保持一致。
 */
export class SelectionBoxHelper {
  /** 外框根节点 */
  readonly root: THREE.LineSegments

  private scene: THREE.Scene
  private geometry: THREE.BufferGeometry
  private material: THREE.LineDashedMaterial
  private positionAttribute: THREE.BufferAttribute
  private lineDistanceAttribute: THREE.BufferAttribute
  private options: Required<SelectionBoxHelperOptions>

  private target: THREE.Object3D | null = null
  /** 目标是否有有效包围盒（空 Group、灯光等没有） */
  private hasBox = false

  private readonly localBox = new THREE.Box3()
  private readonly tmpBox = new THREE.Box3()
  private readonly tmpMatrix = new THREE.Matrix4()
  private readonly inverseMatrix = new THREE.Matrix4()
  private readonly center = new THREE.Vector3()
  private readonly size = new THREE.Vector3()

  constructor(scene: THREE.Scene, options: SelectionBoxHelperOptions = {}) {
    this.scene = scene
    this.options = this.mergeOptions(DEFAULT_OPTIONS, options)

    // 12 条棱边 = 24 个顶点，顶点数固定，refresh 时只改数值不重建几何体
    this.positionAttribute = new THREE.BufferAttribute(new Float32Array(EDGE_PAIRS.length * 2 * 3), 3)
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
    this.lineDistanceAttribute = new THREE.BufferAttribute(new Float32Array(EDGE_PAIRS.length * 2), 1)
    this.lineDistanceAttribute.setUsage(THREE.DynamicDrawUsage)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', this.positionAttribute)
    // 虚线着色器依赖 lineDistance 属性；这里按棱边逐条从 0 开始累计，保证每条棱边都从实线段起步
    this.geometry.setAttribute('lineDistance', this.lineDistanceAttribute)

    // 关闭深度测试，保证外框始终可见（与变换控件的表现一致）
    this.material = new THREE.LineDashedMaterial({
      color: this.options.color,
      transparent: true,
      opacity: this.options.opacity,
      depthTest: false,
      depthWrite: false,
    })

    this.root = new THREE.LineSegments(this.geometry, this.material)
    this.root.name = '__selectionBoxHelper__'
    this.root.userData.isHelper = true
    this.root.renderOrder = 999
    // 纯可视化对象，不参与拾取
    this.root.raycast = () => {}
    // matrix 由 update() 从目标的 matrixWorld 直接复制，不走 position/rotation/scale
    this.root.matrixAutoUpdate = false
    this.root.visible = false
    this.scene.add(this.root)
  }

  /** 当前跟随的对象 */
  getTarget(): THREE.Object3D | null {
    return this.target
  }

  /**
   * 让外框跟随指定对象
   * @param object 目标对象
   */
  attach(object: THREE.Object3D) {
    if (this.target === object) return
    this.target = object
    this.refresh()
  }

  /** 取消跟随并隐藏外框 */
  detach() {
    this.target = null
    this.hasBox = false
    this.root.visible = false
  }

  /**
   * 若外框当前跟随的是 object 或其后代，则取消跟随
   * 用于对象被移出场景时避免外框悬空
   * @param object 被移除的对象
   */
  detachIfTargetInside(object: THREE.Object3D) {
    let current: THREE.Object3D | null = this.target
    while (current) {
      if (current === object) {
        this.detach()
        return
      }
      current = current.parent
    }
  }

  /**
   * 重新计算外框尺寸
   * 目标的几何/子节点结构发生变化后需要调用（位移、旋转、缩放由 update 自动跟随，无需调用）
   */
  refresh() {
    const target = this.target
    if (!target) {
      this.detach()
      return
    }

    this.hasBox = this.computeLocalBox(target, this.localBox)
    if (!this.hasBox) {
      this.root.visible = false
      return
    }

    this.localBox.getCenter(this.center)
    this.localBox.getSize(this.size)

    const maxSize = Math.max(this.size.x, this.size.y, this.size.z)
    const minThickness = maxSize * MIN_THICKNESS_RATIO
    // 让外框比模型本身稍微大一圈
    const expand = maxSize * this.options.padding
    this.size.set(
      Math.max(this.size.x, minThickness) + expand * 2,
      Math.max(this.size.y, minThickness) + expand * 2,
      Math.max(this.size.z, minThickness) + expand * 2,
    )

    this.writeEdges(this.center, this.size)
    // 虚线尺寸按包围盒最长边取比例：不论模型大小，虚线段数都保持一致
    this.material.dashSize = maxSize * this.options.dashRatio
    this.material.gapSize = maxSize * this.options.gapRatio

    // 立即同步一次，避免刚显示的那一帧停留在旧姿态
    this.update()
  }

  /**
   * 每帧同步外框姿态，需要在渲染前调用
   */
  update() {
    const target = this.target
    if (!target || !this.hasBox) return

    const visible = this.isTargetVisible(target)
    this.root.visible = visible
    if (!visible) return

    target.updateWorldMatrix(true, false)
    this.root.matrix.copy(target.matrixWorld)
    this.root.matrixWorldNeedsUpdate = true
  }

  /**
   * 更新外框样式
   * @param options 需要覆盖的样式项
   */
  setOptions(options: SelectionBoxHelperOptions) {
    this.options = this.mergeOptions(this.options, options)
    this.material.color.set(this.options.color)
    this.material.opacity = this.options.opacity
    // 尺寸相关的样式需要按当前包围盒重算
    if (options.padding !== undefined || options.dashRatio !== undefined || options.gapRatio !== undefined) {
      this.refresh()
    }
  }

  dispose() {
    this.detach()
    this.scene.remove(this.root)
    this.geometry.dispose()
    this.material.dispose()
  }

  /**
   * 把包围盒的 12 条棱边写入顶点与 lineDistance 缓冲
   * @param center 包围盒中心（目标局部坐标）
   * @param size 包围盒尺寸
   */
  private writeEdges(center: THREE.Vector3, size: THREE.Vector3) {
    const positions = this.positionAttribute.array as Float32Array
    const lineDistances = this.lineDistanceAttribute.array as Float32Array

    const minX = center.x - size.x / 2
    const maxX = center.x + size.x / 2
    const minY = center.y - size.y / 2
    const maxY = center.y + size.y / 2
    const minZ = center.z - size.z / 2
    const maxZ = center.z + size.z / 2

    const cornerX = (index: number) => (index & 1 ? maxX : minX)
    const cornerY = (index: number) => (index & 4 ? maxY : minY)
    const cornerZ = (index: number) => (index & 2 ? maxZ : minZ)

    EDGE_PAIRS.forEach(([from, to], edgeIndex) => {
      // 计算每一条棱边的两个点的坐标
      const offset = edgeIndex * 6   // 一条边 = 2 个顶点 × 3 个分量
      positions[offset] = cornerX(from)
      positions[offset + 1] = cornerY(from)
      positions[offset + 2] = cornerZ(from)
      positions[offset + 3] = cornerX(to)
      positions[offset + 4] = cornerY(to)
      positions[offset + 5] = cornerZ(to)

      // 每条边的长度
      const length = Math.hypot(
        positions[offset + 3] - positions[offset],
        positions[offset + 4] - positions[offset + 1],
        positions[offset + 5] - positions[offset + 2],
      )
      // 每条虚线的起点、终点，中间通过GPU插值计算
      lineDistances[edgeIndex * 2] = 0
      lineDistances[edgeIndex * 2 + 1] = length
    })

    this.positionAttribute.needsUpdate = true
    this.lineDistanceAttribute.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }

  /**
   * 合并样式项，未显式给出的项沿用 base
   * @param base 基准样式
   * @param options 需要覆盖的样式项
   */
  private mergeOptions(
    base: Required<SelectionBoxHelperOptions>,
    options: SelectionBoxHelperOptions,
  ): Required<SelectionBoxHelperOptions> {
    return {
      color: options.color ?? base.color,
      opacity: options.opacity ?? base.opacity,
      padding: options.padding ?? base.padding,
      dashRatio: options.dashRatio ?? base.dashRatio,
      gapRatio: options.gapRatio ?? base.gapRatio,
    }
  }

  /**
   * 计算目标在其自身局部坐标系下的包围盒
   * 用局部包围盒（而非世界 AABB）可以让外框跟随目标旋转，且只需在结构变化时重算
   * @param target 目标对象
   * @param box 输出包围盒
   * @returns 是否得到了有效包围盒
   */
  private computeLocalBox(target: THREE.Object3D, box: THREE.Box3): boolean {
    target.updateWorldMatrix(true, true)
    this.inverseMatrix.copy(target.matrixWorld).invert()

    box.makeEmpty()
    target.traverse((child) => {
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
      if (!geometry || typeof geometry.computeBoundingBox !== 'function') return
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingBox) return

      // 子节点几何体 -> 世界 -> 目标局部
      this.tmpMatrix.multiplyMatrices(this.inverseMatrix, child.matrixWorld)
      this.tmpBox.copy(geometry.boundingBox).applyMatrix4(this.tmpMatrix)
      box.union(this.tmpBox)
    })
    return !box.isEmpty()
  }

  /**
   * 目标自身及其所有祖先都可见时，外框才显示
   * @param target 目标对象
   */
  private isTargetVisible(target: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = target
    while (current) {
      if (!current.visible) return false
      current = current.parent
    }
    return true
  }
}
