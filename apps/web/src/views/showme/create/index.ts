import { PerspectiveCamera, Scene, WebGLRenderer, Color } from 'three'

import { createMeshes } from './meshes'
import { createLights } from './lights'
import { createControls } from './controls'
import Loop from './Loop'
import Resizer from './Resizer'

function createScene(container: HTMLElement) {
  const scene = new Scene()
  scene.background = new Color('skyblue')

  const { clientWidth: width, clientHeight: height } = container

  const camera = new PerspectiveCamera(50, width / height, 0.1, 1000)
  camera.position.set(0, 0, 10)

  const { box } = createMeshes()
  const { hemisLight } = createLights()

  camera.lookAt(box.position)

  scene.add(box, hemisLight)

  const { orbitControls } = createControls(camera, container)

  const renderer = new WebGLRenderer({
    antialias: true,
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  container.append(renderer.domElement)

  const loop = new Loop(camera, scene, renderer)
  loop.updatables.push(orbitControls)

  const resizer = new Resizer(camera, renderer, container)


  // renderer.render(scene, camera)

  loop.start()

  console.log('--', scene, container.clientWidth, container.clientHeight)
}

export { createScene }
