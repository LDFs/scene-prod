import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { Texture, Group } from 'three'

import { AssetItem } from '../type'

const base = (p: string) => new URL(`../../showme/assets/imgs/planets/${p}`, import.meta.url).href

const useAssetsStore = defineStore('assetsStore', () => {
  const assets = ref<AssetItem[]>([
    {
      id: 'earth',
      path: base('earth.jpg'),
      type: 'texture',
    },
    {
      id: 'sun',
      path: base('sun.jpg'),
      type: 'texture',
    },
    {
      id: 'mars',
      path: base('mars.jpg'),
      type: 'texture',
    },
    {
      id: 'floatIsland',
      path: new URL(`../assets/models/forest_house.glb`, import.meta.url).href,
      type: 'model'
    }
  ])
  // shallowRef：Texture 是 three 的复杂对象，深层响应式会把它包成 Proxy，
  // 导致 renderer 内部的引用比较/缓存失效，这里只需要整体替换时触发更新
  const loadedAssets = shallowRef<Record<string, Texture | Group>>({})


  const getAssets = () => {
    return assets.value
  }

  const setAssets = (item: AssetItem) => {
    assets.value.push(item)
  }

  const getLoadedAssets = () => {
    return loadedAssets.value
  }

  const addLoadedAssets = (id: string, asset: Texture | Group) => {
    loadedAssets.value = {
      ...loadedAssets.value,
      [id]: asset
    }
  }

  return {
    assets,
    loadedAssets,
    getAssets,
    setAssets,
    getLoadedAssets,
    addLoadedAssets
  }
})

export default useAssetsStore
