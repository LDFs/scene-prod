import { Mesh, BoxGeometry, SphereGeometry, MeshStandardMaterial, MathUtils, TorusKnotGeometry } from 'three'

export default class Substance {
  cube: Mesh
  ground: Mesh
  ball: Mesh
  torus: Mesh
  constructor() {
    this.cube = new Mesh(
      new BoxGeometry(2, 1, 1),
      new MeshStandardMaterial({
        color: '#a30',
      }),
    )
    this.cube.position.set(0, 7, 0)
    this.cube.rotation.y = MathUtils.degToRad(60)
    this.cube.rotation.x = MathUtils.degToRad(60)

    this.cube.scale.setScalar(2)

    this.ground = new Mesh(
      new BoxGeometry(40, 1, 40),
      new MeshStandardMaterial({
        color: 'rgb(113, 255, 77)',
      }),
    )
    this.ground.position.set(0, 0, 0)
    this.ground.rotation.x = MathUtils.degToRad(-10)

    this.ball = new Mesh(
      new SphereGeometry(2, 24, 24),
      new MeshStandardMaterial({
        color: 'rgb(255, 142, 77)',
      }),
    )
    this.ball.position.set(10, 15, 5)

    this.torus = new Mesh(
      new TorusKnotGeometry(2, 0.3, 100, 16),
      new MeshStandardMaterial({
        color: 'rgb(169, 77, 255)',
      }),
    )
    this.torus.position.set(0, 10, 5)
    this.torus.scale.setScalar(2)
  }

  loop(delta: number) {
    this.cube.rotation.y += delta
  }
}
