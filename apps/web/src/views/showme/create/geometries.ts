import { BoxGeometry, SphereGeometry, BufferAttribute } from 'three'

function createGeometry() {
  const box = new BoxGeometry(1, 1, 1)

  const ball = new SphereGeometry(2, 24, 24)

  const plane = new BoxGeometry(20, 0.4, 20)

  return { box, ball, plane }
}

export { createGeometry }
