import { Scene, AmbientLight, Group, Vector3, Matrix4, HemisphereLight } from 'three'
import * as THREE from 'three'

import Substance from '../SceneContent/Substance'
import App from './App'
import Physics from './Physics'

/**
 * 用于组建场景
 */
export default class Environment {
  app: App
  substance: Substance
  scene: Scene
  physics: Physics

  constructor() {
    this.substance = new Substance()
    this.app = App.current
    this.scene = this.app.scene.scene
    this.physics = new Physics()
  }

  makeUpScene() {

    const group = new Group()
    group.position.set(0, 3, 0)
    group.rotation.x = 60
    group.add(this.substance.cube)
    /**
     * 将物理添加进 group 后，但是不想改变物体原来的世界位置
     */
    // const newP = group.worldToLocal(new Vector3().copy(this.substance.cube.position))
    // this.substance.cube.position.copy(newP)

    /**
     * 同 worldToLocal 同理，不过是手动使用逆矩阵
     */
    group.updateMatrixWorld(true)    // 先更新矩阵，此时 group.matrixWorld 可能还没有根据 group.position.set(0, 3, 0) 更新，仍然是旧矩阵
    const position = new Vector3().copy(this.substance.cube.position)
    const m4 = group.matrixWorld
    position.applyMatrix4(new Matrix4().copy(m4).invert())
    this.substance.cube.position.copy(position)


    const light = new HemisphereLight('#ffffff', '#fff', 1)
    this.scene.add(light)
    this.scene.background = new THREE.Color('#dbfaff');

    this.addGroundAndWall()
    this.fullUpScene()
  }

  addGroundAndWall() {
    const geometry = new THREE.BoxGeometry(100, 1, 100)
    const material = new THREE.MeshStandardMaterial({
      color: 'rgb(174, 255, 167)',
      transparent: true, 
      opacity: 0.1
    })
    const ground = new THREE.Mesh(geometry, material)
    ground.position.set(0, -50, 0)

    const wall1 = new THREE.Mesh(geometry, material)
    wall1.position.set(-50, 0, 0)
    wall1.rotation.z = Math.PI / 2

    const wall2 = new THREE.Mesh(geometry, material)
    wall2.position.set(50, 0, 0)
    wall2.rotation.z = Math.PI / 2

    const wall3 = new THREE.Mesh(geometry, material)
    wall3.position.set(0, 0, 50)
    wall3.rotation.x = Math.PI / 2

    const wall4 = new THREE.Mesh(geometry, material)
    wall4.position.set(0, 0, -50)
    wall4.rotation.x = Math.PI / 2

    this.scene.add(ground, wall1, wall2, wall3, wall4)
    this.physics.add(ground, 'fixed', 'cuboid')
    this.physics.add(wall1, 'fixed', 'cuboid')
    this.physics.add(wall2, 'fixed', 'cuboid')
    this.physics.add(wall3, 'fixed', 'cuboid')
    this.physics.add(wall4, 'fixed', 'cuboid')
  }

  fullUpScene() {
    const geometry = new THREE.SphereGeometry(2, 24, 24)
    const material = new THREE.MeshStandardMaterial({
      color: 'rgb(249, 186, 255)'
    })

    for (let i = 0; i < 100; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 40 + 4,
      )
      // mesh.material.transparent = true
      // mesh.material.opacity = Math.random()

      mesh.scale.setScalar(Math.random() * 2)

      this.scene.add(mesh)
      this.physics.add(mesh, 'dynamic', 'ball')
    }
  }

  loop(delta: number) {
    // this.substance.loop(delta)
    this.physics.loop()
  }
}