import { Timer } from 'three'
import WorldScene from './scene'
import Camera from './camera'
import Renderer from './renderer'
import App from './App'

export default class Loop {
  scene
  camera
  timer
  rendererIns
  constructor(scene: WorldScene, camera: Camera, renderer: Renderer) {
    this.camera = camera
    this.scene = scene
    this.timer = new Timer()

    this.rendererIns = renderer
  }

  start() {
    this.rendererIns.renderer.setAnimationLoop(() => {
      const delta = this.timer.getDelta()
      this.timer.update()
      this.rendererIns.renderer.render(this.scene.scene, this.camera.camera)
      this.camera?.loop(delta)
      App.current.substance.loop(delta)
    })
  }

  stop() {
    this.rendererIns.renderer.setAnimationLoop(null)
  }
}
