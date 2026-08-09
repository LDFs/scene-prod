
export type Model = {
  _id: string
  name: string
  originalName: string
  url: string
}

export type Environment = Model & {

}

export type Tileset = Model & {
  tilesetUrl: string
}