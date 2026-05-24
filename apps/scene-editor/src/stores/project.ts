// TODO: 维护当前 Project schema，提供 patch / save / load
import { defineStore } from 'pinia'

export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null as unknown,
  }),
})
