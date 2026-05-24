// TODO: 封装 TransformControls，支持平移 / 旋转 / 缩放 三档切换

import * as THREE from 'three'
import { TransformControls, TransformControlsMode } from 'three/examples/jsm/controls/TransformControls.js'
import { TransformObjectCommand } from './commands'
import { SceneManager } from './SceneManager'
import { PersistenceManager } from './PersistenceManager'
import { ObjectState } from '@scene-prod/shared'

export class TransformController {
  private transformControls: TransformControls
  private sceneManager: SceneManager
  private dragStartParams: ObjectState | null = null
  isDragging: boolean = false

  constructor(sceneManager: SceneManager, persistenceManager: PersistenceManager, onCommandCreated: (command: TransformObjectCommand) => void) {
    this.sceneManager = sceneManager
    this.transformControls = new TransformControls(this.sceneManager.camera, this.sceneManager.renderer.domElement)

    this.transformControls.addEventListener('dragging-changed', (event) => {
      sceneManager.controls.enabled = !event.value
    })

    this.transformControls.addEventListener('mouseDown', () => {
      this.isDragging = true
      if (this.transformControls.object) {
        this.dragStartParams = {
          position: this.transformControls.object.position.clone(),
          rotation: this.transformControls.object.rotation.clone(),
          scale: this.transformControls.object.scale.clone(),
        }
      }
    })
    // 控件操作结束后，记录结果，并执行命令
    this.transformControls.addEventListener('mouseUp', () => {
      this.isDragging = false
      if (this.transformControls.object && this.dragStartParams) {
        const newState = {
          position: this.transformControls.object.position.clone(),
          rotation: this.transformControls.object.rotation.clone(),
          scale: this.transformControls.object.scale.clone(),
        }
        if (
          !this.dragStartParams.position.equals(newState.position) ||
          !this.dragStartParams.rotation.equals(newState.rotation) ||
          !this.dragStartParams.scale.equals(newState.scale)
        ) {
          const command = new TransformObjectCommand(
            this.transformControls.object,
            this.dragStartParams,
            newState,
          )
          onCommandCreated(command)
        }

        // eventTarget.dispatchEvent(event) 向一个指定的事件目标派发 event。这里是向 window 派发 transform-changed 事件，用于实时更新 UI
        window.dispatchEvent(
          new CustomEvent('transform-changed', { detail: { object: this.transformControls.object } }),
        )
        console.log('mouseUp-', newState, );
      }
    })

    // 拖拽过程中实时更新（可选，用于实时更新 UI）
    this.transformControls.addEventListener('objectChange', () => {
      if (this.transformControls.object) {
        window.dispatchEvent(
          new CustomEvent('transform-changed', { detail: { object: this.transformControls.object } }),
        )
      }
    })

    // 将控制器添加到场景中, 在改变了transformControls的mode时，会自动改变这个helper的外观(具体是在requestAnimationFrame每次重绘时变化)
    const trnasformControlsHelper = this.transformControls.getHelper()
    sceneManager.scene.add(trnasformControlsHelper)
  }

  attach(object: THREE.Object3D) {
    this.transformControls.attach(object)
  }

  detach() {
    this.transformControls.detach()
  }

  setMode(mode: TransformControlsMode) {
    this.transformControls.setMode(mode)
  }

  /**
   * 更新选中状态
   * 供外部调用以同步 UI 变化
   */
  updateSelection() {
    // TransformControls 在循环中会自动更新，
    // 此方法用于满足 PropertiesPanel 的调用接口。
    // 未来可以在此处添加特定的更新逻辑。
  }
}
