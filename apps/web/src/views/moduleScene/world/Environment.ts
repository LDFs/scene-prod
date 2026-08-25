import { Scene, AmbientLight } from 'three'

import Substance from '../SceneContent/Substance'
import App from './App'

/**
 * 用于组建场景
 */
export default class Environment {
  app: App
  substance: Substance
  scene: Scene
  constructor() {
    this.substance = new Substance()
    this.app = App.current
    this.scene = this.app.scene.scene
  }

  makeUpScene() {
    this.scene.add(this.substance.cube)

    const light = new AmbientLight('#fff', 1)
    this.scene.add(light)
  }

  loop(delta: number) {
    this.substance.loop(delta)
  }
}