import { defineStore } from "pinia"
import { shallowRef, Ref } from "vue"
import { Object3D } from "three";

const useSceneStore = defineStore('sceneStore', () => {
  const selectedObject: Ref<Object3D | null> = shallowRef(null);  
  
  function setSelectObject(object: Object3D) {
    selectedObject.value = object
  }  

  return {
    selectedObject,
    setSelectObject
  }
})

export default useSceneStore