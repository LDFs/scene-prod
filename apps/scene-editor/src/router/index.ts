import { createRouter, createWebHistory } from 'vue-router'

import Editor from '../views/Editor.vue'
import Scenes from '../views/Scenes.vue'
import Assets from '../views/Assets.vue'
import Preview from '../views/Preview.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/scenes'
    },
    {
      path: '/scenes',
      component: Scenes
    },
    {
      path: '/editor/:sceneId',
      component: Editor
    },
    {
      path: '/view/:sceneId',
      component: Preview
    },
    {
      path: '/assets',
      component: Assets
    }
  ]
})

export default router