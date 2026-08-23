import { createRouter, createWebHistory } from 'vue-router'

const Editor = () => import('../views/Editor.vue')
const Scenes = () => import('../views/Scenes.vue')
const Assets = () => import('../views/Assets.vue')
const Preview = () => import('../views/Preview.vue')

const practice3d = () => import('../views/showme/index.vue')
const Home = () => import('../views/home/index.vue')
const moduleScene = () => import("../views/moduleScene/index.vue")

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
      path: '/practice3d',
      component: practice3d
    },
    {
      path: '/moduleScene',
      component: moduleScene
    }
  ]
})

export default router