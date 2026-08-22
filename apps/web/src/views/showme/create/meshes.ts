import {
  Mesh,
  AxesHelper,
  MathUtils,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  TextureLoader,
  Scene,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { createGeometry, createPlanteGeo } from './geometries'
import { createMaterials, createPBRMate, createPlanteMate } from './materials'
import { Planet } from '../type'

const base = (p: string) => new URL(`../assets/imgs/planets/${p}`, import.meta.url).href

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
    box.position.y = 2 * Math.cos(t) * Math.sin(t) + Math.sin(t)
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
    plane,
  }
}

const planetsData: Planet[] = [
  {
    name: 'sun',
    radius: 10,
    color: '#ff5d13',
    texture: 'sun.jpg',
    x: 0,
    ySpeed: 0.2,
  },
  {
    name: 'earth',
    radius: 1.6,
    color: '#0300cf',
    texture: 'earth.jpg',
    rotateRadius: 30,
    x: 30,
    ySpeed: 0.5,
    children: [
      {
        name: 'moon',
        radius: 0.5,
        color: '#3d3d3d',
        texture: 'moon.jpg',
        x: 3,
        ySpeed: 1,
      },
    ],
  },
  {
    name: 'mars',
    radius: 2.2,
    color: 'rgb(121, 15, 15)',
    rotateRadius: 20,
    texture: 'mars.jpg',
    x: 24,
    ySpeed: 0.3,
  },
  {
    name: 'Jupiter',
    radius: 2.4,
    color: 'rgb(85, 39, 1)',
    rotateRadius: 12,
    texture: 'jupiter.jpg',
    x: 20,
    ySpeed: 0.4,
    children: [
      {
        name: 'a',
        radius: 0.6,
        color: '#3d3d3d',
        x: 5,
      },
    ],
  },
]

function createPlante() {
  // const planteGeo = createPlanteGeo()
  // const planteMate = createPlanteMate()

  // const sun = new Mesh(planteGeo.sun, planteMate.sun)
  // sun.scale.setScalar(10)

  // const earth = new Mesh(planteGeo.earth, planteMate.earth)

  // const moon = new Mesh(planteGeo.earth, planteMate.moon)
  // moon.scale.setScalar(0.3)
  // moon.position.set(2, 0, 0)

  // earth.add(moon)
  // earth.position.set(30, 0, 0)
  // let t = 0
  // earth.tick = (delta: number) => {
  //   earth.rotation.y += delta * 1

  //   t += delta

  //   // 按正圆旋转
  //   // earth.position.x = 20 * Math.sin(t)
  //   // earth.position.z = 20 * Math.cos(t)

  //   // 按椭圆旋转
  //   earth.position.x = 20 * (1.4 * Math.sin(t) + Math.cos(t))
  //   earth.position.z = 20 * (Math.sin(t) - Math.cos(t))
  // }
  const textureLoader = new TextureLoader()

  const planets: Mesh[] = []
  planetsData.map((item: Planet) => {
    const { name, radius, color, x, children, rotateRadius = 0, ySpeed = 1, texture } = item
    const geo = new SphereGeometry(radius, 32, 32)
    const mate = new MeshStandardMaterial({  })
    const mesh = new Mesh(geo, mate)
    if (texture) {
      const map = textureLoader.load(base(texture))
      mate.map = map
    }

    mesh.name = name
    mesh.position.x = x
    if (children && children.length > 0) {
      children.map((child: Planet) => {
        const { name, radius, color, x } = child
        const geo = new SphereGeometry(radius, 32, 32)
        const mate = new MeshStandardMaterial({  })
        const childMesh = new Mesh(geo, mate)
        if (texture) {
          const map = textureLoader.load(base(texture))
          mate.map = map
        }
        childMesh.position.x = x
        childMesh.name = name
        mesh.add(childMesh)
      })
    }
    let t = 0
    mesh.tick = (delta: number) => {
      t += delta * ySpeed
      mesh.rotation.y += ySpeed * delta
      mesh.position.x = rotateRadius * (1.4 * Math.sin(t) + Math.cos(t))
      mesh.position.z = rotateRadius * (Math.sin(t) - Math.cos(t))
    }

    planets.push(mesh)
  })

  return planets
}

const base1 = (p: string) => new URL(`../assets/models/${p}`, import.meta.url).href

async function loaderModels(scene: Scene) {
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/draco/')
  loader.setDRACOLoader(dracoLoader)
  // loader.load(base1('DamagedHelmet.glb'), (data) => {
  //   scene.add(data.scene)
  //   data.scene.scale.setScalar(10)
  //   console.log("data:", data)
  // })

  const model = await loader.loadAsync(base1('DamagedHelmet.glb'))
  model.scene.scale.setScalar(14)
  console.log(model.scene)
  return model.scene
}

export { createMeshes, creatMeshesForPBR, createPlante, loaderModels }
