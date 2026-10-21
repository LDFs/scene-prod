<template>
  <div class="properties-panel" v-if="selectedObject">
    <h3>属性</h3>

    <!-- General -->
    <div class="section">
      <h4>常规 (General)</h4>
      <div class="prop-row">
        <label>名称</label>
        <input type="text" :value="objectName" @change="changeName" />
      </div>
      <div class="prop-row">
        <label>ID</label>
        <input type="text" :value="selectedObject.uuid" :disabled="true" />
      </div>
      <div class="prop-row">
        <label>类型</label>
        <span class="readonly-val">{{ selectedObject.type }}</span>
      </div>
      <div class="prop-row">
        <label>可见性</label>
        <input type="checkbox" :checked="selectedObject.visible" @change="onVisibleChange" />
      </div>
    </div>

    <!-- Size：包围盒实际尺寸，只读 -->
    <div class="section">
      <h4>尺寸 (Size)</h4>
      <template v-if="objectSize">
        <div class="prop-row">
          <label>宽 X</label>
          <span class="readonly-val">{{ formatLength(objectSize.x) }}</span
          ><span class="unit">m</span>
        </div>
        <div class="prop-row">
          <label>高 Y</label>
          <span class="readonly-val">{{ formatLength(objectSize.y) }}</span
          ><span class="unit">m</span>
        </div>
        <div class="prop-row">
          <label>深 Z</label>
          <span class="readonly-val">{{ formatLength(objectSize.z) }}</span
          ><span class="unit">m</span>
        </div>
      </template>
      <p v-else class="empty-hint">该对象不含几何体</p>
    </div>

    <!-- Position -->
    <div class="section" :key="'pos-' + forceUpdateKey">
      <h4>位置 (Position)</h4>
      <div class="prop-row">
        <label>X</label>
        <input
          type="number"
          :value="selectedObject.position.x"
          @change="(e) => changePRS('position', 'x', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input
          type="number"
          :value="selectedObject.position.y"
          @change="(e) => changePRS('position', 'y', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input
          type="number"
          :value="selectedObject.position.z"
          @change="(e) => changePRS('position', 'z', Number((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <!-- Rotation -->
    <div class="section" :key="'rot-' + forceUpdateKey">
      <h4>旋转 (Rotation)</h4>
      <div class="prop-row">
        <label>X</label>
        <input
          type="number"
          :value="toDegrees(selectedObject.rotation.x)"
          @change="(e) => changePRS('rotation', 'x', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input
          type="number"
          :value="toDegrees(selectedObject.rotation.y)"
          @change="(e) => changePRS('rotation', 'y', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input
          type="number"
          :value="toDegrees(selectedObject.rotation.z)"
          @change="(e) => changePRS('rotation', 'z', Number((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <!-- Scale -->
    <div class="section" :key="'scale-' + forceUpdateKey">
      <h4>缩放 (Scale)</h4>
      <div class="prop-row">
        <label>X</label>
        <input
          type="number"
          :value="selectedObject.scale.x"
          @change="(e) => changePRS('scale', 'x', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input
          type="number"
          :value="selectedObject.scale.y"
          @change="(e) => changePRS('scale', 'y', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input
          type="number"
          :value="selectedObject.scale.z"
          @change="(e) => changePRS('scale', 'z', Number((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <div class="debug-info">
      <small>UUID: {{ selectedObject.uuid.slice(0, 8) }}...</small>
    </div>
  </div>
  <div class="properties-panel" v-else>
    <p class="empty-msg">未选择对象</p>
  </div>
</template>

<script setup lang="ts">
import { useEditorCoreStore } from '@/stores/editorCore'
import { useManagerStore } from '@/stores/manager'
import { useHistoryStore } from '@/stores/history'
import { storeToRefs } from 'pinia'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { getObjectSize, HandleActualCommand } from '@scene-prod/core'
import * as THREE from 'three'

const editorCoreStore = useEditorCoreStore()
const { selectedObject, stateVersion } = storeToRefs(editorCoreStore)
const managerStore = useManagerStore()
const historyStore = useHistoryStore()

// 强制更新 key（用于触发 Vue 重新读取 Three.js 对象属性）
const forceUpdateKey = ref(0)
// 面板内直接改缩放时不重挂 position/rotation/scale 区块（会打断正在编辑的输入框），
// 单独用一个计数器只驱动尺寸的重算
const sizeVersion = ref(0)

/**
 * 选中对象的实际尺寸（含缩放）
 * Three.js 对象不是响应式的，靠 forceUpdateKey / sizeVersion 触发重算
 */
const objectSize = computed(() => {
  void forceUpdateKey.value
  void sizeVersion.value
  if (!selectedObject.value) return null
  return getObjectSize(selectedObject.value)
})

const formatLength = (value: number) => value.toFixed(3)

watch(stateVersion, () => {
  if (selectedObject.value) {
    forceUpdateKey.value++ // 刷新 position/rotation/scale 的 :key
  }
})

const objectName = computed(() => {
  stateVersion.value
  return selectedObject.value ? selectedObject.value.name : ''
})

const updateObjectProperty = <K extends 'name' | 'visible'>(key: K, newValue: THREE.Object3D[K]) => {
  const target = selectedObject.value
  if (!(target instanceof THREE.Object3D)) return

  const oldValue = target[key]
  if (oldValue === newValue) return

  const setter = (value: THREE.Object3D[K]) => {
    target[key] = value
    editorCoreStore.notifyStateUpdate()
  }

  const cmd = new HandleActualCommand<THREE.Object3D[K]>(oldValue, newValue, setter)
  historyStore.execute(cmd)
}

const changeName = (event: Event) => {
  updateObjectProperty('name', (event.target as HTMLInputElement).value)
}

const onVisibleChange = (event: Event) => {
  updateObjectProperty('visible', (event.target as HTMLInputElement).checked)
}

const onTransformChange = (type: 'position' | 'scale' | 'rotation') => {
  if (!selectedObject.value) {
    return
  }
  switch (type) {
    case 'position':
      selectedObject.value.userData.positionModified = true
      break
    case 'scale':
      selectedObject.value.userData.scaleModified = true
      break
    case 'rotation':
      selectedObject.value.userData.rotationModified = true
      break
  }
  managerStore.transformController?.updateSelection()
}

const handleTransformChanged = (event: Event) => {
  if (event.detail?.object === selectedObject.value) {
    forceUpdateKey.value++
  }
}

onMounted(() => {
  window.addEventListener('transform-changed', handleTransformChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('transform-changed', handleTransformChanged)
})

const toDegrees = (radians: number) => {
  return (radians * (180 / Math.PI)).toFixed(2)
}

const toRadians = (degrees: number) => {
  return degrees * (Math.PI / 180)
}

const changePRS = (type: 'position' | 'scale' | 'rotation', axis: 'x' | 'y' | 'z', value: number) => {
  if (!selectedObject.value) return

  const oldValue = selectedObject.value[type][axis]
  if (type === 'rotation') {
    value = toRadians(value)
  }
  const object = selectedObject.value
  const newValue = value
  const setter = (value: number) => {
    if (!object) return
    if (object instanceof THREE.Object3D) {
      object[type][axis] = value
      useEditorCoreStore().notifyStateUpdate()
    }
  }

  const cmd = new HandleActualCommand(oldValue, newValue, setter)
  historyStore.execute(cmd)
}
</script>

<style scoped>
.properties-panel {
  width: 280px;
  background: #222;
  color: white;
  padding: 15px;
  overflow-y: auto;
  border-left: 1px solid #333;
}

h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  color: #fff;
  border-bottom: 1px solid #444;
  padding-bottom: 10px;
}

.section {
  margin-bottom: 20px;
  background: #2a2a2a;
  padding: 10px;
  border-radius: 4px;
}

h4 {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: #888;
  font-weight: normal;
  text-transform: uppercase;
}

.prop-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.prop-row:last-child {
  margin-bottom: 0;
}

label {
  width: 60px;
  font-size: 12px;
  color: #aaa;
}

input {
  flex: 1;
  background: #333;
  border: 1px solid #444;
  color: white;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
}

input:focus {
  border-color: #0066cc;
  outline: none;
}

input[type='color'] {
  padding: 0;
  height: 24px;
  cursor: pointer;
}

.readonly-val {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  color: #ddd;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-hint {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.empty-msg {
  color: #666;
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}

.unit {
  margin-left: 4px;
  font-size: 12px;
  color: #888;
  min-width: 16px;
}

.debug-info {
  margin-top: 20px;
  color: #444;
  font-size: 10px;
  text-align: center;
}
</style>
