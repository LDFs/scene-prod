import { PerspectiveCamera, OrthographicCamera, WebGLRenderer } from "three";

function setSize(camera: PerspectiveCamera | OrthographicCamera, renderer: WebGLRenderer, container: HTMLElement) {
  if(camera instanceof PerspectiveCamera){
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
  }

  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio);
}

class Resizer{
  constructor(camera: PerspectiveCamera | OrthographicCamera, renderer: WebGLRenderer, container: HTMLElement) {
    setSize(camera, renderer, container)

    window.addEventListener('resize', ()=>{
      setSize(camera, renderer, container)
      this.onResize()
    })
  }

  onResize(){}
}

export default Resizer