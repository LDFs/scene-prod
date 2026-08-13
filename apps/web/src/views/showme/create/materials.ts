import { MeshStandardMaterial } from 'three'

function createMaterials() {
  const road = new MeshStandardMaterial({
    color: '#e5e5e5',
    flatShading: true
  })

  return {road};
}


export {
  createMaterials
}