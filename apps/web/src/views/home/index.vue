<template>
  <div class="home-view">
    <div class="hero">
      <h1 class="hero-title">SceneProd</h1>
      <p class="hero-subtitle">
        在浏览器中搭建、编辑并分享三维场景
      </p>
    </div>

    <div class="entry-grid">
      <button
        v-for="entry in entries"
        :key="entry.path"
        class="entry-card"
        @click="router.push(entry.path)"
      >
        <div class="entry-icon">{{ entry.icon }}</div>
        <div class="entry-name">{{ entry.name }}</div>
        <div class="entry-desc">{{ entry.desc }}</div>
        <div class="entry-action">
          {{ entry.action }}
          <span class="arrow">→</span>
        </div>
      </button>
    </div>

    <footer class="home-footer">SceneProd · Vue 3 + Three.js</footer>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const entries = [
  {
    icon: '🏝️',
    name: '场景管理',
    desc: '创建、编辑与管理你的三维场景，支持资产管理和链接分享。',
    action: '进入编辑器',
    path: '/scenes',
  },
  {
    icon: '🏝️',
    name: '资产管理',
    desc: '导入场景中使用的各种资产',
    action: '进入管理器',
    path: '/assets',
  },
  {
    icon: '🧊',
    name: '基础练习',
    desc: '几何体、材质与灯光的基本使用，快速查看渲染效果。',
    action: '开始预览',
    path: '/practice3d',
  },
  {
    icon: '🧊',
    name: '三维展示',
    desc: '几何体、材质与灯光的实时演示，快速查看渲染效果。',
    action: '开始预览',
    path: '/moduleScene',
  },
  {
    icon: '🧊',
    name: '模型陈列',
    desc: '对加载的模型做处理',
    action: '开始预览',
    path: '/modelDisplay',
  },
];
</script>

<style scoped lang="scss">
@use '../styles/home.scss';
</style>
