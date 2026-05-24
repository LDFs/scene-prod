<template>
  <div class="material-panel" v-if="material" :key="'material-' + forceUpdateKey">
    <h3>材质</h3>

    <div class="section">
      <h4>基本属性</h4>
      <div class="prop-row">
        <label>类型</label>
        <span class="readonly-val">{{ material.type }}</span>
      </div>

      <div class="prop-row" v-if="material.color">
        <label>颜色</label>
        <input type="color" :value="'#' + material.color.getHexString()" @change="updateColor">
      </div>

      <div class="prop-row" v-if="material.map !== undefined">
        <label>贴图</label>
        <span class="readonly-val">{{ material.map ? (material.map.name || 'Texture') : '无' }}</span>
      </div>
    </div>

    <div class="section" v-if="material.roughness !== undefined || material.metalness !== undefined">
      <h4>PBR 属性</h4>
      <div class="prop-row" v-if="material.roughness !== undefined">
        <label>粗糙度</label>
        <input type="number" min="0" max="1" step="0.1" name="roughness" :value="material.roughness" @change="onMaterialChange">
      </div>
      <div class="prop-row" v-if="material.metalness !== undefined">
        <label>金属度</label>
        <input type="number" min="0" max="1" step="0.1" name="metalness" :value="material.metalness" @change="onMaterialChange">
      </div>
    </div>

    <div class="section" v-if="material.emissive !== undefined || material.emissiveIntensity !== undefined">
      <h4>自发光</h4>
      <div class="prop-row" v-if="material.emissive !== undefined">
        <label>颜色</label>
        <input type="color" :value="material.emissive" @change="updateEmissive">
      </div>
      <div class="prop-row" v-if="material.emissiveIntensity !== undefined">
        <label>强度</label>
        <input type="number" min="0" max="5" step="0.1" name="emissiveIntensity" :value="material.emissiveIntensity"
          @change="onMaterialChange">
      </div>
    </div>

    <div class="section">
      <h4>渲染选项</h4>
      <div class="prop-row">
        <label>混合模式</label>
        <select name="blending" :value="material.blending" @change="onMaterialChange">
          <option :value="THREE.NoBlending">No Blending</option>
          <option :value="THREE.NormalBlending">Normal</option>
          <option :value="THREE.AdditiveBlending">Additive</option>
          <option :value="THREE.SubtractiveBlending">Subtractive</option>
          <option :value="THREE.MultiplyBlending">Multiply</option>
        </select>
      </div>

      <div class="prop-row">
        <label>渲染面</label>
        <select name="side" :value="material.side" @change="onShaderAffectingChange">
          <option :value="THREE.FrontSide">Front</option>
          <option :value="THREE.BackSide">Back</option>
          <option :value="THREE.DoubleSide">Double</option>
        </select>
      </div>

      <div class="prop-row">
        <label>透明</label>
        <input type="checkbox" name="transparent" :checked="material.transparent" @change="onShaderAffectingChange">
      </div>

      <div class="prop-row" v-if="material.opacity !== undefined">
        <label>不透明度</label>
        <input type="range" min="0" max="1" step="0.01" :value="material.opacity" @input="onOpacityInput">
        <span class="range-val">{{ opacityVal.toFixed(2) }}</span>
      </div>

      <div class="prop-row" v-if="material.alphaTest !== undefined">
        <label>Alpha裁切</label>
        <input type="range" min="0" max="1" step="0.01" :value="material.alphaTest" @input="onAlphaTestInput">
        <span class="range-val">{{ alphaTestVal.toFixed(2) }}</span>
      </div>

      <div class="prop-row">
        <label>深度测试</label>
        <input type="checkbox" name="depthTest" :checked="material.depthTest" @change="onShaderAffectingChange">
      </div>

      <div class="prop-row">
        <label>深度写入</label>
        <input type="checkbox" name="depthWrite" :checked="material.depthWrite" @change="onShaderAffectingChange">
      </div>

      <div class="prop-row">
        <label>顶点颜色</label>
        <input type="checkbox" name="vertexColors" :checked="material.vertexColors" @change="onShaderAffectingChange">
      </div>

      <div class="prop-row" v-if="material.wireframe !== undefined">
        <label>线框</label>
        <input type="checkbox" name="wireframe" :checked="material.wireframe" @change="onShaderAffectingChange">
      </div>

      <div class="prop-row" v-if="material.flatShading !== undefined">
        <label>平面着色</label>
        <input type="checkbox" name="flatShading" :checked="material.flatShading" @change="onShaderAffectingChange">
      </div>
    </div>
  </div>
  <div class="material-panel" v-else>
    <p class="empty-msg">请选择有材质的对象</p>
  </div>
</template>

<script lang="ts" setup>
import { useEditorCoreStore } from '@/stores/editorCore';
import { storeToRefs } from 'pinia';
import * as THREE from 'three';
import { computed, watch, ref } from 'vue';
import { MaterialObjectCommand } from '@scene-prod/core';
import { useHistoryStore } from '@/stores/history';

const editorCoreStore = useEditorCoreStore();
const { selectedObject, stateVersion } = storeToRefs(editorCoreStore);
const historyStore = useHistoryStore();

const forceUpdateKey = ref(0);

watch(stateVersion, () => {
  forceUpdateKey.value++;
})

const getMesh = (): THREE.Mesh | null => {
  const obj = selectedObject.value
  return obj instanceof THREE.Mesh ? obj : null
}

const material = computed(() => {
  const mesh = getMesh()
  if (!mesh) return null
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return mat instanceof THREE.MeshStandardMaterial ? mat : null
})

const withMaterialCommand = (applyChange: (mat: THREE.MeshStandardMaterial) => void) => {
  const mat = material.value
  const object = selectedObject.value
  if (!mat || !object) return
  const oldState = mat.clone();
  applyChange(mat);
  const newState = mat.clone();

  const cmd = new MaterialObjectCommand(object, oldState, newState);
  historyStore.pushWithoutExecute(cmd);
  object.userData.materialModified = true;
  editorCoreStore.notifyTreeUpdate();
}

const updateColor = (event: Event) => {
  const val = (event.target as HTMLInputElement).value;

  withMaterialCommand((mat) => {
    mat.color.set(val);
  });
}

/**
 * 自发光
 */
const updateEmissive = (event: Event) => {
  const val = (event.target as HTMLInputElement).value;

  withMaterialCommand((mat) => {
    mat.emissive.set(val);
  });
}

/**
 * 值类型的修改
 */
const onMaterialChange = (event: Event) => {
  const key = (event.target as HTMLInputElement).name;
  
  withMaterialCommand((mat) => {
    (mat as any)[key] = parseFloat((event.target as HTMLInputElement).value);
  });
}

/**
 * boolean 类型的修改
 */
const onShaderAffectingChange = (event: Event) => {
  const key = (event.target as HTMLInputElement).name;

  withMaterialCommand((mat) => {
    (mat as any)[key] = (event.target as HTMLInputElement).checked;
    // 触发着色器重新编译
    mat.needsUpdate = true;
  });
}

const opacityVal = computed(() => {
  return material.value?.opacity ?? 1;
})

const alphaTestVal = computed(() => {
  return material.value?.alphaTest ?? 0;
})

/**
 * 透明度修改
 */
const onOpacityInput = (event: Event) => {
  const val = (event.target as HTMLInputElement).value;

  withMaterialCommand((mat) => {
    mat.opacity = parseFloat(val);
  });
}

/**
 * Alpha裁切修改
 */
const onAlphaTestInput = (event: Event) => {
  const val = (event.target as HTMLInputElement).value;

  withMaterialCommand((mat) => {
    mat.alphaTest = parseFloat(val);
  });
}
</script>

<style scoped>
.material-panel {
  width: 100%;
  height: 100%;
  background: #222;
  color: white;
  padding: 15px;
  overflow-y: auto;
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
  width: 70px;
  min-width: 70px;
  font-size: 12px;
  color: #aaa;
}

input {
  flex: 1;
  min-width: 0;
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

input[type="checkbox"] {
  flex: none;
  width: 16px;
  height: 16px;
}

input[type="range"] {
  -webkit-appearance: auto;
  appearance: auto;
  background: transparent;
  border: none;
  padding: 0;
  height: 20px;
  cursor: pointer;
}

input[type="range"]:focus {
  border: none;
  outline: none;
}

.range-val {
  min-width: 36px;
  text-align: right;
  font-size: 11px;
  color: #aaa;
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}

select {
  flex: 1;
  background: #333;
  border: 1px solid #444;
  color: white;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
}

select:focus {
  border-color: #0066cc;
  outline: none;
}

.readonly-val {
  color: #888;
  font-size: 12px;
}

.empty-msg {
  color: #666;
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}
</style>