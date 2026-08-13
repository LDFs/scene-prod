import { Mesh } from "three";

import { createGeometry } from "./geometries";
import { createMaterials } from "./materials";

function createMeshes() {
  const geometries = createGeometry()
  const materials = createMaterials()

  const box = new Mesh(geometries.ball, materials.road)
  box.position.set(0,0,0)

  return {
    box
  }
}

export {
  createMeshes
}