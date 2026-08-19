import { PerspectiveCamera, OrthographicCamera } from 'three'


function createCamera(width: number, height: number) {
  const camera = new PerspectiveCamera(50, width / height, 0.1, 1000)
  camera.position.set(0, 50, 50)

  // const ratio = width / height
  // const camera = new OrthographicCamera(-1 * ratio, 1 * ratio, 1, -1, 0.1, 1000)
  // camera.position.z = 100;

  return camera
}

export {
  createCamera
}