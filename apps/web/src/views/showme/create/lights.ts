import { HemisphereLight } from "three";

function createLights() {
  const hemisLight = new HemisphereLight('#fff', '#999', 2)
  // hemisLight.position.set(10, 10, 10)

  return {
    hemisLight
  }
}

export {
  createLights
}