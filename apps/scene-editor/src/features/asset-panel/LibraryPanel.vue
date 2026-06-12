<template>
  <div class="library-panel">
    <h3>资源库</h3>

    <!-- 几何体部分 -->
    <div class="section">
      <h4>几何体</h4>
      <div class="item" draggable="true" @dragstart="onDragStart($event, 'Box')">
        📦 立方体
      </div>
      <div class="item" draggable="true" @dragstart="onDragStart($event, 'Sphere')">
        🔵 球体
      </div>
    </div>

    <!-- 模型部分 -->
    <div class="section">
      <div class="section-header">
        <h4>模型</h4>
        <button class="refresh-btn" @click="loadAssets" title="刷新">🔄</button>
      </div>

      <div v-if="loading" class="loading">
        加载中...
      </div>

      <div v-else-if="models.length === 0" class="empty">
        暂无模型
      </div>

      <div v-else v-for="model in models" :key="model._id" class="item" draggable="true"
        @dragstart="onDragStart($event, model.type, model)" :title="model.originalName">
        🎨 {{ model.name }}
      </div>
    </div>

    <!-- 环境贴图部分 -->
    <div class="section" id="env-section">
      <div class="section-header">
        <h4>环境贴图</h4>
      </div>

      <div v-if="loading" class="loading">
        加载中...
      </div>

      <div v-else-if="environments.length === 0" class="empty">
        暂无环境贴图
      </div>

      <div v-else v-for="env in environments" :key="env._id" class="item" draggable="true"
        @dragstart="onDragStart($event, 'Environment', getAssetUrl(env))" :title="env.originalName">
        🌅 {{ env.name }}
      </div>
    </div>

    <!-- 3D Tiles 部分 -->
    <div class="section">
      <div class="section-header">
        <h4>3D Tiles</h4>
        <button class="refresh-btn" @click="loadAssets" title="刷新">🔄</button>
      </div>

      <div v-if="loading" class="loading">
        加载中...
      </div>

      <div v-else-if="tilesets.length === 0" class="empty">
        暂无 3D Tiles
      </div>

      <div v-else v-for="tileset in tilesets" :key="tileset._id" class="item" draggable="true"
        @dragstart="onDragStart($event, 'Tileset', tileset.tilesetUrl)" :title="tileset.originalName">
        🌐 {{ tileset.name }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getAssets, getModelUrl } from '@/services/asset';
import { AssetWithId } from '@scene-prod/shared';

const models = ref<AssetWithId[]>([]);
const environments = ref<AssetWithId[]>([]);
const tilesets = ref<AssetWithId[]>([]);
const loading = ref(false);

const loadAssets = async () => {
  loading.value = true;
  try {
    const [modelAssets, envAssets, tilesetAssets] = await Promise.all([
      getAssets('model'),
      getAssets('hdri'),
      getAssets('tileset')
    ]);
    models.value = modelAssets.assets;
    environments.value = envAssets.assets;
    tilesets.value = tilesetAssets.assets;
  } catch (error) {
    console.error('加载资产失败:', error);
  } finally {
    loading.value = false;
    // 通知外部资源加载完成（用于新手引导等）
    window.dispatchEvent(new CustomEvent('library-loaded'));
  }
}
const onDragStart = (event: DragEvent, type: string, model: AssetWithId) => {
  event.dataTransfer?.setData('type', type);
  const url = getAssetUrl(model)
  if (url) {
    // 'url'是 DataTransfer API 中的保留格式名，它的格式需要为合法的绝对URI(以http:// 或 https:// 等开头)，否则浏览器会认为这不是合法的URI，会默认丢弃这个值
    // 如果不想被默认丢弃，可以使用其他的格式名，如 'modelUrl'
    event.dataTransfer?.setData('url', url);
    event.dataTransfer?.setData('name', model.name);
  }
}
const getAssetUrl = (asset: AssetWithId) => {
  return getModelUrl(asset);
}

onMounted(() => {
  loadAssets()
})

</script>

<style scoped>
.library-panel {
  width: 250px;
  height: 100%;
  background: #222;
  color: white;
  padding: 10px;
  overflow-y: auto;
}

h3 {
  margin: 0 0 15px 0;
  font-size: 14px;
  color: #aaa;
  text-transform: uppercase;
}

.section {
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

h4 {
  width: 100%;
  margin: 0;
  font-size: 12px;
  color: #888;
  font-weight: normal;
}

.refresh-btn {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  transition: color 0.2s;
}

.refresh-btn:hover {
  color: white;
}

.item {
  width: 140px;
  padding: 10px;
  background: #2a2a2a;
  cursor: grab;
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.2s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item:hover {
  background: #333;
}

.item:active {
  cursor: grabbing;
}

.loading,
.empty {
  width: 100%;
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: #666;
}
</style>