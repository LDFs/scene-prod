
export type Planet = {
  name: string
  radius: number
  color: string
  texture?: string
  rotateRadius?: number
  x: number
  children?: Planet[],
  ySpeed?: number
}