<template>
  <!-- TODO: 属性编辑器（根据 schema 自动生成表单） -->
  <aside class="inspector">
    <PropertiesPanel v-if="activeTab === 'properties'" />
    <MaterialPanel v-if="activeTab === 'material'" />
    <SceneSettingPanel v-if="activeTab === 'settings'" />
  </aside>
</template>

<script setup lang="ts">
import PropertiesPanel from './components/PropertiesPanel.vue';
import MaterialPanel from './components/MaterialPanel.vue';
import SceneSettingPanel from './components/SceneSettingPanel.vue';

const props = defineProps<{
  activeTab: string;
}>();

</script>

<style scoped>
.inspector {
  width: 260px;
}
</style>
