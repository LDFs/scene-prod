import { Timer, Scene } from 'three'
import Camera from '../world/camera'
import Renderer from '../world/renderer'
import Environment from '../world/Environment'

export default class Loop {
  scene
  camera
  timer
  rendererIns
  environment
  constructor(scene: Scene, camera: Camera, renderer: Renderer) {
    this.camera = camera
    this.scene = scene
    this.timer = new Timer()
    this.environment = new Environment()

    this.rendererIns = renderer
  }

  start() {
    this.rendererIns.renderer.setAnimationLoop(() => {
      const delta = this.timer.getDelta()
      this.timer.update()
      this.rendererIns.renderer.render(this.scene, this.camera.camera)
      this.camera?.loop(delta)
      this.environment.loop(delta)
    })
  }

  stop() {
    this.rendererIns.renderer.setAnimationLoop(null)
  }
}
