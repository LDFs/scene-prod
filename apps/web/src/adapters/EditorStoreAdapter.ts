
import { IEditorAdapter } from '@scene-prod/core';
import { useEditorCoreStore } from '@/stores/editorCore';
import { SceneMetadata } from '@scene-prod/shared';
import * as THREE from 'three';

export class EditorStoreAdapter extends IEditorAdapter {
  private store: ReturnType<typeof useEditorCoreStore>;
  constructor() {
    super()
    this.store = useEditorCoreStore();
  }

  clearSelection() {
    this.store.clearSelection()
  }
  resetObjects(objects: THREE.Object3D[] = []) {
    // this.store.resetObjects(objects)
  }
  setSceneMetadata(metadata: SceneMetadata) {
    this.store.setSceneMetadata(metadata)
  }
  addObject(object: THREE.Object3D) {
    // this.store.addObject(object)
  }
}
