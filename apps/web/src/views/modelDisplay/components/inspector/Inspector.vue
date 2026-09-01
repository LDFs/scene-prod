<template>
  <!-- TODO: 属性编辑器（根据 schema 自动生成表单） -->
  <aside class="inspector">
    <MaterialPanel v-if="activeTab === 'material'" />
  </aside>
</template>

<script setup lang="ts">
import MaterialPanel from './MaterialPanel.vue';

const props = defineProps<{
  activeTab: string;
}>();

</script>

<style scoped>
.inspector {
  width: 260px;
  height: 100%;
}
</style>
