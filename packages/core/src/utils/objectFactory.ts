import * as THREE from 'three'
import { MaterialState, ModifyMaterialCommand } from '@scene-prod/shared'

export type PrimitiveType = 'Box' | 'Sphere'

/**
 * 创建基础几何体
 * - userData.isModelRoot 标记根节点
 * - userData.groundOffset 记录离地偏移，放置时由 SceneManager.placeObjectAt 叠加
 * @param type 几何体类型
 * @returns 网格对象，类型不支持时返回 null
 */
export function createPrimitive(type: PrimitiveType): THREE.Mesh | null {
  let geometry: THREE.BufferGeometry
  let material: THREE.Material
  if (type === 'Box') {
    geometry = new THREE.BoxGeometry(1, 1, 1)
    material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
  } else if (type === 'Sphere') {
    geometry = new THREE.SphereGeometry(1, 32, 32)
    material = new THREE.MeshStandardMaterial({ color: 0x0000ff })
  } else {
    return null
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.isModelRoot = true // 标记根节点
  mesh.userData.groundOffset = 0.5 // 使几何体位于地面之上
  return mesh
}

export function setObjectMaterial(object: THREE.Mesh, cmd: ModifyMaterialCommand): {oldState: MaterialState, newState: MaterialState} {
  const oldMat = object.material as THREE.MeshStandardMaterial
  const oldState: MaterialState = {
    color: oldMat.color.clone(),
    roughness: oldMat.roughness,
    metalness: oldMat.metalness,
    emissive: oldMat.emissive.clone(),
    emissiveIntensity: oldMat.emissiveIntensity,
    opacity: oldMat.opacity,
    alphaTest: oldMat.alphaTest,
    blending: oldMat.blending,
    side: oldMat.side,
    transparent: oldMat.transparent,
    depthTest: oldMat.depthTest,
    depthWrite: oldMat.depthWrite,
    vertexColors: oldMat.vertexColors,
    wireframe: oldMat.wireframe,
    flatShading: oldMat.flatShading,
  }
  const newState: MaterialState = {
    color: cmd.color ? new THREE.Color(cmd.color) : oldMat.color.clone(),
    roughness: cmd.roughness ?? oldMat.roughness,
    metalness: cmd.metalness ?? oldMat.metalness,
    emissive: cmd.emissiveColor ? new THREE.Color(cmd.emissiveColor) : oldMat.emissive.clone(),
    emissiveIntensity: cmd.emissiveIntensity ?? oldMat.emissiveIntensity,
    opacity: cmd.opacity ?? oldMat.opacity,
    transparent: cmd.transparent ?? oldMat.transparent,
    wireframe: cmd.wireframe ?? oldMat.wireframe,
    flatShading: cmd.flatShading ?? oldMat.flatShading,
    // schema 未暴露这些字段（AI 常用子集之外），沿用原材质值
    alphaTest: oldMat.alphaTest,
    blending: oldMat.blending,
    side: oldMat.side,
    depthTest: oldMat.depthTest,
    depthWrite: oldMat.depthWrite,
    vertexColors: oldMat.vertexColors,
  }
  return { oldState, newState }
}
