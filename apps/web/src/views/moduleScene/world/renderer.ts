import {WebGLRenderer} from 'three'

export default class Renderer {
  renderer: WebGLRenderer

  canvas
  constructor(canvas: HTMLElement) {

    this.canvas = canvas
    this.renderer = new WebGLRenderer()

    const width = this.canvas?.clientWidth ?? window.innerWidth
    const height = this.canvas?.clientHeight ?? window.innerHeight
    this.renderer.setSize(width, height)

    const maxPixelRatio = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(maxPixelRatio)
    this.canvas?.append(this.renderer.domElement)
  }
}