import { BoxGeometry, SphereGeometry } from 'three'

function createGeometry() {
  const box = new BoxGeometry(5, 5, 5)

  const ball = new SphereGeometry(2, 16, 16)

  return { box, ball }
}

export { createGeometry }
