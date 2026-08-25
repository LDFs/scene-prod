import { Mesh, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial } from 'three'

export default class Substance {
  cube: Mesh
  constructor() {
    this.cube = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({
        color: '#a30',
      }),
    )
  }

  loop(delta: number) {
    this.cube.rotation.y += delta
  }
  
}
