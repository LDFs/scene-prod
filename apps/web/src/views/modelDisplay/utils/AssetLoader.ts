import { TextureLoader } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import useAssetsStore from '../store/assets'
import { AssetItem } from '../type'

export default class AssetLoader {
  textureLoader: TextureLoader
  gltfLoader: GLTFLoader
  assets: AssetItem[]
  addLoadedAssets
  constructor() {
    this.textureLoader = new TextureLoader()
    this.gltfLoader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
    this.gltfLoader.setDRACOLoader(dracoLoader)
     
    const { getAssets, addLoadedAssets } = useAssetsStore()
    this.assets = getAssets()
    this.addLoadedAssets = addLoadedAssets
  }

  loadTexture() {
    this.assets.forEach(item => {
      if(item.type === 'texture') {
        this.textureLoader.load(item.path, (res) => {
          this.addLoadedAssets(item.id, res)
        })
      }
    })
  }

  // load 了的模型，需要直接添加到场景中吗？
  loadModels() {
    this.assets.forEach(item => {
      if(item.type === 'model') {
        this.gltfLoader.load(item.path, (res) => {
          this.addLoadedAssets(item.id, res.scene)
        })
      }
    })
  }
}
