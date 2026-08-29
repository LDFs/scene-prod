import RAPIER from '@dimforge/rapier3d'
import * as THREE from 'three'

export default class Physics {
  world: RAPIER.World
  rapierLoader = false
  mesh2RigidBody: Map<THREE.Mesh, RAPIER.RigidBody> = new Map()

  constructor() {
    const gravity = { x: 0, y: -9.81, z: 0 }
    this.world = new RAPIER.World(gravity)

    this.rapierLoader = true
  }

  add(mesh: THREE.Mesh, type: 'dynamic' | 'fixed', collider: 'cuboid' | 'ball' | 'trimesh' = 'cuboid') {
    let rigidBodyType: RAPIER.RigidBodyDesc | null = null
    if (type === 'dynamic') {
      rigidBodyType = RAPIER.RigidBodyDesc.dynamic()
    } else if (type === 'fixed') {
      rigidBodyType = RAPIER.RigidBodyDesc.fixed()
    }
    if (!rigidBodyType) return

    const rigidBody = this.world.createRigidBody(rigidBodyType)

    switch (collider) {
      case 'cuboid': {
        const size = this.computedCuboidDimension(mesh)
        const collidertType = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setRestitution(1.5).setFriction(0)
        this.world.createCollider(collidertType, rigidBody)
        break
      }
      case 'ball': {
        const radius = this.computedBallDimensions(mesh)
        const collidertType = RAPIER.ColliderDesc.ball(radius).setRestitution(0.7).setFriction(0.8)
        this.world.createCollider(collidertType, rigidBody)
        break
      }
      case 'trimesh': {
        const {worldVertices1, indexes} = this.computedTrimeshDimensions(mesh)
        const collidertType = RAPIER.ColliderDesc.trimesh(worldVertices1, indexes)
        this.world.createCollider(collidertType, rigidBody)
        break
      }
    }

    /**
     * 使用物体的世界坐标
     */
    const worldPosition = mesh.getWorldPosition(new THREE.Vector3())
    rigidBody.setTranslation(worldPosition, true)
    // rigidBody.setTranslation(mesh.position, true)   // 这是用的局部坐标

    // rigidBody.setRotation(mesh.quaternion, true)
    rigidBody.setRotation(mesh.getWorldQuaternion(new THREE.Quaternion()), true)

    this.mesh2RigidBody.set(mesh, rigidBody)
  }

  /**
   * 计算网格的大小和缩放比例，获得实际网格大小
   */
  computedCuboidDimension(mesh: THREE.Mesh) {
    mesh.geometry.computeBoundingBox()
    const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3())
    const multiple = mesh.getWorldScale(new THREE.Vector3())
    size?.multiply(multiple)
    return size ?? { x: 1, y: 1, z: 1 }
  }

  computedBallDimensions(mesh: THREE.Mesh) {
    mesh.geometry.computeBoundingSphere()
    const radius = mesh.geometry.boundingSphere?.radius ?? 1
    const worldScale = mesh.getWorldScale(new THREE.Vector3())
    // 提取三个维度上的最大缩放，可能是因为刚体或碰撞体只能是正圆的吧
    const maxScale = Math.max(worldScale.x, worldScale.y, worldScale.z)
    return radius * maxScale
  }

  computedTrimeshDimensions(mesh: THREE.Mesh) {
    // 获取顶点信息
    const vertices = mesh.geometry.attributes.position.array
    // 获得索引信息
    const indexes = mesh.geometry.index?.array
    // 世界缩放
    const worldScale = mesh.getWorldScale(new THREE.Vector3())
    /**
     * 计算世界缩放应用到顶点上的值
     * 方式一
     */
    const worldVertices = []
    for(let i = 0; i < vertices.length-1; i += 3) {
      worldVertices.push(vertices[i] * worldScale.x)
      worldVertices.push(vertices[i+1] * worldScale.y)
      worldVertices.push(vertices[i+2] * worldScale.z)
    }
    // 方式二 (method) Vector3.getComponent(index: number): number 获得三维向量中的某个值
    const worldVertices1 = vertices.map((vertex, index) =>{
      return vertex * worldScale.getComponent(index % 3)
    })

    return {worldVertices1, indexes}
  }

  loop() {
    if (!this.rapierLoader) return

    this.world.step()
    this.mesh2RigidBody.forEach((rigidBody, mesh) => {
      const position = new THREE.Vector3().copy(rigidBody.translation())
      const rotation = new THREE.Quaternion().copy(rigidBody.rotation())
      // 将世界坐标转换为局部坐标
      // mesh.parent?.worldToLocal(position)
      // ==> 等价于 ->
      const m4 = mesh.parent!.matrixWorld
      position.applyMatrix4(new THREE.Matrix4().copy(m4).invert())

      /**
       * 实现旋转的四元数求逆
       * mesh.parent!.matrixWorld 表示最终要应用到 mesh 上的累计效果
       * 求逆，逆转了所有父级节点叠加到 mesh 上的总效果
       */
      const inverseParentMatrix = new THREE.Matrix4().extractRotation(mesh.parent!.matrixWorld).invert()
      const inverseParentRotation = new THREE.Quaternion().setFromRotationMatrix(inverseParentMatrix)
      rotation.premultiply(inverseParentRotation)

      mesh.position.copy(position)
      mesh.quaternion.copy(rotation)
    })
  }
}
