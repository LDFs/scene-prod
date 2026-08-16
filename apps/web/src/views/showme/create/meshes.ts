import { Mesh, AxesHelper, MathUtils } from 'three'

import { createGeometry } from './geometries'
import { createMaterials, createPBRMate } from './materials'

function createMeshes() {
  const geometries = createGeometry()
  const materials = createMaterials()

  const box = new Mesh(geometries.box, materials.road)
  box.position.set(0, 0, 0)

  const axesHelper = new AxesHelper()
  box.add(axesHelper)
  
  // box.rotation.reorder('YZX')
  box.rotation.x = MathUtils.degToRad(60)
  box.rotation.y = MathUtils.degToRad(70)
  // box.scale.y = 2
  
  const box1 = new Mesh(geometries.box, materials.red)
  // box.add(box1)
  box1.position.x = 2
  // box1.rotation.y = MathUtils.degToRad(60)
  
  let t = 0
  box.tick = (delta: number) => {
    // box.rotation.z += 0.1 * delta
    t += delta
    console.log('-', delta, t)
    // box.scale.y =(Math.sin(t)) * 2 + 2
    // box.position.x = (Math.cos(t) +  Math.sin(t)) * 2
    // box.position.y = (Math.cos(t) -  Math.sin(t)) * 2
    // box.position.y = MathUtils.degToRad(t) * 2
    box.position.y = 2*Math.cos(t) *  Math.sin(t) +  Math.sin(t)

  }


  return {
    box,
  }
}

function creatMeshesForPBR() {
  const geometries = createGeometry()
  const materials = createPBRMate()

  const ball = new Mesh(geometries.ball, materials.mate)

  const plane = new Mesh(geometries.plane, materials.wall)
  plane.position.set(0, -3, 0)

  ball.castShadow = true
  plane.receiveShadow = true

  return {
    ball,
    plane
  }
}

export { createMeshes, creatMeshesForPBR }
