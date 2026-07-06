<template>
  <div class="scenes-view">
    <div class="header">
      <router-link to="/" class="home-link">← 返回主页</router-link>
      <h1>场景管理</h1>
      <button class="create-btn" @click="showCreateModal = true">
        <span>➕</span> 新建场景
      </button>
      <button class="create-btn" @click="router.push('/assets')">
        <span>📂</span> 资产管理
      </button>
    </div>

    <div class="scenes-grid" v-if="scenes.length > 0">
      <div v-for="scene in scenes" :key="scene.sceneId" class="scene-card" @click="enterScene(scene.sceneId)">
        <div class="scene-preview">
          <span class="scene-icon">🏝️</span>
        </div>
        <div class="scene-info">
          <div class="scene-name" :title="scene.name">
            {{ scene.name }}
          </div>
          <div class="scene-desc" :title="scene.description">
            {{ scene.description || '暂无描述' }}
          </div>
          <div class="scene-meta">
            <span>{{ scene.objectCount || 0 }} 个对象</span>
            <span>{{ formatDate(scene.lastModified) }}</span>
          </div>
        </div>
        <div class="scene-actions">
          <button class="action-btn delete-btn" @click.stop="copySceneLink(scene)" title="复制链接分享">🔗</button>
          <button class="action-btn delete-btn" @click.stop="previewScene(scene)" title="预览">预览</button>
          <button class="action-btn delete-btn" @click.stop="handleDelete(scene)" title="删除">
            🗑️
          </button>
        </div>
      </div>
    </div>
    <!-- 分页组件（始终显示） -->
    <div class="pagination" v-if="pagination.total > 0">
      <div class="page-size-selector">
        <span>每页</span>
        <select v-model="pagination.pageSize" @change="onPageSizeChange">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="30">30</option>
        </select>
        <span>条</span>
      </div>
      <button class="page-btn" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
        ‹ 上一页
      </button>
      <div class="page-numbers" v-if="pagination.totalPages > 1">
        <button v-for="p in visiblePages" :key="p" class="page-num" :class="{ active: p === pagination.page }"
          @click="goToPage(p)">
          {{ p }}
        </button>
      </div>
      <span v-else class="page-num active">1</span>
      <button class="page-btn" :disabled="pagination.page >= pagination.totalPages"
        @click="goToPage(pagination.page + 1)">
        下一页 ›
      </button>
      <span class="page-info">共 {{ pagination.total }} 个场景</span>
    </div>

    <div v-if="scenes.length === 0 && !loading" class="empty-state">
      <p>暂无场景</p>
      <p class="hint">点击上方"新建场景"按钮开始创建</p>
    </div>

    <!-- 创建场景模态框 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>新建场景</h3>
        <div class="form-group">
          <label>场景名称</label>
          <input v-model="newScene.name" type="text" placeholder="请输入场景名称" ref="nameInput">
        </div>
        <div class="form-group">
          <label>描述 (可选)</label>
          <textarea v-model="newScene.description" placeholder="请输入场景描述"></textarea>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="newScene.enableOnboarding">
            <span>是否开启新手引导</span>
          </label>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showCreateModal = false">取消</button>
          <button class="confirm-btn" @click="handleCreate" :disabled="!newScene.name">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { getScenes, createScene, deleteScene } from '../services/api';
import { useRouter } from 'vue-router';
import type { SceneData } from '@scene-prod/shared';
import type { Pagination, NewScene } from '../types/scenes';
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

const router = useRouter();
const scenes = ref<SceneData[]>([]);
const pagination = ref<Pagination>({
  page: 1,
  pageSize: 10,
  totalPages: 0,
  total: 0,
});
const showCreateModal = ref(false);
const newScene = ref<NewScene>({
  name: '',
  description: '',
  enableOnboarding: false,
})
const loading = ref(false);
const loadScenes = async (page: number) => {
  loading.value = true
  try {
    const result = await getScenes(page, pagination.value.pageSize)
    scenes.value = result.scenes
    pagination.value = result.pagination
  } catch (error) {
    console.error('加载场景列表失败:', error)
  } finally {
    loading.value = false
  }
}

const enterScene = (sceneId: string) => {
  router.push(`/editor/${sceneId}`)
}

const handleCreate = async () => {
  if (!newScene.value.name) {
    return;
  }
  try {
    const result = await createScene(newScene.value.name, newScene.value.description)
    console.log('result:', result);
    if(!result?.success) {
      return alert(result?.message)
    }
    showCreateModal.value = false
    const enableOnboarding = newScene.value.enableOnboarding
    newScene.value = { name: '', description: '', enableOnboarding: true }
    // 直接进入编辑器
    const query = enableOnboarding ? { onboarding: '1' } : {}
    router.push({ path: `/editor/${result?.scene?.sceneId}`, query })
  } catch (error) {
    console.error('创建场景失败:', error)
  }
}

const handleDelete = async (scene: SceneData) => {
  if (!confirm(`确定要删除场景 "${scene.name}" 吗？此操作不可恢复。`)) {
    return;
  }
  try {
    await deleteScene(scene.sceneId)
    await loadScenes(pagination.value.page)
  } catch (error) {
    console.error('删除场景失败:', error)
  }
}
onMounted(async () => {
  await loadScenes(1)
})

const copySceneLink = async (scene: SceneData) => {
  const shareUrl = `${window.location.origin}/view/${scene.sceneId}`
  try {
    await navigator.clipboard.writeText(shareUrl)
    ElMessage({ message: `分享链接已复制：${shareUrl}`, type: 'success' })
  } catch {
    // 剪贴板不可用（如非 HTTPS 环境）时，至少把链接展示出来
    ElMessage({ message: `分享链接：${shareUrl}`, type: 'success' })
  }
}

const previewScene = (scene: SceneData) => {
  const shareUrl = `${window.location.origin}/view/${scene.sceneId}`
  window.open(shareUrl, '_blank')
}


const formatDate = (date: number) => {
  return new Date(date).toLocaleDateString()
}

const onPageSizeChange = () => {
  loadScenes(1)
}
const goToPage = (page: number) => {
  if (page < 1 || page > pagination.value.totalPages) return
  pagination.value.page = page
  loadScenes(page)
}
const visiblePages = computed(() => {
  return Array.from({ length: pagination.value.totalPages }, (_, i) => i + 1)
})

</script>

<style scoped>
@import './styles/scenes.scss';
</style>
