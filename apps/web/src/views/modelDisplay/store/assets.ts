import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { Texture, Group } from 'three'

import { AssetItem } from '../type'


const textureBase = (p: string) => new URL(`../assets/texture/${p}`, import.meta.url).href
const modelBase = (p: string) => new URL(`../assets/models/${p}`, import.meta.url).href

const useAssetsStore = defineStore('assetsStore', () => {
  /**
   * 记录该页面上要使用的所有资源信息
   */
  const assets = ref<AssetItem[]>([
    {
      id: 'earth',
      path: textureBase('earth.jpg'),
      type: 'texture',
    },
    {
      id: 'sun',
      path: textureBase('sun.jpg'),
      type: 'texture',
    },
    {
      id: 'mars',
      path: textureBase('mars.jpg'),
      type: 'texture',
    },
    {
      id: 'forestHouse',
      path: modelBase('forest_house.glb'),
      type: 'model'
    }
  ])
  // shallowRef：Texture 是 three 的复杂对象，深层响应式会把它包成 Proxy，
  // 导致 renderer 内部的引用比较/缓存失效，这里只需要整体替换时触发更新
  const loadedAssets = shallowRef<Record<string, Texture | Group>>({})

  const addedAssets = ref<string[]>([])


  const getAssets = () => {
    return assets.value
  }

  const setAssets = (item: AssetItem) => {
    assets.value.push(item)
  }

  const getLoadedAssets = () => {
    return loadedAssets.value
  }

  /**
   * 记录加载了的资源
   */
  const addLoadedAssets = (id: string, asset: Texture | Group) => {
    loadedAssets.value = {
      ...loadedAssets.value,
      [id]: asset
    }
  }

  const checkAddedAssets = (id: string) => {
    return addedAssets.value.includes(id)
  }

  /**
   * 记录添加到场景中的资源
   * @param id 
   */
  const recordAddedAssets = (id: string) => {
    addedAssets.value.push(id)
  }

  return {
    assets,
    loadedAssets,
    getAssets,
    setAssets,
    getLoadedAssets,
    addLoadedAssets,
    checkAddedAssets,
    recordAddedAssets
  }
})

export default useAssetsStore
