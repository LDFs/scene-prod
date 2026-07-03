// TODO: 封装 Raycaster，支持 BVH 加速 / 射线与平面相交 / 射线与物体相交 / 射线与几何体相交

import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast, BVHHelper } from 'three-mesh-bvh'
declare module 'three' {
  interface BufferGeometry {
    boundsTree?: MeshBVH
  }
  interface Raycaster {
    firstHitOnly?: boolean
  }
}

export class RaycastManager {
  private raycaster = new THREE.Raycaster()
  private builtGeometries: WeakSet<THREE.BufferGeometry> = new WeakSet()
  private bvhHelpers = new Map<THREE.BufferGeometry, BVHHelper>()
  private helperDepth = 10
  private helpersVisible = false
  constructor() {
    this.raycaster.firstHitOnly = true; // 只取最近的交点，加速
  }
  /**
   * 构建 BVH
   * @param object 需要构建 BVH 的物体
   */
  buildBVH(object: THREE.Object3D) {
    object.traverse((child) => {
      if(child instanceof THREE.Mesh && child.geometry) {
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
      if(child instanceof THREE.Mesh && child.geometry) {
        if(!this.builtGeometries.has(child.geometry)) {
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
  raycast(screenPosition: THREE.Vector2, camera: THREE.Camera, targets: THREE.Object3D[], options: Record<string, any> = {}) {
    const {resursive = true} = options
    // 使用一个坐标点和相机位置来更新射线
    this.raycaster.setFromCamera(screenPosition, camera)
    return this.raycaster.intersectObjects(targets, resursive)
  }

  /**
   * 使用原始射线进行检测
   * @param ray 射线
   * @param targets 场景中的全部物体
   * @param options 选项
   * @returns 与射线相交的物体列表
   */
  raycastWithRay(ray: THREE.Ray, targets: THREE.Object3D[], options: Record<string, any> = {}) {
    const {resursive = true} = options
    this.raycaster.ray.copy(ray)
    return this.raycaster.intersectObjects(targets, resursive)
  }

  /**
   * 射线与平面相交
   * @param screenPosition 屏幕位置
   * @param camera 相机
   * @param plane 平面
   * @returns 与射线相交的物体列表
   */
  raycastPlane(screenPosition: THREE.Vector2, camera: THREE.Camera, plane: THREE.Plane) {
    // 根据 NDC 坐标和相机，计算出从相机出发的三维射线
    this.raycaster.setFromCamera(screenPosition, camera)
    const target = new THREE.Vector3()
    // 计算射线与平面的交点，结果存入 target 中
    const result = this.raycaster.ray.intersectPlane(plane, target)
    return result ? target : null
  }

  /**
   * 销毁 BVH
   * @param object 物体
   */
  disposeBVH(object: THREE.Object3D) {
    object.traverse((child) => {
      if(child instanceof THREE.Mesh && child.geometry && child.geometry.boundsTree) {
        child.geometry.boundsTree = undefined
        // 还原为原型上的默认 raycast
        child.raycast = THREE.Mesh.prototype.raycast
        this.builtGeometries.delete(child.geometry)
      }
    })
  }

  // ========================= BVH Helper 可视化 ===========================

  showBVHHelpers(scene: THREE.Scene, objects: THREE.Object3D[], depth: number = 10) {
    this.helperDepth = depth
    this.helpersVisible = true
    objects.forEach((object) => {
      object.traverse((child) => {
        if(child instanceof THREE.Mesh && child.geometry && child.geometry.boundsTree) {
          if(this.bvhHelpers.has(child.geometry)) {
            const helper = this.bvhHelpers.get(child.geometry)!
            helper.depth = depth
            helper.update()
          }else {
            const helper = new BVHHelper(child, depth)
            scene.add(helper as unknown as THREE.Object3D)
            this.bvhHelpers.set(child.geometry, helper)
          }
        }
      })
    })
  }
  /**
   * 隐藏 BVH Helper
   * @param scene 场景
   */
  hideBVHHelpers(scene: THREE.Scene) {
    this.helpersVisible = false
    this.bvhHelpers.forEach((helper) => {
      scene.remove(helper as unknown as THREE.Object3D)
      // helper.dispose()
    })
    this.bvhHelpers.clear()
  }

  updateBVHDepth(depth: number) {
    this.helperDepth = depth
    this.bvhHelpers.forEach((helper) => {
      helper.depth = depth
      helper.update()
    })
  }

  isBVHHelperVisible() {
    return this.helpersVisible
  }
}
