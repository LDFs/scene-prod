<template>
  <!-- TODO: 顶栏工具条（撤销/重做/保存/预览） -->
  <div class="toolbar">
    <div class="group">
      <button @click="setMode('translate')">移动</button>
      <button @click="setMode('rotate')">旋转</button>
      <button @click="setMode('scale')">缩放</button>
    </div>
    <div class="group">
      <button @click="undo">撤销</button>
      <button @click="redo">重做</button>
    </div>

    <!-- 视图切换 -->
    <div class="group view-group">
      <span class="group-label">视图</span>
      <select class="view-select" :value="currentView" @change="onViewChange">
        <option v-for="opt in VIEW_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="group">
      <button
        :class="['toggle-btn', { active: axesVisible }]"
        title="切换世界坐标轴"
        @click="toggleAxes"
      >
        ⊹ 坐标轴
      </button>
    </div>

    <!-- 显示辅助 -->
    <div class="group">
      <button
        :class="['toggle-btn', { active: gridVisible }]"
        title="切换地平面网格"
        @click="toggleGrid"
      >
        ⊞ 网格
      </button>
    </div>

    <div class="group">
      <button title="相机自适应" @click="managerStore.sceneManager?.fitCameraToScene()">◉</button>
    </div>

    <div class="group">
      <button @click="showImportDialog = true" title="批量导入">📥 批量导入</button>
      <button @click="save" class="save-btn">💾 保存</button>
    </div>

    <ImportDialog v-model:visible="showImportDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import ImportDialog from '@/features/toolbar/ImportDialog.vue';
import { useEditorCoreStore } from '@/stores/editorCore';
import { useManagerStore } from '@/stores/manager';
import { TransformControlsMode } from 'three/examples/jsm/controls/TransformControls.js';
import { useHistoryStore } from '@/stores/history';
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
// ViewPreset 本地类型，与 @scene-prod/core ViewManager 保持一致
type ViewPreset = 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left'

const showImportDialog = ref(false);
const editorCoreStore = useEditorCoreStore();
const managerStore = useManagerStore();
const historyStore = useHistoryStore();

const VIEW_OPTIONS: { value: ViewPreset; label: string }[] = [
  { value: 'perspective', label: '透视视图' },
  { value: 'top',         label: '顶视图' },
  { value: 'bottom',      label: '底视图' },
  { value: 'front',       label: '前视图' },
  { value: 'back',        label: '后视图' },
  { value: 'right',       label: '右视图' },
  { value: 'left',        label: '左视图' },
]

const currentView = computed<ViewPreset>(
  () => managerStore.sceneManager?.getView() ?? 'perspective'
)

const onViewChange = (e: Event) => {
  const view = (e.target as HTMLSelectElement).value as ViewPreset
  managerStore.sceneManager?.setView(view)
}

// 网格
const gridVisible = ref(false)
const toggleGrid = () => {
  const next = managerStore.sceneManager?.toggleGrid()
  if (next !== undefined) gridVisible.value = next
}

// 世界坐标轴
const axesVisible = ref(false)
const toggleAxes = () => {
  const next = managerStore.sceneManager?.toggleAxes()
  if (next !== undefined) axesVisible.value = next
}

const setMode = (mode: TransformControlsMode) => {
  managerStore.transformController?.setMode(mode);
}
const undo = () => {
  historyStore.undo();
}
const redo = () => {
  historyStore.redo();
}
const save = async () => {
  await managerStore.persistenceManager?.saveScene(editorCoreStore.sceneMetadata, {
    onSuccess: (message) => {
      ElMessage({
        message,
        type: 'success',
      })
    },
    onError: (message) => {
      ElMessage({
        message,
        type: 'error',
      })
    },
  });
}


</script>

<style scoped>
.toolbar {
  padding: 10px;
  background: #333;
  display: flex;
  gap: 20px;
}

.group {
  display: flex;
  gap: 5px;
}

button {
  padding: 5px 10px;
  background: #555;
  color: white;
  border: none;
  cursor: pointer;
}

button:hover {
  background: #666;
}

.save-btn {
  background: #0066cc;
}

.save-btn:hover {
  background: #0052a3;
}

.view-group {
  align-items: center;
}

.group-label {
  color: #aaa;
  font-size: 12px;
  margin-right: 4px;
}

.view-select {
  padding: 4px 8px;
  background: #555;
  color: white;
  border: 1px solid #666;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  outline: none;
}

.view-select:hover {
  background: #666;
  border-color: #888;
}

.view-select:focus {
  border-color: #0088ff;
}

.toggle-btn.active {
  background: #1a6b3a;
  color: #4ade80;
  outline: 1px solid #4ade80;
}

.toggle-btn.active:hover {
  background: #1f7d45;
}
</style>
