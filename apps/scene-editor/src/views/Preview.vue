<template>
  <div ref="container" class="viewer-container">
    <canvas ref="canvas"></canvas>

    <!-- 加载中 -->
    <div v-if="status === 'loading'" class="viewer-overlay">
      <div class="spinner"></div>
      <p>场景加载中…</p>
    </div>

    <!-- 不存在 / 未发布 -->
    <div v-else-if="status === 'notfound'" class="viewer-overlay">
      <h2>😶 场景不可用</h2>
      <p>该场景不存在，或尚未发布分享。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { API_BASE_URL } from '@root/config.ts'
import { SceneManager, PersistenceManager } from '@scene-prod/core'
import { useEditorCoreStore } from '@/stores/editorCore'
import { EditorStoreAdapter } from '@/adapters/EditorStoreAdapter'

const route = useRoute()
const container = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const status = ref<'loading' | 'ready' | 'notfound'>('loading')

const editorCoreStore = useEditorCoreStore()

let sceneManager: SceneManager | null = null
let persistenceManager: PersistenceManager | null = null
let observer: ResizeObserver | null = null

onMounted(async () => {
  sceneManager = new SceneManager(canvas.value as HTMLCanvasElement)
  // 只读 viewer：复用 PersistenceManager 的反序列化与场景填充逻辑，
  // 但不创建 TransformController / Picker，因此场景里没有任何编辑器辅助对象或拾取交互
  persistenceManager = new PersistenceManager(
    sceneManager,
    { dbUrl: API_BASE_URL },
    new EditorStoreAdapter(),
  )

  const sceneId = route.params.sceneId as string
  const ok = await persistenceManager.initPublic(sceneId)
  if (!ok) {
    status.value = 'notfound'
    return
  }

  // 灯光沿用场景元数据（与编辑器一致）
  sceneManager.setAmbientLight(
    editorCoreStore.sceneMetadata.backgroundColor,
    editorCoreStore.sceneMetadata.ambientIntensity,
  )

  status.value = 'ready'

  observer = new ResizeObserver((entries) => {
    if (!sceneManager) return
    const entry = entries[0]
    if (entry && entry.contentRect) {
      const { width, height } = entry.contentRect
      sceneManager.onWindowResize(width, height)
    } else {
      sceneManager.onWindowResize()
    }
  })
  observer.observe(container.value as HTMLElement)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  sceneManager = null
  persistenceManager = null
})
</script>

<style scoped>
.viewer-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: #1a1a2e;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.viewer-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #ddd;
  background: rgba(26, 26, 46, 0.92);
  text-align: center;
}

.viewer-overlay h2 {
  margin: 0;
  font-size: 20px;
}

.viewer-overlay p {
  margin: 0;
  color: #aaa;
  font-size: 14px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #444;
  border-top-color: #4f8cff;
  border-radius: 50%;
  animation: viewer-spin 0.8s linear infinite;
}

@keyframes viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
