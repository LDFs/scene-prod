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
    // 注：OBJ 资产不走单独分支。它的 type 就是 'model'（LibraryPanel 拖拽时传的
    // 是 asset.type），流水线已经把它转成 GLB、材质也由 obj2gltf 烘进了产物，
    // 所以这里按 gltf 加载即可，不需要再去找对应的 .mtl。
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

  const hooks = {
    onSceneChange: () => {
      editorCoreStore.notifyStateUpdate()
      editorCoreStore.notifyTreeUpdate()
    }
  }
  historyStore.execute(new AddObjectCommand(sceneManager, object, true, hooks))
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
      // 选中对象加上虚线外框
      sceneManager?.setSelectionBox(state.selectedObject)
    } else {
      transformController?.detach()
      sceneManager?.setSelectionBox(null)
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
