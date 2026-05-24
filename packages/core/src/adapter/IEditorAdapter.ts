import { SceneMetadata } from '@scene-prod/shared';
import * as THREE from 'three';

export class IEditorAdapter {
  /** 清除当前选中对象 */
  clearSelection() { }
  /** 重置场景对象列表 */
  resetObjects(objects: THREE.Object3D[] = []) { }
  /** 更新场景元数据 */
  setSceneMetadata(metadata: SceneMetadata) { }
  /** 向列表中添加一个对象 */
  addObject(object: THREE.Object3D) { }
}