import { defineStore } from 'pinia';
import { shallowRef, Ref } from 'vue';
import { SceneManager, PersistenceManager, Picker, TransformController } from '@scene-prod/core';

/**
 * 存储编辑器核心 manager 实例
 * 使用 shallowRef 避免 Vue 对大型 Three.js 对象做深层响应式代理（性能问题）
 */
export const useManagerStore = defineStore('manager', () => {
  const sceneManager: Ref<SceneManager | null> = shallowRef(null);
  const transformController: Ref<TransformController | null> = shallowRef(null);
  const picker: Ref<Picker | null> = shallowRef(null);
  const persistenceManager: Ref<PersistenceManager | null> = shallowRef(null);

  
  function init(managers: { 
    sceneManager: SceneManager, 
    persistenceManager: PersistenceManager, 
    transformController: TransformController, 
    picker: Picker, 
  }) {
    sceneManager.value = managers.sceneManager;
    transformController.value = managers.transformController;
    picker.value = managers.picker;
    persistenceManager.value = managers.persistenceManager;
  }

  function reset() {
    sceneManager.value?.dispose()
    sceneManager.value = null;
    transformController.value = null;
    picker.value = null;
    persistenceManager.value = null;
  }

  return {
    sceneManager,
    transformController,
    picker,
    persistenceManager,
    init,
    reset,
  }
})