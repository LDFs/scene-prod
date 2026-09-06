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
      <button :class="['filter-btn', { active: currentFilter === 'hdri' }]" @click="setFilter('hdri')">HDRI</button>
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
          <span v-else class="asset-icon">{{ getAssetIcon(asset.type) }}</span>
          <!-- 流水线是异步的，状态角标让"还在处理"和"处理失败"在列表里就能看见 -->
          <span v-if="getProcessingBadge(asset)" :class="['status-badge', getProcessingBadge(asset)!.className]">
            {{ getProcessingBadge(asset)!.label }}
          </span>
        </div>
        <div class="asset-info">
          <div class="asset-name" :title="asset.originalName">
            {{ asset.originalName }}
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
      <img v-if="showImg" class="dialog-img" ref="displayImg" src="" alt="" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, Ref } from 'vue'
import { AssetWithId } from '@scene-prod/shared'
import { uploadAsset, getAssets, deleteAsset, downloadAsset, waitForProcessing } from '../services/asset'
import { BASE_URL } from '@root/config.ts'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { ThumbnailGenerator } from '@scene-prod/core'
import { Group, Object3D } from 'three'
import {
  scanGltfDependencies,
  packGltfBundle,
  isBundleComplete,
  type GltfDependencyReport,
} from '../utils/gltfBundle'

const assets = ref<AssetWithId[]>([])
const currentFilter = ref<string | null>(null)
const uploading = ref(false)
const uploadStatus = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

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
let thumbnailGenerator: ThumbnailGenerator | null = null

/** 取小写扩展名，不含点；无扩展名返回空串 */
const extOf = (file: File) => {
  const idx = file.name.lastIndexOf('.')
  return idx === -1 ? '' : file.name.slice(idx + 1).toLowerCase()
}

/**
 * 可作为独立资产上传的扩展名，与文件选择框的 accept 一致。
 * 选择文件夹时没有 accept 过滤，README / .DS_Store 之类都会被带进来，
 * 靠这个白名单挡掉，避免产生垃圾资产记录。
 */
const STANDALONE_EXTENSIONS = new Set([
  'gltf',
  'glb',
  'obj',
  'mtl',
  'fbx',
  'zip',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'ktx2',
  'hdr',
  'exr',
])

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const files = Array.from(input.files)
  // 清空 value，否则连续选同一批文件不会再触发 change
  input.value = ''
  await uploadFiles(files)
}

/**
 * .gltf 是多文件资产：几何数据在 .bin 里、贴图在图片里，靠相对 uri 引用。
 * 只传 .gltf 本体等于传了一份索引，服务端处理和场景加载都会因缺依赖失败。
 *
 * 所以先扫描依赖：
 *   - 齐全 → 打成 zip 上传，走服务端已有的解压分支，相对路径原样保留
 *   - 缺失 → 拦下这一个文件并说明缺什么，不写入注定加载失败的资产记录
 * 其余文件不受影响，照常逐个上传。
 */
async function uploadFiles(files: File[]) {
  uploading.value = true
  uploadStatus.value = '正在处理...'
  try {
    // 被 .gltf 引用的文件不再单独上传，否则会产生一堆无法独立使用的碎片资产
    const consumed = new Set<File>()
    const queue: File[] = []

    for (const file of files) {
      if (extOf(file) !== 'gltf') continue

      uploadStatus.value = `正在检查 ${file.name} 的依赖...`
      let report: GltfDependencyReport
      try {
        report = await scanGltfDependencies(file, files)
      } catch (error: any) {
        ElMessage({
          message: error?.message ?? `${file.name} 解析失败`,
          type: 'error',
        })
        consumed.add(file)
        continue
      }

      // 依赖全部内嵌为 data: uri 的 .gltf 是自包含的，按普通单文件上传即可
      if (report.required.length === 0) continue

      consumed.add(file)
      report.resolved.forEach((dep) => consumed.add(dep.file))

      if (!isBundleComplete(report)) {
        const msg = describeIncompleteBundle(file, report)
        ElMessage({
          message: msg,
          type: 'error',
          duration: 8000
        })
        continue
      }

      uploadStatus.value = `正在打包 ${file.name} 及 ${report.resolved.length} 个依赖...`
      queue.push(await packGltfBundle(file, report))
    }

    const skipped: string[] = []
    for (const file of files) {
      if (consumed.has(file)) continue
      const ext = extOf(file)
      if (ext === 'bin') {
        // .bin 只是 .gltf 的几何数据，单独上传没有意义，还会让处理流水线失败
        ElMessage({
          message: `已跳过 ${file.name}：请与引用它的 .gltf 一起选择`,
          type: 'warning',
        })
        continue
      }
      if (!STANDALONE_EXTENSIONS.has(ext)) {
        skipped.push(file.name)
        continue
      }
      queue.push(file)
    }

    if (skipped.length > 0) {
      console.log('[Upload] 已跳过非资产文件:', skipped)
      ElMessage({
          message: `已跳过 ${skipped.length} 个非资产文件`,
          type: 'info',
        })
    }

    // 串行上传：thumbnailGenerator 是共享单例，并发会让多个模型进同一个场景互相串图
    const uploaded: AssetWithId[] = []
    for (const file of queue) {
      const asset = await handleOneFile(file, files)
      if (asset) uploaded.push(asset)
    }

    if (uploaded.length === 0) return

    // 先刷新列表，让用户立刻看到"处理中"的卡片，不必干等轮询
    await loadAssets()
    await reportProcessingResults(uploaded)
  } finally {
    uploading.value = false
    uploadStatus.value = ''
  }
}

/**
 * 等待并汇报异步处理结果。
 *
 * 上传接口的 200 只说明入队成功，流水线里的失败（缺依赖资源、格式转换失败、
 * 云存储上传失败）此前没有任何回传通道，用户只会看到一句"上传成功"，直到把
 * 模型拖进场景才报错。这里把那些失败显式说出来。
 */
async function reportProcessingResults(uploaded: AssetWithId[]) {
  // 只有模型会进流水线，其余类型直接是 skipped
  const processing = uploaded.filter(
    (asset) => asset.processingStatus === 'pending' || asset.processingStatus === 'processing',
  )
  if (processing.length === 0) return

  let anyFinished = false
  for (const asset of processing) {
    uploadStatus.value = `正在处理 ${asset.originalName}...`
    const outcome = await waitForProcessing(asset._id)

    if (outcome.ok) {
      anyFinished = true
      ElMessage({
        message: `${asset.originalName} 处理完成`,
        type: 'success',
      })
    } else if (outcome.status === 'timeout') {
      ElMessage({
        message: `${asset.originalName}：${outcome.message}`,
        type: 'info',
        duration: 6000,
      })
    } else {
      anyFinished = true
      ElMessage({
        message: `${asset.originalName} 处理失败：${outcome.message}`,
        type: 'error',
        duration: 10000,
      })
    }
  }

  // 处理结果改变了资产状态（ready/failed、缩略图、产物路径），刷新以反映最新状态
  if (anyFinished) await loadAssets()
}

/** 依赖不全时给出可操作的提示，而不是只说一句失败 */
function describeIncompleteBundle(file: File, report: GltfDependencyReport): string {
  const reasons: string[] = []
  if (report.missing.length > 0) {
    reasons.push(`缺少 ${report.missing.join('、')}`)
  }
  if (report.ambiguous.length > 0) {
    reasons.push(`${report.ambiguous.join('、')} 匹配到多个同名文件，无法确定用哪个`)
  }
  return `${file.name} 上传失败：${reasons.join('；')}。请改用"上传文件夹"选择模型所在目录，或先打包成 .zip`
}

/** @returns 上传成功返回资产记录，失败返回 null */
const handleOneFile = async (file: File, files: File[]): Promise<AssetWithId | null> => {
  if (!file) {
    return null
  }
  let thumbnail: Blob | null = null
  try {
    const ext = extOf(file)
    uploadStatus.value = `正在生成 ${file.name} 的缩略图...`
    if (!thumbnailGenerator) {
      thumbnailGenerator = new ThumbnailGenerator(100, 100)
    }
    if (['gltf', 'glb'].includes(ext)) {
      try {
        thumbnail = await thumbnailGenerator.generate(file)
      } catch (error) {
        console.error('生成缩略图失败:', error)
      }
    } else if (['fbx'].includes(ext)) {
      try {
        thumbnail = await thumbnailGenerator.generateWithFbx(file)
      } catch (error) {
        console.error('生成缩略图失败:', error)
      }
    } else if (['obj'].includes(ext)) {
      // 找同名 .mtl 一起加载，这样缩略图才有材质
      const objName = file.name.slice(0, file.name.lastIndexOf('.'))
      const sameNameMtl =
        files.find((f) => extOf(f) === 'mtl' && f.name.slice(0, f.name.lastIndexOf('.')) === objName) ?? null
      try {
        thumbnail = await thumbnailGenerator.generateWithObj(file, sameNameMtl)
      } catch (error) {
        console.error('生成缩略图失败:', error)
      }
    }

    uploadStatus.value = `正在上传 ${file.name}...`
    const result = await uploadAsset(file, thumbnail)

    if (!result.success) {
      ElMessage({
        message: '上传失败:' + result.message,
        type: 'error',
        duration: 8000,
      })
      return null
    }

    // 上传成功只代表文件已收下、任务已入队；模型的处理还在队列里异步进行，
    // 所以这里不能说"上传成功"就完事
    const asset = result.asset as AssetWithId | undefined
    const pending = asset?.processingStatus === 'pending' || asset?.processingStatus === 'processing'
    ElMessage({
      message: pending ? `${file.name} 已上传，正在处理...` : `${file.name} 上传成功`,
      type: 'success',
    })
    return asset ?? null
  } catch (error) {
    console.error('上传失败:', error)
    ElMessage({
      message: `${file.name} 上传失败`,
      type: 'error',
    })
    return null
  }
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

const dialogCanvasContainer = ref()
const displayImg: Ref<HTMLElement | null> = ref(null)
const showDisplay = ref(false)
const showModel = ref(false)
const showImg = ref(false)
let showedModel: Object3D | Group | undefined = undefined
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
  if (!thumbnailGenerator) {
    thumbnailGenerator = new ThumbnailGenerator(100, 100)
  }
  showDisplay.value = true
  console.log('asset:', asset)
  const assetUrl = asset.cloudUrls?.compressed ?? ''
  if (assetUrl.endsWith('glb') || assetUrl.endsWith('gltf')) {
    showModel.value = true
    nextTick(async () => {
      showedModel = await thumbnailGenerator?.showDialogScene(dialogCanvasContainer.value, assetUrl)
    })
  } else if (['jpg', 'jpeg', 'png'].includes(asset.format)) {
    showImg.value = true
    nextTick(() => {
      let url = asset.cloudUrls?.file ?? ''
      if (!url.startsWith('http')) {
        url = 'https://' + url
      }
      displayImg.value?.setAttribute('src', url)
    })
  }
}

const closeDialog = () => {
  showDisplay.value = false
  showModel.value = false
  showImg.value = false
  if (showedModel) {
    thumbnailGenerator?.cleanDisplay(showedModel)
  }
}

const getAssetIcon = (type: string) => {
  const icons = {
    model: '🎨',
    texture: '🖼️',
    hdri: '🌅',
    effect: '✨',
  }
  return icons[type as keyof typeof icons] || '📦'
}

/**
 * 处理状态的展示信息。skipped 表示无需处理（贴图、HDRI），不展示标记，
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

// 🧹 组件卸载时清理资源，防止内存泄漏
onUnmounted(() => {
  if (thumbnailGenerator) {
    thumbnailGenerator.dispose()
    thumbnailGenerator = null
  }
})
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

.asset-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
