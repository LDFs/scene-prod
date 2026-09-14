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

      <!-- 贴图槽位：从资源库「贴图」分区拖拽进来即替换 -->
      <div class="prop-row" v-for="slot in TEXTURE_SLOTS" :key="slot.key">
        <label>{{ slot.label }}</label>
        <div
          class="texture-slot"
          :class="{ 'is-over': dragOverSlot === slot.key, 'is-busy': loadingSlot === slot.key }"
          @dragenter.prevent="dragOverSlot = slot.key"
          @dragover.prevent
          @dragleave="onSlotDragLeave($event, slot)"
          @drop.prevent="onSlotDrop($event, slot)"
        >
          <span v-if="loadingSlot === slot.key" class="slot-spinner"></span>
          <template v-else-if="getTexture(slot.key)">
            <!-- draggable=false：不然拖缩略图会起一次新的拖拽，把槽位状态搅乱 -->
            <img
              v-if="getTextureThumb(slot.key)"
              class="slot-thumb"
              draggable="false"
              :src="getTextureThumb(slot.key)"
              :alt="getTextureName(slot.key)"
            />
            <!-- 模型自带的内嵌贴图没有 url，给个占位图标 -->
            <span v-else class="slot-thumb slot-thumb-embedded" title="模型自带贴图">🖼</span>
            <span class="slot-name" :title="getTextureName(slot.key)">{{ getTextureName(slot.key) }}</span>
            <button class="slot-clear" title="移除贴图" @click="clearSlot(slot)">×</button>
          </template>
          <span v-else class="slot-empty">拖入贴图</span>
        </div>
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
import { MaterialObjectCommand, MaterialMapCommand, loadAssetTexture, type MaterialMapSlot } from '@scene-prod/core';
import { useHistoryStore } from '@/stores/history';
import { ElMessage } from 'element-plus';

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

// —— 贴图槽位 —— //

type TextureSlotDef = {
  key: MaterialMapSlot
  label: string
  /** 颜色贴图要走 sRGB，法线这类数据贴图不能做色彩转换 */
  colorSpace: THREE.ColorSpace
}

const TEXTURE_SLOTS: TextureSlotDef[] = [
  { key: 'map', label: '贴图', colorSpace: THREE.SRGBColorSpace },
  { key: 'normalMap', label: '法线贴图', colorSpace: THREE.NoColorSpace },
]

/**
 * TextureLoader 能直接加载的格式。
 * hdr/exr 是环境贴图（走场景设置那条链路），ktx2 需要 KTX2Loader，都不在这里接。
 */
const ACCEPTED_TEXTURE_FORMATS = ['jpg', 'jpeg', 'png', 'webp']

const dragOverSlot = ref<MaterialMapSlot | null>(null)
const loadingSlot = ref<MaterialMapSlot | null>(null)

/** 从指定材质上取槽位贴图。异步流程里必须用捕获的材质引用，不能读 material.value */
const getTextureOf = (mat: THREE.MeshStandardMaterial, key: MaterialMapSlot): THREE.Texture | null => {
  return (mat as any)[key] ?? null
}

const getTexture = (key: MaterialMapSlot): THREE.Texture | null => {
  return material.value ? getTextureOf(material.value, key) : null
}

/** 缩略图地址。内嵌贴图没有 assetUrl，返回空串由模板回落到占位图标 */
const getTextureThumb = (key: MaterialMapSlot): string => {
  return getTexture(key)?.userData?.assetUrl ?? ''
}

const getTextureName = (key: MaterialMapSlot): string => {
  const texture = getTexture(key)
  if (!texture) return ''
  return texture.name || '贴图'
}

/**
 * dragleave 在光标移到子元素（缩略图、文件名）上时也会冒上来，
 * 只有真正离开整个槽位才取消高亮，否则拖拽过程中边框会闪。
 */
const onSlotDragLeave = (event: DragEvent, slot: TextureSlotDef) => {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  if (dragOverSlot.value === slot.key) dragOverSlot.value = null
}

const onSlotDrop = async (event: DragEvent, slot: TextureSlotDef) => {
  dragOverSlot.value = null

  // dataTransfer 只在 drop 事件同步派发期间可读，await 之后 getData 一律返回空串
  const dt = event.dataTransfer
  const type = dt?.getData('type') ?? ''
  const url = dt?.getData('url') ?? ''
  const name = dt?.getData('name') ?? ''
  const format = (dt?.getData('format') ?? '').toLowerCase()

  // 拖进来的不是贴图资源（模型、几何体等），静默忽略，不打扰用户
  if (type !== 'texture' || !url) return

  if (!ACCEPTED_TEXTURE_FORMATS.includes(format)) {
    ElMessage({
      message:
        format === 'hdr' || format === 'exr'
          ? 'HDR/EXR 是环境贴图，请在场景设置里使用'
          : `暂不支持 ${format.toUpperCase() || '该'} 格式作为材质贴图`,
      type: 'warning',
    })
    return
  }

  if (loadingSlot.value) return

  const mat = material.value
  const object = selectedObject.value
  if (!mat || !object) return

  loadingSlot.value = slot.key
  let texture: THREE.Texture
  try {
    texture = await loadAssetTexture(url, slot.colorSpace)
  } catch {
    ElMessage({ message: `贴图「${name || url}」加载失败`, type: 'error' })
    return
  } finally {
    loadingSlot.value = null
  }
  texture.name = name
  
  // 加载期间用户可能换了选中对象，这次结果不能再落到新材质上
  if (material.value !== mat) return
  const oldTexture = getTextureOf(mat, slot.key)
  if (oldTexture === texture) return

  historyStore.execute(new MaterialMapCommand(object, mat, slot.key, oldTexture, texture))
}

const clearSlot = (slot: TextureSlotDef) => {
  const mat = material.value
  const object = selectedObject.value
  if (!mat || !object) return
  const oldTexture = getTextureOf(mat, slot.key)
  if (!oldTexture) return

  historyStore.execute(new MaterialMapCommand(object, mat, slot.key, oldTexture, null))
}

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
  width: 280px;
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

/* 贴图槽位 */
.texture-slot {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 4px;
  background: #333;
  border: 1px dashed #555;
  border-radius: 3px;
}

.texture-slot.is-over {
  border-color: #0066cc;
  border-style: solid;
  background: #2b3a4a;
}

.texture-slot.is-busy {
  justify-content: center;
}

.slot-thumb {
  flex: none;
  width: 22px;
  height: 22px;
  object-fit: cover;
  border-radius: 2px;
  background: #1c1c1c;
}

.slot-thumb-embedded {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.slot-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #bbb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-empty {
  flex: 1;
  font-size: 11px;
  color: #666;
  text-align: center;
  /* 占位文字不能吃掉 dragleave 的 relatedTarget 判断，但拖拽时它也不该抢事件 */
  pointer-events: none;
}

.slot-clear {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: #888;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.slot-clear:hover {
  color: #e08585;
}

.slot-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #444;
  border-top-color: #0066cc;
  border-radius: 50%;
  animation: material-spin 0.8s linear infinite;
}

@keyframes material-spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-msg {
  color: #666;
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}
</style>