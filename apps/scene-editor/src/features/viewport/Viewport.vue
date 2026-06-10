<template>
  <!-- TODO: 挂载 SceneManager，处理拾取与变换 -->
  <div ref="container" class="viewport-container" @dragover.prevent @drop="onDrop">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import * as THREE from 'three'
import { API_BASE_URL } from '@root/config.ts'
import { SceneManager, PersistenceManager, TransformController, Picker } from '@scene-prod/core'
import { useEditorCoreStore } from '@/stores/editorCore'
import { useManagerStore } from '@/stores/manager'
import { EditorStoreAdapter } from '@/adapters/EditorStoreAdapter'
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

const getDropPosition = (event: DragEvent) => {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return null
  // 计算鼠标的位置在 canvas 中的归一化屏幕坐标
  const screenPos = new THREE.Vector2(
    (event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1,
  )

  // 射线检测物体
  const intersects = sceneManager?.raycastObjects(screenPos, { resursive: true })
  if (intersects && intersects.length > 0) {
    return intersects[0].point.clone()
  }
  // 射线检测地面
  const groundPoint = sceneManager?.raycastGround(screenPos)
  return groundPoint || new THREE.Vector3(0, 0, 0)
}

const onDrop = async (event: DragEvent) => {
  event.preventDefault()
  const type = event.dataTransfer?.getData('type')
  if (!type) return

  if (type === 'Environment') {
    const url = event.dataTransfer?.getData('url')
    try {
      await sceneManager?.loadEnvironment(url as string)
    } catch (error) {
      console.error('加载环境贴图失败:', error)
    }
    return
  }

  let object

  if (type === 'GLTFModel') {
    const url = event.dataTransfer?.getData('url')
    try {
      object = await persistenceManager?.loadGLTFModel(url as string)
      const dropPosition = getDropPosition(event)
      if (dropPosition) {
        object?.position.copy(dropPosition)
      }
    } catch (error) {
      console.error('加载模型失败:', error)
      return
    }
  } else if (type === 'model') {
    const url = event.dataTransfer?.getData('url')
    try{
      object = await persistenceManager?.loadModel(url as string)
      const dropPosition = getDropPosition(event)
      if (dropPosition) {
        object?.position.copy(dropPosition)
      }
    }catch(error) {
      console.error('加载模型失败:', error)
      return
    }
  } else {
    let geometry: THREE.BufferGeometry | null = null, material: THREE.Material | null = null
    if (type === 'Box') {
      geometry = new THREE.BoxGeometry(1, 1, 1)
      material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    } else if (type === 'Sphere') {
      geometry = new THREE.SphereGeometry(1, 32, 32)
      material = new THREE.MeshStandardMaterial({ color: 0x0000ff })
    }
    if (geometry && material) {
      object = new THREE.Mesh(geometry, material)
      const dropPosition = getDropPosition(event)
      if (dropPosition) {
        object?.position.copy(dropPosition)
        object.position.y += 0.5 // 基础几何体默认在地面以上0.5米
      }
    }
  }
  if (object) {
    // 之后通过 command 来控制添加、撤销等操作
    sceneManager?.addObject2Scene(object)
    // editorCoreStore.addObject(object)
  }
}

onMounted(async () => {
  sceneManager = new SceneManager(canvas.value as HTMLCanvasElement)
  persistenceManager = new PersistenceManager(sceneManager, {
    dbUrl: API_BASE_URL
  }, editorAdapter)

  transformController = new TransformController(sceneManager, persistenceManager, (cmd) => historyStore.execute(cmd))
  picker = new Picker(sceneManager, transformController, {
    selectObject: (object: THREE.Object3D) => {
      editorCoreStore.selectObject(object)
    },
    clearSelection: () => {
      editorCoreStore.clearSelection()
    },
  })

  const sceneId = route.params.sceneId as string || 'default'
  await persistenceManager.init(sceneId)
  sceneManager.setAmbientLight(editorCoreStore.sceneMetadata.backgroundColor, editorCoreStore.sceneMetadata.ambientIntensity)

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
