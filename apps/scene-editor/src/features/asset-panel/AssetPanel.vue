<template>
  <!-- TODO: 资产库 + 场景树 -->
  <div class="scene-tree-panel">
    <h3>场景树</h3>
    <div class="tree-list">
      <TreeNode v-for="obj in sceneObjects" :key="obj.id + '-' + treeVersion" :node="obj" :level="0"
        :selectedObject="selectedObject" @select="selectObject" @delete="deleteObject" />
      <div v-if="!sceneObjects || sceneObjects.length === 0" class="empty-message">
        场景中没有对象
      </div>
    </div>
  </div>
  <LibraryPanel />
</template>

<script setup lang="ts">
import { useEditorCoreStore } from '@/stores/editorCore';
import { useManagerStore } from '@/stores/manager';
import { DeleteObjectCommand } from '@scene-prod/core';
import { computed, toRefs } from 'vue';
import * as THREE from 'three';
import LibraryPanel from './LibraryPanel.vue';
import TreeNode from './TreeNode.vue';
import { useHistoryStore } from '@/stores/history';


const editorCoreStore = useEditorCoreStore();
const { treeVersion, selectedObject } = toRefs(editorCoreStore);

const managerStore = useManagerStore();
const { sceneManager } = toRefs(managerStore);

const sceneObjects = computed(() => {
  /**
   * 具体是什么原因还不太懂，问题是：这里直接返回 sceneManager?.value?.objects 时，当场景内元素删除完了，再回退，不能触发页面的响应式更新。场景内元素是正常显示的，且这里输出sceneManager?.value?.objects也是正常的。
   */
  // 这里使用一次 treeVersion.value，是为了触发 treeVersion 的响应式更新，从而触发场景树的重新渲染
  treeVersion.value;
  const objects = sceneManager?.value?.objects
  // 这里将 Set 转换为数组，如果直接返回Set，当内部元素为空时，不能触发响应式更新
  return objects ? Array.from(objects) : []
});
const historyStore = useHistoryStore();

const selectObject = (object: THREE.Object3D) => {
  editorCoreStore.selectObject(object);
}
const deleteObject = (object: THREE.Object3D) => {
  if (!sceneManager.value) return

  const deleteCommand = new DeleteObjectCommand(sceneManager.value, object);
  historyStore.execute(deleteCommand);

  // 如果删除的是选中的对象，则清空选中
  if (selectedObject.value && selectedObject.value.id === object.id) {
    editorCoreStore.clearSelection();
  }
}
</script>
<style scoped>
.scene-tree-panel {
  width: 250px;
  background: #222;
  color: white;
  padding: 10px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
}

h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #aaa;
  text-transform: uppercase;
}

.tree-list {
  flex: 1;
  overflow-y: auto;
}

.empty-message {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
}
</style>
