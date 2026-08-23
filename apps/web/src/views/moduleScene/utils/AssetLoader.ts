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
     
    const { getAssets, setAssets, getLoadedAssets, addLoadedAssets } = useAssetsStore()
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
