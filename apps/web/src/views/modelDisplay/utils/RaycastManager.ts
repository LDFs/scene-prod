import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast, BVHHelper } from 'three-mesh-bvh'

export default class RaycastManager {
  private raycaster = new THREE.Raycaster()
  private builtGeometries: WeakSet<THREE.BufferGeometry> = new WeakSet()
  private bvhHelpers = new Map<THREE.BufferGeometry, BVHHelper>()
  private helperDepth = 10
  private helpersVisible = false
  constructor() {
    this.raycaster.firstHitOnly = true // 只取最近的交点，加速
  }

  /**
   * 构建 BVH
   * @param object 需要构建 BVH 的物体
   */
  buildBVH(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // 只给该 mesh 实例覆盖 raycast，不污染 THREE.Mesh 原型
        child.raycast = acceleratedRaycast
        this._buildGeometryBVH(child.geometry)
      }
    })
  }
  /**
   * 构建几何体的 BVH
   * @param geometry 几何体
   */
  _buildGeometryBVH(geometry: THREE.BufferGeometry) {
    if (this.builtGeometries.has(geometry)) return
    if (!geometry.attributes.position) return
    try {
      // 直接构建并赋值，不依赖原型上的 computeBoundsTree
      geometry.boundsTree = new MeshBVH(geometry)
      this.builtGeometries.add(geometry)
    } catch (error) {
      console.error('Error building BVH for geometry:', error)
      return
    }
  }

  /**
   * 检查物体是否所有几何体都构建了 BVH
   * @param object 物体
   * @returns 是否所有几何体都构建了 BVH
   */
  hasBVH(object: THREE.Object3D) {
    let hasAll = true
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        if (!this.builtGeometries.has(child.geometry)) {
          hasAll = false
        }
      }
    })
    return hasAll
  }

  /**
   * 射线检测
   * @param screenPosition 屏幕位置
   * @param camera 相机
   * @param targets 场景中的全部物体
   * @param options 选项
   * @returns 与射线相交的物体列表
   */
  raycast(
    screenPosition: THREE.Vector2,
    camera: THREE.Camera,
    targets: THREE.Object3D[],
    options: Record<string, any> = {},
  ) {
    const { resursive = true } = options
    // 使用一个坐标点和相机位置来更新射线
    this.raycaster.setFromCamera(screenPosition, camera)
    return this.raycaster.intersectObjects(targets, resursive)
  }
}
