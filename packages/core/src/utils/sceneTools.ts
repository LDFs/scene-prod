import * as THREE from 'three'
import { vec3Type } from '@scene-prod/shared'
import type { SceneManager } from '../SceneManager'

export function getXYZValueWithDefault(
  origin: vec3Type | undefined,
  defaultValue: { x: number; y: number; z: number } | number,
): { x: number; y: number; z: number } {
  if (origin === undefined) {
    if (typeof defaultValue === 'number') {
      return { x: defaultValue, y: defaultValue, z: defaultValue }
    } else {
      return { x: defaultValue.x, y: defaultValue.y, z: defaultValue.z }
    }
  }
  if (typeof defaultValue === 'number') {
    return {
      x: origin.x !== undefined ? origin.x : defaultValue,
      y: origin.y !== undefined ? origin.y : defaultValue,
      z: origin.z !== undefined ? origin.z : defaultValue,
    }
  } else {
    return {
      x: origin.x !== undefined ? origin.x : defaultValue.x,
      y: origin.y !== undefined ? origin.y : defaultValue.y,
      z: origin.z !== undefined ? origin.z : defaultValue.z,
    }
  }
}

/**
 * 检测物体与场景中的物体是否有重叠
 * @param sceneManager 场景管理器
 * @param object 物体
 * @return 是否重叠
 */
export function overlapTest(sceneManager: SceneManager, object: THREE.Object3D): boolean {
  // 添加到场景中后，检测是否有重叠
  const newBox = new THREE.Box3().setFromObject(object)
  let isOverlap = false
  for (const obj of sceneManager.scene.children) {
    if (obj === object) continue
    const existingBox = new THREE.Box3().setFromObject(obj)
    if (newBox.intersectsBox(existingBox)) {
      isOverlap = true
    }
  }
  return isOverlap
}

/**
 * 同心圆逐圈扫描，查找附近的空位置来放置物体
 * @param newMesh 要放置的物体
 * @param scene 场景
 * @param startPos 起始位置
 * @returns 最终位置
 */
export function findFreePosition(newMesh: THREE.Mesh, scene: THREE.Scene, startPos: THREE.Vector3): THREE.Vector3 {
  const step = 0.5 // 每次搜索步长
  const maxRadius = 20

  // 现有障碍物在搜索过程中不会移动，包围盒只需预计算一次
  const obstacles = scene.children
    .filter((o): o is THREE.Mesh => o !== newMesh && o instanceof THREE.Mesh)
    .map((o) => new THREE.Box3().setFromObject(o))
  if (obstacles.length === 0) return startPos

  // 搜索时新物体只做平移（旋转/缩放不变），基准包围盒算一次，之后按偏移平移复用
  newMesh.position.copy(startPos)
  newMesh.updateMatrixWorld(true)
  const baseBox = new THREE.Box3().setFromObject(newMesh)

  // 复用临时对象，避免每个候选点都 new，减轻 GC 压力
  const box = new THREE.Box3()
  const offset = new THREE.Vector3()

  // 同心圆逐圈扫描搜索
  for (let r = 0; r <= maxRadius; r += step) {
    const count = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / step)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI
      offset.set(r * Math.cos(angle), 0, r * Math.sin(angle))

      box.copy(baseBox).translate(offset)
      const hasCollision = obstacles.some((b) => box.intersectsBox(b))

      if (!hasCollision) {
        const candidate = startPos.clone().add(offset)
        newMesh.position.copy(candidate)
        return candidate
      }
    }
  }

  return startPos // 找不到时回退到原位
}
