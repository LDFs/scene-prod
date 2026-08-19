import { HemisphereLight, AmbientLight, PointLight, SpotLight, Color, CameraHelper } from "three";
import { pane } from '../utils/createPane'

function createLights() {
  // 半球光，能指定上部分和下部分光源，模拟光渐变的效果，但是比较廉价
  const hemisLight = new HemisphereLight('#fff', '#999', 2)
  // hemisLight.position.set(10, 10, 10)

  const pointLight = new PointLight('#f33a3a', 100, 0, 1)
  pointLight.position.set(30,40,30)

  const spotLight = new SpotLight(
    new Color(0x236e30),
    200
  )
  spotLight.position.set(10, 20, 30)

  const lightPane = pane.addFolder({
    title: '光照参数',
    expanded: true
  })
  lightPane.addBinding(spotLight, 'position', {
    label: '聚光灯位置'
  })
  lightPane.addBinding(spotLight, 'intensity', {
    label: '聚光灯强度',
    step: 1
  })
  lightPane.addBinding(spotLight, 'decay', {
    label: '聚光灯衰减',
    step: 0.1,
    min: 0,
    max: 2
  })
  lightPane.addBinding(spotLight, 'angle', {
    label: '聚光灯角度',
    step: 0.01,
    min: 0,
    max: Math.PI / 2
  })
  lightPane.addBinding(spotLight, 'penumbra', {
    label: '聚光灯边缘',
    step: 0.01,
    min: 0,
    max: 1
  })

  
  lightPane.addBinding(pointLight, 'intensity', {
    label: '点光源强度',
    step: 1
  })

  pointLight.castShadow = true
  pointLight.shadow.mapSize.width = 2048
  pointLight.shadow.mapSize.height = 2048
  pointLight.shadow.radius = 5

  const pointLightCameraHelper = new CameraHelper(
    pointLight.shadow.camera
  )

  
  spotLight.castShadow = true  
  const spoitLightCameraHelper = new CameraHelper(
    spotLight.shadow.camera
  )

  return [
    // hemisLight,
    pointLight,
    spotLight,
    pointLightCameraHelper,
    spoitLightCameraHelper
  ]
}

function createPlanetLights() {
  const pointLight = new PointLight('#fa621c', 40, 0, 1)
  pointLight.position.set(0,0,0)

  const ambientLight = new AmbientLight('#fff', 1)

  return [
    pointLight,
    ambientLight
  ]
}

export {
  createLights,
  createPlanetLights
}