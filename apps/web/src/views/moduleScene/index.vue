<template>
  <div id="threejs-container" ref="canvasRef"></div>
  <!-- <div id="preload-overlay">
    <div id="loading">
      <span>LOADING ASSETS...</span>
      <span id="loading-percent"></span>
    </div>
    <button id="start-btn">START</button>
  </div> -->
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import App from './world/App'
import Environment from './world/Environment'
import Loop from './utils/Loop'

const canvasRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (canvasRef.value) {
    const app = App.create(canvasRef.value)
    App.loadAssets()
    const environment = new Environment()
    environment.makeUpScene()

    const loop = new Loop(app.scene.scene, app.camera, app.renderer, environment)
    loop.start()
  }
})
</script>

<style scoped>
#threejs-container {
  width: 100vw;
  height: 100vh;
}
#preload-overlay {
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  background-color: #000;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 1;
  transition: opacity 0.5s;
}

#loading.hide {
  opacity: 0;
}

#start-btn {
  border: none;
  color: #fff;
  background-color: #000;
  opacity: 0;
  transition: opacity 0.5s;
  cursor: pointer;
}
#start-btn.show {
  opacity: 1;
}
#start-btn.hide {
  opacity: 0;
}
#start-btn:hover {
  color: #32d6ff;
}
</style>
