import { defineStore } from 'pinia';
import { shallowRef, Ref, ref, markRaw } from 'vue';
import * as THREE from 'three';
import { SceneMetadata, PropertyType } from '@scene-prod/shared';

/**
 * 存储编辑器核心 manager 实例
 * 使用 shallowRef 避免 Vue 对大型 Three.js 对象做深层响应式代理（性能问题）
 */
export const useEditorCoreStore = defineStore('editorCore', () => {
  const sceneMetadata: Ref<SceneMetadata> = shallowRef({
    sceneId: '',
    name: '未命名场景',
    description: '',
    cameraFar: 1000,
    lastModified: new Date(),
    objectCount: 0,
    environmentUrl: '',
    backgroundColor: '#ffffff',
    ambientIntensity: 1.0,
    cameraPosition: { x: 5, y: 5, z: 5 },
  });
  const selectedObject: Ref<THREE.Object3D | null> = shallowRef(null);  
  const sceneObjects: Ref<THREE.Object3D[]> = shallowRef([]);
  const treeVersion = ref(0)
  const stateVersion = ref(0)

  function notifyStateUpdate() {
    stateVersion.value++;
  }

  function setSceneMetadata(metadata: SceneMetadata) {
    sceneMetadata.value = {
      ...sceneMetadata.value,
      ...metadata
    }
  }

  function selectObject(object: THREE.Object3D) {
    selectedObject.value = object;
  }

  function clearSelection() {
    selectedObject.value = null;
  }

  // function addObject(object: THREE.Object3D) {
  //   sceneObjects.value = [...sceneObjects.value, markRaw(object)];
  // }

  // function removeObject(object: THREE.Object3D) {
  //   sceneObjects.value = sceneObjects.value.filter(obj => obj.id !== object.id);
  // }

  // function resetObjects(objects: THREE.Object3D[]) {
  //   sceneObjects.value = objects.map(obj => markRaw(obj))
  // }

  function notifyTreeUpdate() {
    treeVersion.value++;
  }

  return {
    sceneMetadata,
    selectedObject,
    sceneObjects,
    stateVersion,
    treeVersion,
    notifyStateUpdate,
    setSceneMetadata,
    selectObject,
    clearSelection,
    // addObject,
    // removeObject,
    // resetObjects,
    notifyTreeUpdate,
  };
});
