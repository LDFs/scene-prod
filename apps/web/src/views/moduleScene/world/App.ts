import WorldScene from './scene'
import Camera from './camera'
import Renderer from './renderer'

import Resizer from '../utils/Resizer'

import AssetLoader from '../utils/AssetLoader'
import Preloader from '../UI/preloader';

let instance: App | null = null

export default class App {
  readonly scene: WorldScene
  readonly camera: Camera
  readonly renderer: Renderer

  readonly assetLoader: AssetLoader
  readonly preloader: Preloader | null = null
  private constructor(readonly canvas: HTMLElement) {
    this.scene = new WorldScene()
    this.camera = new Camera(canvas)
    this.renderer = new Renderer(canvas)

    this.assetLoader = new AssetLoader()

    // this.preloader = new Preloader()

    new Resizer(this.camera.camera, this.renderer.renderer, canvas)
  }

  static create(canvas: HTMLElement) {
    return (instance ??= new App(canvas))
  }

  static get current() {
    if (!instance) throw new Error('App 尚未初始化')
    return instance
  }

  static loadTexture() {
    App.current.assetLoader.loadTexture()
  }

}
