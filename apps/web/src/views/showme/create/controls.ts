import { Camera } from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import type { Tickable } from "./Loop";

function createControls(camera: Camera, canvas: HTMLElement) {
  const orbitControls = new OrbitControls(camera, canvas) as OrbitControls & Tickable

  orbitControls.addEventListener('change', () => {

  })

  orbitControls.tick = (delta: number) => {
    orbitControls.update(delta)
  }

  return {orbitControls}
}

export {
  createControls
}