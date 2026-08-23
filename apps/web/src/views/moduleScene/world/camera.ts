import { PerspectiveCamera } from 'three'
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { CameraOptions } from '../type'


export default class Camera {

  canvas
  camera
  orbitControls
  constructor(canvas: HTMLElement, options?: CameraOptions) {

    this.canvas = canvas

    const width = canvas?.clientWidth ?? window.innerWidth
    const height = canvas?.clientHeight ?? window.innerHeight
    this.camera = new PerspectiveCamera(50, width / height, 0.1, 1000)
    const { x, y, z } = options?.initPosition ?? { x: 10, y: 10, z: 10 }
    this.camera.position.set(x, y, z)

    this.orbitControls = new OrbitControls(this.camera, this.canvas) as OrbitControls
  }

  loop(delta: number) {
    this.orbitControls.update(delta)
  }
}
