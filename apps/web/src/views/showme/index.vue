<template>
  <div id="container" ref="canvasRef"></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { createScene, createSceneForPBR, createPlanteScene, createGLTFScene } from './create'

const canvasRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (canvasRef.value) {
    createGLTFScene(canvasRef.value)
  }
})
</script>

<style scoped lang="scss">
#container {
  width: 100vw;
  height: 100vh;
}
</style>
