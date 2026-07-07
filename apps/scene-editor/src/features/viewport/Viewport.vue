<template>
  <!-- TODO: 挂载 SceneManager，处理拾取与变换 -->
  <div ref="container" class="viewport-container" @dragover.prevent @drop="onDrop">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import type * as THREE from 'three'
import { API_BASE_URL } from '@root/config.ts'
import {
  SceneManager,
  PersistenceManager,
  TransformController,
  Picker,
  AddObjectCommand,
  type ObjectDescriptor,
} from '@scene-prod/core'
import { useEditorCoreStore } from '@/stores/editorCore'
import { useManagerStore } from '@/stores/manager'
import { EditorStoreAdapter } from '@/adapters/EditorStoreAdapter'
import { HttpSceneRepository } from '@/adapters/HttpSceneRepository'
import { useHistoryStore } from '@/stores/history'
import { getAssetByName, getModelUrl } from '@/services/asset'

const route = useRoute()
const container = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const editorCoreStore = useEditorCoreStore()
const managerStore = useManagerStore()
const historyStore = useHistoryStore()

let persistenceManager: PersistenceManager | null = null
let sceneManager: SceneManager | null = null
let transformController: TransformController | null = null
let picker: Picker | null = null
const editorAdapter = new EditorStoreAdapter()

const onDrop = async (event: DragEvent) => {
  event.preventDefault()
  const dt = event.dataTransfer
  const type = dt?.getData('type')
  if (!type || !sceneManager || !persistenceManager) return

  // 环境贴图：直接加载，不作为对象放置
  if (type === 'Environment') {
    try {
      await sceneManager.loadEnvironment(dt!.getData('url'))
    } catch (error) {
      console.error('加载环境贴图失败:', error)
    }
    return
  }

  // 拖拽数据必须在 await 之前同步读取，
  // 否则 drop 事件结束后 dataTransfer 进入 protected mode，getData 返回 ""
  const url = dt?.getData('url') ?? ''
  const name = dt?.getData('name') ?? ''
  const normalizeScale = Number(dt?.getData('normalizeScale')) || 1

  let descriptor: ObjectDescriptor | null = null
  if (type === 'model') {
    descriptor = { kind: 'gltf', url, name, normalizeScale }
  } else if (type === 'obj') {
    // 查看这个 obj 模型对应的 mtl 文件（依赖 app 的 asset 服务与 URL 拼接，保留在此处）
    const { asset: material } = await getAssetByName('material', name)
    if (material) {
      material.url = getModelUrl(material)
    }
    descriptor = { kind: 'obj', url, name, material }
  } else if(type === 'fbx') {
    descriptor = { kind: 'fbx', url, name }
  } else if (type === 'Box' || type === 'Sphere') {
    descriptor = { kind: 'primitive', primitive: type }
  }
  if (!descriptor) return

  let object: THREE.Object3D | null = null
  try {
    object = await persistenceManager.createObject(descriptor)
  } catch (error) {
    console.error('创建对象失败:', error)
    return
  }
  if (!object) return

  const position = sceneManager.getPlacementPosition(event.clientX, event.clientY)
  sceneManager.placeObjectAt(object, position)

  // 通过 command 来控制添加、撤销等操作
  historyStore.execute(new AddObjectCommand(sceneManager, object, true))
}

onMounted(async () => {
  sceneManager = new SceneManager(canvas.value as HTMLCanvasElement)
  persistenceManager = new PersistenceManager(
    sceneManager,
    new HttpSceneRepository(API_BASE_URL),
    editorAdapter,
  )

  transformController = new TransformController(sceneManager, persistenceManager, (cmd) => historyStore.execute(cmd))
  picker = new Picker(sceneManager, transformController, {
    selectObject: (object: THREE.Object3D) => {
      editorCoreStore.selectObject(object)
    },
    clearSelection: () => {
      editorCoreStore.clearSelection()
    },
  })

  const sceneId = (route.params.sceneId as string) || 'default'
  await persistenceManager.init(sceneId)
  sceneManager.setAmbientLight(
    editorCoreStore.sceneMetadata.backgroundColor,
    editorCoreStore.sceneMetadata.ambientIntensity,
  )

  managerStore.init({
    sceneManager,
    persistenceManager,
    transformController,
    picker,
  })

  editorCoreStore.$subscribe((_, state) => {
    if (state.selectedObject) {
      transformController?.attach(state.selectedObject)
    } else {
      transformController?.detach()
    }
  })

  const observer = new ResizeObserver((entries) => {
    if (sceneManager) {
      const entry = entries[0]
      if (entry && entry.contentRect) {
        const { width, height } = entry.contentRect
        sceneManager.onWindowResize(width, height)
      } else {
        sceneManager.onWindowResize()
      }
    }
  })
  observer.observe(container.value as HTMLElement)
})

onBeforeUnmount(() => {
  managerStore.reset()
})
</script>

<style scoped>
.viewport-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
