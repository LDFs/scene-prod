import { createRouter, createWebHistory } from 'vue-router'

const Editor = () => import('../views/Editor.vue')
const Scenes = () => import('../views/Scenes.vue')
const Assets = () => import('../views/Assets.vue')
const Preview = () => import('../views/Preview.vue')

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