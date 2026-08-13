import { PerspectiveCamera, WebGLRenderer } from "three";

function setSize(camera: PerspectiveCamera, renderer: WebGLRenderer, container: HTMLElement) {
  camera.aspect = container.clientWidth / container.clientHeight
  camera.updateProjectionMatrix()

  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio);
}

class Resizer{
  constructor(camera: PerspectiveCamera, renderer: WebGLRenderer, container: HTMLElement) {
    setSize(camera, renderer, container)

    window.addEventListener('resize', ()=>{
      setSize(camera, renderer, container)
      this.onResize()
    })
  }

  onResize(){}
}

export default Resizer