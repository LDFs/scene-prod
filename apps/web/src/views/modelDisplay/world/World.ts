import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/Addons.js'

import AssetLoader from '../utils/AssetLoader'
import Picker from '../utils/Picker'
import useAssetsStore from '../store/assets'
import SelectorAdapter from '../utils/adapter/SelectorAdapter'
import useSceneStore from '../store/scene'


export default class World {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  container: HTMLElement

  stateStore: ReturnType<typeof useAssetsStore>
  assetLoader: AssetLoader
  picker: Picker

  timer: THREE.Timer
  orbitControls: OrbitControls

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 1000)
    this.renderer = new THREE.WebGLRenderer()
    this.container = container

    this.stateStore = useAssetsStore()
    this.assetLoader = new AssetLoader()

    this.picker = new Picker(this.renderer, this.camera, [], new SelectorAdapter())

    this.timer = new THREE.Timer()
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement)

    this.init()
    this.addLights()
    this.loadAssets()
    this.addModel()

    this.loop()

    window.addEventListener('resize', () => {
      setResizer(this.camera, this.renderer, container)
    })
  }

  init() {
    this.camera.position.set(-0.2, 7.3, 6)
    this.scene.background = new THREE.Color('rgb(1, 49, 1)')
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    const maxPixelRatio = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(maxPixelRatio)
    this.container.append(this.renderer.domElement)

    this.changeSelectObject()
  }

  addLights() {
    const ambientLight = new THREE.AmbientLight('rgb(255, 234, 114)')
    this.scene.add(ambientLight)
  }

  addModel() {
    this.stateStore.$subscribe((_, state) => {
      const forestHouse = state.loadedAssets?.forestHouse
      if (forestHouse && forestHouse instanceof THREE.Group) {
        this.scene.add(forestHouse)
        this.picker.addObjects(forestHouse)
      }
    })
  }

  loadAssets() {
    this.assetLoader.loadTexture()
    this.assetLoader.loadModels()
  }

  loop() {
    this.renderer.setAnimationLoop(() => {
      const delta = this.timer.getDelta()
      this.timer.update()
      this.renderer.render(this.scene, this.camera)
      this.orbitControls.update(delta)
    })
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }

  changeSelectObject() {
    const sceneStore = useSceneStore()
    sceneStore.$subscribe((_, state) => {
      if(state.selectedObject) {
        console.log("选中了", state.selectedObject)
      }
    })
  }
}

function setResizer(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  container: HTMLElement,
) {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
  }

  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
}
