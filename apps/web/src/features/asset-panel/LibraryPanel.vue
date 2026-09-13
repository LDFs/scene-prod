<template>
  <div class="library-panel">
    <h3>资源库</h3>

    <!-- 三个分区共用，accept 随点击的入口切换 -->
    <input ref="fileInput" type="file" multiple :accept="uploadAccept" @change="handleFileSelect" hidden />

    <!-- 上传是异步的且可能要打包，没有进度提示的话点完按钮像是没反应 -->
    <div v-if="uploading" class="upload-status" :title="uploadStatus">
      <span class="upload-spinner"></span>
      <span class="upload-status-text">{{ uploadStatus }}</span>
    </div>

    <!-- 几何体部分 -->
    <div class="section">
      <h4>几何体</h4>
      <div class="item" draggable="true" @dragstart="onDragGeo($event, 'Box')">📦 立方体</div>
      <div class="item" draggable="true" @dragstart="onDragGeo($event, 'Sphere')">🔵 球体</div>
    </div>

    <!-- 模型部分 -->
    <div class="section">
      <div class="section-header">
        <h4>模型</h4>
        <button
          class="upload-btn"
          :disabled="uploading"
          @click="triggerUpload(MODEL_UPLOAD_ACCEPT)"
          title="上传模型（.gltf 需连同 .bin 与贴图一起选中）"
        >
          📤
        </button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="models.length === 0" class="empty">暂无模型</div>

      <div v-else class="section-scroll-container" ref="modelContainerRef">
        <div
          v-for="model in models"
          :key="model._id"
          class="item"
          :class="{ processing: !isModelReady(model) }"
          :draggable="isModelReady(model)"
          @dragstart="onDragStart($event, model)"
          :title="isModelReady(model) ? model.originalName : '模型正在后台处理中，请稍候…'"
        >
          🎨 {{ model.name }}
          <span v-if="!isModelReady(model)" class="status-badge">
            {{ model.processingStatus === 'failed' ? '处理失败' : '处理中…' }}
          </span>
        </div>
        <!-- 哨兵：滚到它露头就加载下一页 -->
        <div ref="modelSentinelRef" class="section-footer">
          <span v-if="modelLoadingMore">加载中…</span>
          <span v-else-if="modelLoadFailed" class="load-failed" @click="retryModels">
            加载失败，点击重试
          </span>
          <span v-else-if="!modelHasMore">没有更多了</span>
        </div>
      </div>
    </div>

    <!-- 环境贴图部分 -->
    <div class="section" id="env-section">
      <div class="section-header">
        <h4>贴图</h4>
        <button class="upload-btn" :disabled="uploading" @click="triggerUpload(TEXTURE_UPLOAD_ACCEPT)" title="上传贴图">
          📤
        </button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="environments.length === 0" class="empty">暂无环境贴图</div>

      <div v-else class="section-scroll-container" ref="textureContainerRef">
        <div
          v-for="env in environments"
          :key="env._id"
          class="item"
          draggable="true"
          @dragstart="onDragStart($event, env)"
          :title="env.originalName"
        >
          🌅 {{ env.name }}
        </div>
        <div ref="textureSentinelRef" class="section-footer">
          <span v-if="textureLoadingMore">加载中…</span>
          <span v-else-if="textureLoadFailed" class="load-failed" @click="retryTextures">
            加载失败，点击重试
          </span>
          <span v-else-if="!textureHasMore">没有更多了</span>
        </div>
      </div>
    </div>

    <!-- 3D Tiles 部分 -->
    <div class="section">
      <!-- 3D Tiles 暂无上传入口：服务端只按 .tileset 扩展名归类，上传链路还没打通 -->
      <div class="section-header">
        <h4>3D Tiles</h4>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="tilesets.length === 0" class="empty">暂无 3D Tiles</div>

      <div v-else class="section-scroll-container" ref="tilesetContainerRef">
        <div
          v-for="tileset in tilesets"
          :key="tileset._id"
          class="item"
          draggable="true"
          @dragstart="onDragStart($event, tileset)"
          :title="tileset.originalName"
        >
          🌐 {{ tileset.name }}
        </div>
        <div ref="tilesetSentinelRef" class="section-footer">
          <span v-if="tilesetLoadingMore">加载中…</span>
          <span v-else-if="tilesetLoadFailed" class="load-failed" @click="retryTilesets">
            加载失败，点击重试
          </span>
          <span v-else-if="!tilesetHasMore">没有更多了</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

/**
注意的点：
1. 加载模型资源时，判断列表中是否有正在处理的模型(state为pending)，有的话就轮询获取新的数据
2. 滚动懒加载，这里有三种资源列表，每块区域分别做懒加载，就通过一个函数来做统一的处理，为每块区域创建各自的处理逻辑，使用到了 资源列表、当前页数、总页数、每页数量、
监听对象、加载状态。懒加载主要通过 ObserverIntersection 来监听 区域最末尾的一个空元素 距离该区域的底部的位置，设置一个阈值，如果他们的距离小于这个阈值的话，就继续
加载新一页的数据
3. 拖拽模型进入场景，在 event.transferData 中记录被拖拽的模型的信息，有：url、名称、归一化大小
 */


import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { getAssets, getModelUrl } from '@/services/asset'
import { AssetWithId } from '@scene-prod/shared'
import { useAssetUpload, MODEL_UPLOAD_ACCEPT, TEXTURE_UPLOAD_ACCEPT } from '@/composables/useAssetUpload'

/**
 * 每页条数。首屏和滚动追加必须用同一个值，
 * 否则 page 号换算不出正确的 offset（首屏 20 条后再按 pageSize=10 取第 2 页，
 * 拿到的是第 11~20 条，也就是已经在列表里的那批）。
 */
const PAGE_SIZE = 10

/**
 * 距离底部多少像素就开始预加载。
 * IntersectionObserver 的 rootMargin 和 fill() 的几何判断必须共用它：
 * 两边阈值不一致的话，IO 提前触发时 fill() 会认为"还没到底"而空跑，
 * 而 isIntersecting 已经翻成 true，之后滚到真正的底部也不会再通知第二次。
 */
const LOAD_AHEAD = 80

/**
 * 一个可滚动加载的资源分区。三类资源逻辑完全一样，只有 type 不同。
 */
function createSection(type: string) {
  const items = ref<AssetWithId[]>([])
  const containerRef = ref<HTMLElement>()
  const sentinelRef = ref<HTMLElement>()
  const loadingMore = ref(false)
  /** 上一次追加是否失败。失败后哨兵仍停在视口里、isIntersecting 不会翻转，
   *  观察器不会再自动触发，只能靠 footer 上的重试把流程接回去 */
  const loadFailed = ref(false)
  /** 已加载的页数；下一页就是它 +1 */
  const loadedPages = ref(0)
  const total = ref(0)
  let io: IntersectionObserver | null = null

  const hasMore = computed(() => loadedPages.value > 0 && items.value.length < total.value)

  /**
   * 首屏加载 / 刷新。把已经翻过的页当成一整页取回来，
   * 否则轮询刷新会固定拿第 1 页，把用户滚出来的第 2、3 页直接截断。
   */
  const refresh = async () => {
    const pages = Math.max(loadedPages.value, 1)
    const res = await getAssets({ type, page: 1, pageSize: pages * PAGE_SIZE })
    if (!res.success) return
    items.value = res.assets
    total.value = res.pagination.total
    loadedPages.value = pages
  }

  /** 追加下一页；返回是否成功，供 fill 循环判断该不该继续 */
  const loadMore = async () => {
    // 并发锁：追加数据后 scrollTop 不变、惯性滚动还在继续，
    // 不锁住会连着把后面几页一起请求出去
    if (loadingMore.value || !hasMore.value) return false
    loadingMore.value = true
    try {
      const next = loadedPages.value + 1
      const res = await getAssets({ type, page: next, pageSize: PAGE_SIZE })
      // getAssets 内部已经吞掉了网络异常，失败只体现在 success 上
      loadFailed.value = !res.success
      if (!res.success) return false
      loadedPages.value = next
      if (res.assets.length === 0) {
        // 越界或数据被删空：把 total 对齐到当前条数，停止后续请求
        total.value = items.value.length
        return true
      }
      total.value = res.pagination.total
      // offset 分页期间若有新资源插到列表头部，后一页会带回已在列表里的条目，
      // 直接 concat 会产生重复 _id（v-for key 冲突 + 列表重影）
      const seen = new Set(items.value.map((a) => a._id))
      items.value.push(...res.assets.filter((a) => !seen.has(a._id)))
      return true
    } finally {
      loadingMore.value = false
    }
  }

  /** 哨兵是否已进入"该加载了"的范围（含 LOAD_AHEAD 提前量，与 rootMargin 对齐） */
  const sentinelInView = () => {
    const root = containerRef.value
    const el = sentinelRef.value
    if (!root || !el) return false
    return el.getBoundingClientRect().top - LOAD_AHEAD <= root.getBoundingClientRect().bottom
  }

  /**
   * 一直加载到内容填满容器为止。
   * 只等 IntersectionObserver 是不够的：若新追加的一页仍没撑出滚动条，
   * 哨兵的 isIntersecting 不会发生翻转，回调也就不会再来第二次。
   */
  const fill = async () => {
    if (loadingMore.value) return
    while (hasMore.value && sentinelInView()) {
      if (!(await loadMore())) break
      await nextTick()
    }
  }

  const observe = () => {
    io?.disconnect()
    io = null
    if (!containerRef.value || !sentinelRef.value) return
    io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fill()
      },
      // root 必须是内部滚动容器；默认值是浏览器视口，在这种面板里永远不成立
      { root: containerRef.value, rootMargin: `${LOAD_AHEAD}px` },
    )
    io.observe(sentinelRef.value)
  }

  // loading / empty / 列表 三个分支互斥，容器会被销毁重建，
  // 所以观察器要跟着 ref 走，不能在 onMounted 里建一次就完事
  // ——那时首屏请求还没回来，渲染的是"加载中"，两个 ref 都还是 undefined。
  watch(sentinelRef, observe)

  /** 点击 footer 手动重来一次，把失败后停摆的加载流程接回去 */
  const retry = () => {
    loadFailed.value = false
    fill()
  }

  /**
   * 把刚上传的资源插到列表头部。
   *
   * 后端按 createdAt 逆序返回，新资源天然落在整条流的最前面，本地前插与服务端顺序一致。
   * 代价是后续分页的 offset 相对整条流后移了 prepend 的条数，紧接着几页会带回
   * 已在列表里的条目——由 loadMore 里的 _id 去重兜住：不会重复，也不会漏项
   * （覆盖区间仍然连续），下一次轮询 refresh 会把这个偏移彻底抹平。
   */
  const prepend = async (assets: AssetWithId[]) => {
    // 首屏还没成功加载过，没有可对齐的分页基准；直接重新拉一次，
    // 新资源本来就在第一页，硬前插只会让后续 offset 算错。
    if (loadedPages.value === 0) {
      await refresh()
      return
    }
    const seen = new Set(items.value.map((a) => a._id))
    const fresh = assets.filter((a) => !seen.has(a._id))
    if (fresh.length === 0) return
    items.value.unshift(...fresh)
    total.value += fresh.length
  }

  const dispose = () => {
    io?.disconnect()
    io = null
  }

  return { items, containerRef, sentinelRef, loadingMore, loadFailed, hasMore, refresh, retry, prepend, dispose }
}

const {
  items: models,
  containerRef: modelContainerRef,
  sentinelRef: modelSentinelRef,
  loadingMore: modelLoadingMore,
  loadFailed: modelLoadFailed,
  hasMore: modelHasMore,
  refresh: refreshModels,
  retry: retryModels,
  prepend: prependModels,
  dispose: disposeModels,
} = createSection('model')

const {
  items: environments,
  containerRef: textureContainerRef,
  sentinelRef: textureSentinelRef,
  loadingMore: textureLoadingMore,
  loadFailed: textureLoadFailed,
  hasMore: textureHasMore,
  refresh: refreshTextures,
  retry: retryTextures,
  prepend: prependTextures,
  dispose: disposeTextures,
} = createSection('texture')

const {
  items: tilesets,
  containerRef: tilesetContainerRef,
  sentinelRef: tilesetSentinelRef,
  loadingMore: tilesetLoadingMore,
  loadFailed: tilesetLoadFailed,
  hasMore: tilesetHasMore,
  refresh: refreshTilesets,
  retry: retryTilesets,
  dispose: disposeTilesets,
} = createSection('tileset')

const loading = ref(false)

// silent=true 时不切换 loading 状态，用于后台轮询，避免列表闪现“加载中…”
const loadAssets = async (silent = false) => {
  if (!silent) loading.value = true
  try {
    await Promise.allSettled([refreshModels(), refreshTextures(), refreshTilesets()])
  } catch (error) {
    console.error('加载资产失败:', error)
  } finally {
    if (!silent) loading.value = false
    // 根据最新数据决定是否需要继续轮询
    syncPolling()
    // 通知外部资源加载完成（用于新手引导等）
    window.dispatchEvent(new CustomEvent('library-loaded'))
  }
}
// 只有处理完成（ready）的模型才允许拖拽进场景；pending/processing/failed 均禁止
const isModelReady = (model: AssetWithId) => model.processingStatus === 'ready'

// —— 轮询：只要还有模型在后台处理（pending/processing），就定时刷新，直到全部 ready/failed —— //
const POLL_INTERVAL = 5000
let pollTimer: ReturnType<typeof setInterval> | null = null

const hasPendingModels = () =>
  models.value.some((m) => m.processingStatus === 'pending' || m.processingStatus === 'processing')

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    loadAssets(true)
  }, POLL_INTERVAL)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 按当前列表里是否还有待处理的模型，决定开或停轮询。列表内容变动后都要调一次 */
const syncPolling = () => {
  if (hasPendingModels()) {
    startPolling()
  } else {
    stopPolling()
  }
}

// —— 上传 —— //

/**
 * 三个分区共用一个隐藏的文件选择框，只有 accept 随入口变化；
 * 上传结果按资产实际 type 分发回对应分区，所以在模型入口里连带选中的贴图
 * 也会落到贴图列表，不会串到模型列表里。
 *
 * 3D Tiles 没有对应的上传链路（服务端只认 .tileset 扩展名注册），暂不提供入口。
 */
const { uploading, uploadStatus, uploadFiles } = useAssetUpload()

const uploadAccept = ref(MODEL_UPLOAD_ACCEPT)
const fileInput = ref<HTMLInputElement | null>(null)

const triggerUpload = async (accept: string) => {
  if (uploading.value) return
  uploadAccept.value = accept
  // accept 是绑定上去的，得等 DOM 更新完再打开，否则用的还是上一个入口的过滤条件
  await nextTick()
  fileInput.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const files = Array.from(input.files)
  // 清空 value，否则连续选同一批文件不会再触发 change
  input.value = ''
  // reportProcessing: false —— 面板本来就有状态角标 + 轮询，
  // 没必要把上传态一直挂到流水线跑完（大模型可达数分钟）
  await uploadFiles(files, { onUploaded: prependUploaded, reportProcessing: false })
}

/**
 * 各类资产对应的分区前插函数。.hdr 已并入 texture，所以环境贴图也走贴图分区。
 * 没有列出的类型（material 等）在面板里没有分区，不处理。
 */
const PREPEND_BY_TYPE: Record<string, (assets: AssetWithId[]) => Promise<void>> = {
  model: prependModels,
  texture: prependTextures,
}

const prependUploaded = async (uploaded: AssetWithId[]) => {
  // 按目标分区（而不是 type）归组：多个 type 映射到同一分区时，
  // 按 type 分会对它调用两次 unshift，把同一批文件的先后顺序打乱
  const grouped = new Map<(assets: AssetWithId[]) => Promise<void>, AssetWithId[]>()
  for (const asset of uploaded) {
    const prepend = PREPEND_BY_TYPE[asset.type]
    if (!prepend) continue
    const list = grouped.get(prepend)
    if (list) list.push(asset)
    else grouped.set(prepend, [asset])
  }
  for (const [prepend, assets] of grouped) {
    await prepend(assets)
  }
  // 新上传的模型是 pending 状态，得把轮询接上，否则角标会一直停在"处理中…"
  syncPolling()
}

const onDragGeo = (event: DragEvent, type: string) => {
  event.dataTransfer?.setData('type', type);
}

const onDragStart = (event: DragEvent, model: AssetWithId) => {
  // 后台仍在处理的模型，阻止拖拽
  if (model && !isModelReady(model)) {
    event.preventDefault();
    return;
  }
  let type = model.type
  if (model.type === 'model' && model.processingStatus !== 'ready') {
    return
  }
  event.dataTransfer?.setData('type', type)
  if (!model) return
  const url = getAssetUrl(model)
  console.log('url--', url, model, model.sizing?.normalizeScale)

  if (url) {
    // 'url'是 DataTransfer API 中的保留格式名，它的格式需要为合法的绝对URI(以http:// 或 https:// 等开头)，否则浏览器会认为这不是合法的URI，会默认丢弃这个值
    // 如果不想被默认丢弃，可以使用其他的格式名，如 'modelUrl'
    event.dataTransfer?.setData('url', url)
    event.dataTransfer?.setData('name', model.name)
    // 尺寸归一化因子，实例化时乘到模型根 scale 上
    event.dataTransfer?.setData('normalizeScale', String(model.sizing?.normalizeScale ?? 1))
  }
}
const getAssetUrl = (asset: AssetWithId) => {
  return getModelUrl(asset)
}

onMounted(() => {
  loadAssets()
})

// 组件卸载时清理轮询定时器和滚动观察器，避免内存泄漏
onUnmounted(() => {
  stopPolling()
  disposeModels()
  disposeTextures()
  disposeTilesets()
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
}

.section-scroll-container {
  width: 100%;
  max-height: 300px;
  overflow-y: scroll;
  scrollbar-width: thin;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
/* 独占一行，保证它真的落在列表最末，而不是跟最后一项挤在同一行 */
.section-footer {
  flex-basis: 100%;
  min-height: 1px;
  text-align: center;
  font-size: 11px;
  color: #666;
}

.load-failed {
  color: #c96a6a;
  cursor: pointer;
}

.load-failed:hover {
  color: #e08585;
  text-decoration: underline;
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

.upload-btn {
  flex: none;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.upload-btn:hover:not(:disabled) {
  opacity: 1;
}

.upload-btn:disabled {
  cursor: not-allowed;
  opacity: 0.25;
}

.upload-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 6px 8px;
  border-radius: 4px;
  background: #2a2a2a;
  font-size: 11px;
  color: #aaa;
}

.upload-status-text {
  /* 文件名可能很长，压到一行，完整内容留在 title 里 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-spinner {
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid #444;
  border-top-color: #0066cc;
  border-radius: 50%;
  animation: library-spin 0.8s linear infinite;
}

@keyframes library-spin {
  to {
    transform: rotate(360deg);
  }
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

.item.processing {
  cursor: not-allowed;
  opacity: 0.55;
  background: #262626;
}

.item.processing:hover {
  background: #262626;
}

.status-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  background: #444;
  color: #bbb;
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
