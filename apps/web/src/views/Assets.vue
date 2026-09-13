<template>
  <div class="assets-view">
    <div class="header">
      <router-link to="/" class="home-link">← 返回主页</router-link>
      <h1>资产管理</h1>
      <button class="upload-btn" @click="triggerFileInput"><span>📤</span> 上传资产</button>
      <!-- .gltf 依赖 .bin 和贴图，整目录选择能保留相对路径，是多文件资产最可靠的入口 -->
      <button class="upload-btn" @click="triggerFolderInput" title="上传 .gltf 及其依赖时推荐">
        <span>📁</span> 上传文件夹
      </button>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".gltf,.glb,.bin,.jpg,.jpeg,.png,.webp,.ktx2,.hdr,.exr,.obj,.mtl,.zip,.fbx"
        @change="handleFileSelect"
        style="display: none"
      />
      <input ref="folderInput" type="file" webkitdirectory multiple @change="handleFileSelect" style="display: none" />
    </div>

    <div class="filter-bar">
      <button :class="['filter-btn', { active: currentFilter === null }]" @click="setFilter(null)">全部</button>
      <button :class="['filter-btn', { active: currentFilter === 'model' }]" @click="setFilter('model')">模型</button>
      <button :class="['filter-btn', { active: currentFilter === 'texture' }]" @click="setFilter('texture')">
        贴图
      </button>
    </div>

    <div class="assets-grid" v-if="assets.length > 0">
      <div
        v-for="asset in filteredAssets"
        :key="asset._id"
        :class="['asset-card', { 'asset-card-unusable': isAssetUnusable(asset) }]"
        @click="() => showAssetsDialog(asset)"
      >
        <div class="asset-preview">
          <img v-if="asset.thumbnail" :src="getThumbnailUrl(asset)" :alt="asset.name" class="asset-thumb" />
          <span v-else class="asset-icon">{{ getAssetIcon(asset) }}</span>
          <!-- 流水线是异步的，状态角标让"还在处理"和"处理失败"在列表里就能看见 -->
          <span v-if="getProcessingBadge(asset)" :class="['status-badge', getProcessingBadge(asset)!.className]">
            {{ getProcessingBadge(asset)!.label }}
          </span>
        </div>
        <div class="asset-info">
          <!-- 重命名走行内输入。打开预览的 click 挂在卡片上，所以编辑区的交互一律 .stop -->
          <div class="asset-name-row">
            <input
              v-if="editingId === asset._id"
              :ref="setRenameInput"
              v-model="editingName"
              class="asset-name-input"
              maxlength="100"
              @click.stop
              @keyup.enter="commitRename(asset)"
              @keyup.esc="cancelRename"
              @blur="cancelRename"
            />
            <template v-else>
              <div class="asset-name" :title="asset.name">
                {{ asset.name }}
              </div>
              <button class="rename-btn" title="重命名" @click.stop="startRename(asset)">✏️</button>
            </template>
          </div>
          <div class="asset-meta">
            <span>{{ asset.format.toUpperCase() }}</span>
            <span>{{ formatFileSize(asset.fileSize) }}</span>
          </div>
          <!-- 失败原因直接显示在卡片上，不必点开或查日志 -->
          <div v-if="asset.processingStatus === 'failed'" class="asset-error" :title="asset.processingError">
            {{ asset.processingError || '处理失败' }}
          </div>
        </div>
        <div class="asset-actions">
          <button class="action-btn download-btn" @click.stop="handleDownload(asset)" title="下载">⬇️</button>
          <button class="action-btn delete-btn" @click.stop="handleDelete(asset)" title="删除">🗑️</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>暂无资产</p>
      <p class="hint">点击上方"上传资产"按钮开始上传</p>
    </div>

    <!-- 上传进度提示 -->
    <div v-if="uploading" class="upload-overlay">
      <div class="upload-progress">
        <div class="spinner"></div>
        <p>{{ uploadStatus }}</p>
      </div>
    </div>

    <div class="display-dialog" v-if="showDisplay">
      <button class="close-dialog-btn" @click="closeDialog">×</button>
      <div v-if="showModel" class="dialog-canvas-container" ref="dialogCanvasContainer"></div>
      <!-- 加载期间保留元素（否则 @load 永远不会触发），只是先不显示 -->
      <img
        v-if="showImg"
        class="dialog-img"
        :src="displayImgSrc"
        :style="{ visibility: dialogLoading ? 'hidden' : 'visible' }"
        alt=""
        @load="onDialogImgLoad"
        @error="onDialogImgError"
      />
      <!-- 模型和原图都要走网络，没有反馈的话点开就是一片空白，像是没响应 -->
      <div v-if="dialogLoading || dialogError" class="dialog-status">
        <template v-if="dialogLoading">
          <div class="spinner"></div>
          <p>加载中...</p>
        </template>
        <p v-else class="dialog-error">{{ dialogError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { AssetWithId } from '@scene-prod/shared'
import { getAssets, deleteAsset, downloadAsset, renameAsset } from '../services/asset'
import { BASE_URL } from '@root/config.ts'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { Group, Object3D } from 'three'
import { useAssetUpload } from '../composables/useAssetUpload'

const assets = ref<AssetWithId[]>([])
const currentFilter = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

// 上传流程（依赖扫描、打包、缩略图、串行上传、处理结果汇报）与资源库面板共用
const { uploading, uploadStatus, uploadFiles, getThumbnailGenerator } = useAssetUpload()

const filteredAssets = computed(() => {
  if (currentFilter.value === null) {
    return assets.value
  }
  return assets.value.filter((asset) => asset.type === currentFilter.value)
})

const triggerFileInput = () => {
  fileInput.value?.click()
}

const triggerFolderInput = () => {
  folderInput.value?.click()
}

const setFilter = (filter: string | null) => {
  currentFilter.value = filter
}
const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const files = Array.from(input.files)
  // 清空 value，否则连续选同一批文件不会再触发 change
  input.value = ''
  // 整页列表没有局部更新的必要，上传完和处理完各刷一次即可
  await uploadFiles(files, {
    onUploaded: () => loadAssets(),
    onProcessed: () => loadAssets(),
  })
}

async function loadAssets() {
  const result = await getAssets({
    type: currentFilter.value ?? '',
    page: 1,
    pageSize: 20
  })
  if (result.success) {
    assets.value = result.assets
  } else {
    ElMessage({
      message: '获取资产列表失败:' + result.message,
      type: 'error',
    })
  }
}

const handleDownload = async (asset: AssetWithId) => {
  await downloadAsset(asset._id, asset.originalName)
}

const handleDelete = async (asset: AssetWithId) => {
  const result = await deleteAsset(asset._id)
  if (result.success) {
    ElMessage({
      message: '删除成功:' + result.message,
      type: 'success',
    })
    await loadAssets()
  } else {
    ElMessage({
      message: '删除失败:' + result.message,
      type: 'error',
    })
  }
}

/** 正在重命名的资产 id；同一时刻只允许一个，null 表示没有卡片处于编辑态 */
const editingId = ref<string | null>(null)
const editingName = ref('')
/**
 * v-for 里用字符串 ref 会收集成数组，而这里同时只存在一个输入框，
 * 所以用函数 ref 直接拿元素。只在挂载时赋值：卸载回调传 null，
 * 若它在新元素挂载之后才执行会把刚拿到的引用清掉。
 */
let renameInputEl: HTMLInputElement | null = null
const setRenameInput = (el: unknown) => {
  if (el) renameInputEl = el as HTMLInputElement
}

const startRename = async (asset: AssetWithId) => {
  editingId.value = asset._id
  editingName.value = asset.name
  await nextTick()
  renameInputEl?.focus()
  renameInputEl?.select()
}

const cancelRename = () => {
  editingId.value = null
  editingName.value = ''
}

const commitRename = async (asset: AssetWithId) => {
  const newName = editingName.value.trim()
  // 先退出编辑态：回车会让输入框卸载并触发 blur，届时 cancelRename 就是空操作
  cancelRename()

  if (!newName || newName === asset.name) return

  const result = await renameAsset(asset._id, newName)
  if (!result.success) {
    ElMessage({ message: result.message || '重命名失败', type: 'error' })
    return
  }

  // 就地更新，不为一次改名重新拉整页列表（会丢掉当前滚动位置）
  const target = assets.value.find((item) => item._id === asset._id)
  if (target) {
    target.name = result.asset?.name ?? newName
  }
  ElMessage({ message: '重命名成功', type: 'success' })
}

const dialogCanvasContainer = ref()
const displayImgSrc = ref('')
const showDisplay = ref(false)
const showModel = ref(false)
const showImg = ref(false)
const dialogLoading = ref(false)
const dialogError = ref('')
let showedModel: Object3D | Group | undefined = undefined
/**
 * 预览是异步的，模型可能加载几秒才回来，期间用户完全可能已经关掉弹窗或点开了别的资产。
 * 每次打开自增一个序号，回调里比对；对不上就说明这次结果已经过期，
 * 否则会往关掉的弹窗里塞 canvas，showedModel 也会被覆盖成再也清理不掉的模型。
 */
let dialogToken = 0

const showAssetsDialog = (asset: AssetWithId) => {
  // 处理失败的资产没有可用产物，打开只会是一个空场景，不如直接说明原因
  if (isAssetUnusable(asset)) {
    ElMessage({
      message: `${asset.originalName} 处理失败，无法预览：${asset.processingError || '原因未知'}`,
      type: 'warning',
      duration: 8000,
    })
    return
  }
  // 与上传共用同一个生成器，避免多开一个 WebGL 上下文
  const generator = getThumbnailGenerator()
  showDisplay.value = true
  dialogError.value = ''
  const token = ++dialogToken
  const assetUrl = asset.cloudUrls?.compressed ?? ''
  if (assetUrl.endsWith('glb') || assetUrl.endsWith('gltf')) {
    showModel.value = true
    dialogLoading.value = true
    nextTick(async () => {
      try {
        const model = await generator.showDialogScene(dialogCanvasContainer.value, assetUrl)
        if (token !== dialogToken) {
          // 结果已过期，但模型已经进场景了，得就地清掉，不然会一直留在渲染器里
          if (model) generator.cleanDisplay(model)
          return
        }
        showedModel = model
      } catch (err) {
        if (token !== dialogToken) return
        dialogError.value = `模型加载失败：${err instanceof Error ? err.message : String(err)}`
      } finally {
        if (token === dialogToken) dialogLoading.value = false
      }
    })
  } else if (['jpg', 'jpeg', 'png'].includes(asset.format)) {
    showImg.value = true
    dialogLoading.value = true
    let url = asset.cloudUrls?.file ?? ''
    if (!url.startsWith('http')) {
      url = 'https://' + url
    }
    displayImgSrc.value = url
  } else {
    // 剩下的格式没有预览分支，明说一句总好过给一个空弹窗
    dialogError.value = `暂不支持预览 ${asset.format.toUpperCase()} 格式`
  }
}

const onDialogImgLoad = () => {
  dialogLoading.value = false
}

const onDialogImgError = () => {
  dialogLoading.value = false
  dialogError.value = '图片加载失败'
}

const closeDialog = () => {
  // 作废进行中的加载，避免它回来后往已关闭的弹窗里写东西
  dialogToken++
  showDisplay.value = false
  showModel.value = false
  showImg.value = false
  dialogLoading.value = false
  dialogError.value = ''
  displayImgSrc.value = ''
  if (showedModel) {
    getThumbnailGenerator().cleanDisplay(showedModel)
    showedModel = undefined
  }
}

/** 高动态范围的环境贴图格式。合并 type 后，环境贴图与普通贴图靠 format 区分 */
const ENV_MAP_FORMATS = new Set(['hdr', 'exr'])

const getAssetIcon = (asset: AssetWithId) => {
  // 环境贴图和普通贴图同属 texture，但用途差别很大，图标上仍然分开
  if (ENV_MAP_FORMATS.has(asset.format)) return '🌅'
  const icons = {
    model: '🎨',
    texture: '🖼️',
    effect: '✨',
  }
  return icons[asset.type as keyof typeof icons] || '📦'
}

/**
 * 处理状态的展示信息。skipped 表示无需处理（贴图类资产），不展示标记，
 * 避免正常资产上出现无意义的角标。
 */
const PROCESSING_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: '排队中', className: 'status-pending' },
  processing: { label: '处理中', className: 'status-processing' },
  failed: { label: '处理失败', className: 'status-failed' },
}

const getProcessingBadge = (asset: AssetWithId) => PROCESSING_BADGES[asset.processingStatus ?? ''] ?? null

/** 处理失败的资产不可用，点开也只是空场景，所以禁止预览 */
const isAssetUnusable = (asset: AssetWithId) => asset.processingStatus === 'failed'

/**
 * 获取缩略图 URL，优先使用云端 URL
 */
const getThumbnailUrl = (asset: AssetWithId) => {
  // 优先使用云端 URL
  if (asset.cloudUrls?.thumbnail) {
    return 'https://' + asset.cloudUrls.thumbnail
  }
  // 降级到本地路径
  return BASE_URL + asset.thumbnail
}

const formatFileSize = (bytes: number | undefined) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

onMounted(() => {
  loadAssets()
})
// 缩略图生成器由 useAssetUpload 在卸载时统一释放
</script>

<style scoped>
.assets-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a1a;
  color: white;
}

.header {
  height: 60px;
  background: #222;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  border-bottom: 1px solid #333;
}

.header h1 {
  font-size: 24px;
  margin: 0;
  flex: 1;
  text-align: center;
}

.home-link {
  color: #aaa;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.home-link:hover {
  color: white;
}

.upload-btn {
  padding: 10px 20px;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
}

.upload-btn:hover {
  background: #0052a3;
}

.filter-bar {
  display: flex;
  gap: 10px;
  padding: 20px 30px;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
}

.filter-btn {
  padding: 8px 16px;
  background: #2a2a2a;
  color: #aaa;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #333;
  color: white;
}

.filter-btn.active {
  background: #0066cc;
  color: white;
  border-color: #0066cc;
}

.assets-grid {
  flex: 1;
  padding: 30px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  overflow-y: auto;
  align-content: start;
}

.asset-card {
  background: #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  cursor: pointer;
}

.asset-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.asset-preview {
  height: 150px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 承载右上角的处理状态角标 */
  position: relative;
}

/* 处理失败的资产不可用，降低不透明度以区别于正常资产 */
.asset-card-unusable {
  opacity: 0.65;
}

.asset-card-unusable:hover {
  opacity: 1;
}

.status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 18px;
  color: #fff;
  white-space: nowrap;
}

.status-pending {
  background: #8a6d3b;
}

.status-processing {
  background: #2f6f9f;
}

.status-failed {
  background: #a33;
}

.asset-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ff8a8a;
  /* 错误原文可能很长，最多两行，完整内容留在 title 里 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.asset-icon {
  font-size: 48px;
}

.asset-info {
  padding: 12px;
}

.asset-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  /* 输入框和文字行高不同，固定高度避免进出编辑态时卡片抖动 */
  min-height: 22px;
}

.asset-name {
  flex: 1;
  /* flex 子项默认 min-width:auto，不压到 0 的话长名字会把铅笔挤出卡片 */
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-btn {
  flex: none;
  padding: 0 2px;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.2s;
}

.rename-btn:hover {
  opacity: 1;
}

.asset-name-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: #fff;
  background: #1a1a1a;
  border: 1px solid #0066cc;
  border-radius: 4px;
  outline: none;
}

.asset-meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: #888;
}

.asset-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
}

.action-btn {
  flex: 1;
  padding: 6px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s;
}

.download-btn {
  background: #0066cc;
}

.download-btn:hover {
  background: #0052a3;
}

.delete-btn {
  background: #cc0000;
}

.delete-btn:hover {
  background: #a30000;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
}

.empty-state p {
  margin: 10px 0;
  font-size: 16px;
}

.empty-state .hint {
  font-size: 14px;
  color: #888;
}

.upload-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.upload-progress {
  background: #2a2a2a;
  padding: 40px;
  border-radius: 8px;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #444;
  border-top-color: #0066cc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.asset-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.display-dialog {
  width: 100vw;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background-color: rgba(100, 100, 100, 0.6);
}

.close-dialog-btn {
  border: none;
  width: 80px;
  height: 80px;
  border-radius: 40px;
  font-size: 50px;
  cursor: pointer;
  position: absolute;
  right: 20px;
  top: 20px;
}

.dialog-canvas-container {
  width: 40vw;
  height: 50vh;
  margin: 0 auto;
  top: 50%;
  position: relative;
  transform: translateY(-50%);
}

.dialog-img {
  position: relative;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.dialog-status {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  padding: 32px 40px;
  border-radius: 8px;
  background: rgba(42, 42, 42, 0.9);
  color: #fff;
  text-align: center;
  /* 纯提示层，不要挡住底下画布的拖拽 */
  pointer-events: none;
}

.dialog-status p {
  margin: 0;
}

.dialog-error {
  color: #ff8080;
  max-width: 60vw;
}
</style>
