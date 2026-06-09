import { vec3Type } from '@scene-prod/shared'

export function getXYZValueWithDefault(origin: vec3Type | undefined, defaultValue: { x: number; y: number; z: number } | number): { x: number; y: number; z: number } {
  if(origin === undefined) {
    if(typeof defaultValue === 'number') {
      return { x: defaultValue, y: defaultValue, z: defaultValue }
    }else {
      return { x: defaultValue.x, y: defaultValue.y, z: defaultValue.z }
    }
  }
  if(typeof defaultValue === 'number') {
    return {
      x: origin.x !== undefined ? origin.x : defaultValue,
      y: origin.y !== undefined ? origin.y : defaultValue,
      z: origin.z !== undefined ? origin.z : defaultValue,
    }
  } else {
    return {
      x: origin.x !== undefined ? origin.x : defaultValue.x,
      y: origin.y !== undefined ? origin.y : defaultValue.y,
      z: origin.z !== undefined ? origin.z : defaultValue.z,
    }
  }
}
