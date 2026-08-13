import { createRouter, createWebHistory } from 'vue-router'

const Editor = () => import('../views/Editor.vue')
const Scenes = () => import('../views/Scenes.vue')
const Assets = () => import('../views/Assets.vue')
const Preview = () => import('../views/Preview.vue')

const Show3D = () => import('../views/showme/index.vue')
const Home = () => import('../views/home/index.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: Home
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
    },
    {
      path: '/Show3D',
      component: Show3D
    }
  ]
})

export default router