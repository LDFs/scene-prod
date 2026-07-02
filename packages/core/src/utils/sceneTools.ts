import * as THREE from 'three'
import { vec3Type } from '@scene-prod/shared'

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
    if (obj === object) return
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

  console.log('startPos: ', startPos);
  // 同心圆逐圈扫描搜索
  for (let r = 0; r <= maxRadius; r += step) {
    const angles =
      r === 0
        ? [0]
        : Array.from(
            { length: Math.ceil((2 * Math.PI * r) / step) },
            (_, i) => (i / Math.ceil((2 * Math.PI * r) / step)) * 2 * Math.PI,
          )

    for (const angle of angles) {
      const candidate = new THREE.Vector3(
        startPos.x + r * Math.cos(angle),
        startPos.y,
        startPos.z + r * Math.sin(angle),
      )
      console.log('candidate: ', candidate);

      newMesh.position.copy(candidate)
      newMesh.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(newMesh)
      const hasCollision = scene.children.some((obj) => {
        if (obj === newMesh || !(obj instanceof THREE.Mesh)) return false
        return box.intersectsBox(new THREE.Box3().setFromObject(obj))
      })

      if (!hasCollision) return candidate
    }
  }

  return startPos // 找不到时回退到原位
}
