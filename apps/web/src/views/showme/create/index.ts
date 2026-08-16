import { Scene, WebGLRenderer, Color, AxesHelper, PCFShadowMap } from 'three'

import { createMeshes, creatMeshesForPBR } from './meshes'
import { createLights } from './lights'
import { createControls } from './controls'
import { createCamera } from './camera'
import Loop from './Loop'
import Resizer from './Resizer'

function createScene(container: HTMLElement) {
  const scene = new Scene()
  scene.background = new Color('skyblue')

  const { clientWidth: width, clientHeight: height } = container

  const camera = createCamera(width, height)

  const { box } = createMeshes()
  const { hemisLight } = createLights()

  camera.lookAt(box.position)

  scene.add(box, hemisLight)

  const { orbitControls } = createControls(camera, container)

  const renderer = new WebGLRenderer({
    // antialias: true,
  })
  renderer.setSize(width, height)
  /** 设置最大的屏幕像素比，防止在移动端上设置过大的无意义的高像素 */
  const maxPixelRatio = Math.min(window.devicePixelRatio, 2)
  renderer.setPixelRatio(maxPixelRatio)     // 设置渲染像素比，可以一定程度上降低锯齿
  container.append(renderer.domElement)

  const loop = new Loop(camera, scene, renderer)
  loop.updatables.push(orbitControls)
  loop.updatables.push(box)

  const resizer = new Resizer(camera, renderer, container)

  const axesHelper = new AxesHelper()
  scene.add(axesHelper)
  axesHelper.position.set(-2, -1, -2)

  // renderer.render(scene, camera)

  loop.start()

  console.log('--', scene, container.clientWidth, container.clientHeight)
}

function createSceneForPBR(container: HTMLElement) {
    const scene = new Scene()
  // scene.background = new Color('skyblue')

  const { clientWidth: width, clientHeight: height } = container

  const camera = createCamera(width, height)

  const { ball, plane } = creatMeshesForPBR()
  const lights = createLights()
  lights.forEach((light) =>{
    scene.add(light)
  })

  camera.lookAt(ball.position)

  scene.add(ball, plane)

  const { orbitControls } = createControls(camera, container)

  const renderer = new WebGLRenderer({
    antialias: true,
  })
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap

  container.append(renderer.domElement)

  const loop = new Loop(camera, scene, renderer)
  loop.updatables.push(orbitControls)

  const resizer = new Resizer(camera, renderer, container)

  // renderer.render(scene, camera)

  loop.start()

}

export { createScene, createSceneForPBR }
