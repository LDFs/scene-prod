<template>
  <div class="properties-panel" v-if="selectedObject">
    <h3>属性</h3>

    <!-- General -->
    <div class="section">
      <h4>常规 (General)</h4>
      <div class="prop-row">
        <label>名称</label>
        <input type="text" v-model="localName" @blur="nameBlurHandler" @keyup.enter="nameBlurHandler">
      </div>
      <div class="prop-row">
        <label>ID</label>
        <input type="text" v-model="selectedObject.uuid" :disabled="true">
      </div>
      <div class="prop-row">
        <label>类型</label>
        <span class="readonly-val">{{ selectedObject.type }}</span>
      </div>
      <div class="prop-row">
        <label>可见性</label>
        <input type="checkbox" v-model="selectedObject.visible" @change="onVisibleChange">
      </div>
    </div>

    <!-- Position -->
    <div class="section" :key="'pos-' + forceUpdateKey">
      <h4>位置 (Position)</h4>
      <div class="prop-row">
        <label>X</label>
        <input type="number" :value="selectedObject.position.x" @focus="snapshotTransform"
          @change="e => applyTransform('position', 'x', Number((e.target as HTMLInputElement).value))">
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input type="number" :value="selectedObject.position.y" @focus="snapshotTransform"
          @change="e => applyTransform('position', 'y', Number((e.target as HTMLInputElement).value))">
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input type="number" :value="selectedObject.position.z" @focus="snapshotTransform"
          @change="e => applyTransform('position', 'z', Number((e.target as HTMLInputElement).value))">
      </div>
    </div>

    <!-- Geographic Coordinates -->
    <!-- <div class="section" v-if="isGisEnabled" :key="'geo-' + forceUpdateKey">
      <h4>地理坐标 (Lat/Lng/Height)</h4>
      <div class="prop-row">
        <label>经度</label>
        <input type="number" step="0.000001" v-model.number="geoLng" @change="updatePositionFromGeo">
        <span class="unit">°</span>
      </div>
      <div class="prop-row">
        <label>纬度</label>
        <input type="number" step="0.000001" v-model.number="geoLat" @change="updatePositionFromGeo">
        <span class="unit">°</span>
      </div>
      <div class="prop-row">
        <label>高度</label>
        <input type="number" step="0.01" v-model.number="geoHeight" @change="updatePositionFromGeo">
        <span class="unit">m</span>
      </div>
    </div> -->

    <!-- Rotation -->
    <div class="section" :key="'rot-' + forceUpdateKey">
      <h4>旋转 (Rotation)</h4>
      <div class="prop-row">
        <label>X</label>
        <input type="number" :value="toDegrees(selectedObject.rotation.x)"
          @change="e => updateRotation('x', Number((e.target as HTMLInputElement).value))">
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input type="number" :value="toDegrees(selectedObject.rotation.y)"
          @change="e => updateRotation('y', Number((e.target as HTMLInputElement).value))">
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input type="number" :value="toDegrees(selectedObject.rotation.z)"
          @change="e => updateRotation('z', Number((e.target as HTMLInputElement).value))">
      </div>
    </div>

    <!-- Scale -->
    <div class="section" :key="'scale-' + forceUpdateKey">
      <h4>缩放 (Scale)</h4>
      <div class="prop-row">
        <label>X</label>
        <input type="number" :value="selectedObject.scale.x" @focus="snapshotTransform"
          @change="e => applyTransform('scale', 'x', Number((e.target as HTMLInputElement).value))">
      </div>
      <div class="prop-row">
        <label>Y</label>
        <input type="number" :value="selectedObject.scale.y" @focus="snapshotTransform"
          @change="e => applyTransform('scale', 'y', Number((e.target as HTMLInputElement).value))">
      </div>
      <div class="prop-row">
        <label>Z</label>
        <input type="number" :value="selectedObject.scale.z" @focus="snapshotTransform"
          @change="e => applyTransform('scale', 'z', Number((e.target as HTMLInputElement).value))">
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
import { useEditorCoreStore } from '@/stores/editorCore';
import { useManagerStore } from '@/stores/manager';
import { useHistoryStore } from '@/stores/history';
import { storeToRefs } from 'pinia';
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { PropertiyBaseCommand, TransformObjectCommand } from '@scene-prod/core'
import * as THREE from 'three';
import { PropertyType } from '@scene-prod/shared';

const editorCoreStore = useEditorCoreStore();
const { selectedObject, stateVersion } = storeToRefs(editorCoreStore);
const managerStore = useManagerStore();
const historyStore = useHistoryStore();

const localName = ref('')
// 强制更新 key（用于触发 Vue 重新读取 Three.js 对象属性）
const forceUpdateKey = ref(0);

watch(selectedObject, (newVal) => {
  if (newVal) {
    localName.value = newVal.name || '';
  }
}, { immediate: true })

watch(stateVersion, () => {
  if (selectedObject.value) {
    localName.value = selectedObject.value.name || ''
    forceUpdateKey.value++   // 刷新 position/rotation/scale 的 :key
  }
})


const nameBlurHandler = () => {
  // 修改完之后，再记录新的值
  if (selectedObject.value && selectedObject.value?.name !== localName.value) {
    const cmd = new PropertiyBaseCommand(
      selectedObject.value, 
      { name: selectedObject.value.name, visible: selectedObject.value.visible }, 
      { name: localName.value, visible: selectedObject.value.visible }
    )
    historyStore.execute(cmd);
    editorCoreStore.notifyTreeUpdate();
    selectedObject.value.userData.visibleModified = true;
  }
  console.log('blur name-', localName.value, historyStore.undoStack);
}

const onVisibleChange = (event: Event) => {
  if (!selectedObject.value) return
  const val = (event.target as HTMLInputElement).checked;
  const cmd = new PropertiyBaseCommand(
    selectedObject.value, 
    { name: selectedObject.value?.name ?? '', visible: !val }, 
    { name: selectedObject.value?.name ?? '', visible: val }
  )
  historyStore.execute(cmd);

  selectedObject.value.userData.visibleModified = true;
  editorCoreStore.notifyTreeUpdate();
  console.log('visible change-', val, historyStore.undoStack);
}

const onTransformChange = (type: 'position' | 'scale' | 'rotation') => {
  if (!selectedObject.value) {
    return
  }
  switch (type) {
    case 'position':
      selectedObject.value.userData.positionModified = true;
      break;
    case 'scale':
      selectedObject.value.userData.scaleModified = true;
      break;
    case 'rotation':
      selectedObject.value.userData.rotationModified = true;
      break;
  }
  managerStore.transformController?.updateSelection()
}

const handleTransformChanged = (event: Event) => {
  if (event.detail?.object === selectedObject.value) {
    forceUpdateKey.value++;
  }
}

onMounted(() => {
  window.addEventListener('transform-changed', handleTransformChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener('transform-changed', handleTransformChanged);
});

const toDegrees = (radians: number) => {
  return radians * (180 / Math.PI);
}

const updateRotation = (axis: 'x' | 'y' | 'z', value: number) => {
  if (!selectedObject.value) return
  snapshotTransform()
  applyTransform('rotation', axis, toRadians(value));
}

const toRadians = (degrees: number) => {
  return degrees * (Math.PI / 180);
}

const transformSnapshot = ref<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } | null>(null)
const snapshotTransform = () => {
  if (!selectedObject.value) return
  transformSnapshot.value = {
    position: selectedObject.value.position.clone(),
    rotation: selectedObject.value.rotation.clone(),
    scale: selectedObject.value.scale.clone(),
  }
}

const applyTransform = (type: 'position' | 'scale' | 'rotation', axis: 'x' | 'y' | 'z', value: number) => {
  if (!selectedObject.value || !transformSnapshot.value) return
  selectedObject.value[type][axis] = value
  // 构造 old/new state，提交 Command
  const newState = {
    position: selectedObject.value.position.clone(),
    rotation: selectedObject.value.rotation.clone(),
    scale: selectedObject.value.scale.clone(),
  }
  const cmd = new TransformObjectCommand(
    selectedObject.value,
    transformSnapshot.value,   // focus 时记录的快照
    newState,
  )
  historyStore.pushWithoutExecute(cmd)
  onTransformChange(type)
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

input[type="color"] {
  padding: 0;
  height: 24px;
  cursor: pointer;
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