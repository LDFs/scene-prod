import { Camera, Scene, WebGLRenderer, Timer } from "three";

const timer = new Timer()

/** 可参与每帧更新的对象 */
export interface Tickable {
  tick: (delta: number) => void
}

class Loop {
  camera;
  scene;
  renderer: WebGLRenderer;
  updatables: Tickable[];
  constructor(camera: Camera, scene: Scene, renderer: WebGLRenderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    this.updatables = [];
  }

  start() {
    this.renderer.setAnimationLoop(() =>{
      this.tick()
      this.renderer.render(this.scene, this.camera)
    })
  }

  tick() {
    // Timer 的 getDelta() 只是读取缓存值，必须先 update() 才会重新计算
    timer.update()
    const delta = timer.getDelta()

    this.updatables.forEach((item) => {
      item.tick(delta)
    })
  }
}

export default Loop