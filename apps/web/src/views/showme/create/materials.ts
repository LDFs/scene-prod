import { MeshStandardMaterial, TextureLoader, MeshBasicMaterial } from 'three'
import { pane } from '../utils/createPane'

function createMaterials() {
  const road = new MeshStandardMaterial({
    color: '#e5e5e5',
    flatShading: true,
    // wireframe: true   // 网格线框
  })

  const red = new MeshStandardMaterial({
    color: '#a30',
  })

  return { road, red }
}

const base = (p: string) => new URL(`../assets/imgs/metal_plate_1k/${p}`, import.meta.url).href

function createPBRMate() {
  const textureLoader = new TextureLoader()

  const mateAo = textureLoader.load(base('metal_plate_ao_1k.png'))
  const mateDiff = textureLoader.load(base('metal_plate_diff_1k.png'))
  const mateHeight = textureLoader.load(base('metal_plate_arm_1k.png'))
  const mateMetal = textureLoader.load(base('metal_plate_metal_1k.png'))
  const mateNormal = textureLoader.load(base('metal_plate_nor_gl_1k.png'))
  const mateRough = textureLoader.load(base('metal_plate_rough_1k.png'))

  const mate = new MeshStandardMaterial()
  const wall = new MeshStandardMaterial({
    color: '#333333'
  })

  const materailPane = pane.addFolder({ title: '材质参数', expanded: true })
  materailPane.addBinding(mate, 'metalness', {
    min: 0,
    max: 1,
    step: 0.01,
  })
  materailPane.addBinding(mate, 'roughness', {
    min: 0,
    max: 1,
    step: 0.01,
  })
  materailPane.addBinding(mate, 'displacementScale', {
    min: 0,
    max: 1,
    step: 0.01,
  })
  materailPane.addBinding(mate, 'aoMapIntensity', {
    min: 0,
    max: 1,
    step: 0.01,
  })

  mate.map = mateDiff

  // AO，环境光遮蔽, 加强相邻物体之间的阴影效果，深度感
  mate.aoMap = mateAo
  // mate.aoMapIntensity = 0.2

  // 法线，改颜色深浅，类似阴影
  mate.normalMap = mateNormal

  // 粗糙度
  mate.roughnessMap = mateRough
  // mate.roughness = 0.8

  // 高度, 凹凸度
  // mate.displacementMap = mateHeight
  // mate.displacementScale = 0.3

  // 金属度
  mate.metalnessMap = mateMetal
  // mate.metalness = 0.6

  return {
    mate,
    wall
  }
}

function createPlanteMate() {
  const sun = new MeshBasicMaterial({
    color: '#ff5d13'
  })

  const earth = new MeshBasicMaterial({
    color: '#0300cf'
  })

  const moon = new MeshBasicMaterial({
    color: '#3d3d3d'
  })

  return {
    sun,
    earth,
    moon
  }
}

export { createMaterials, createPBRMate, createPlanteMate }
