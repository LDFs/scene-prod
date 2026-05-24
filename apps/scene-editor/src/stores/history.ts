// TODO: Command 模式的撤销 / 重做栈
import { defineStore } from 'pinia'
import { ActualCommand, Command } from '@scene-prod/core'
import { useEditorCoreStore } from './editorCore'
import { computed } from 'vue'
import { ref } from 'vue'
import { SceneSettingCommand } from '@scene-prod/core'

export const useHistoryStore = defineStore('history', () => {
  const undoStack = ref<ActualCommand[]>([])
  const redoStack = ref<ActualCommand[]>([])
  
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  function execute(cmd: ActualCommand) {
    cmd.execute()
    undoStack.value.push(cmd)  // 新数组触发响应式
    redoStack.value = []
    useEditorCoreStore().notifyStateUpdate()     // 关键：通知所有组件刷新
    useEditorCoreStore().notifyTreeUpdate()
  }
  function undo() {
    const cmd = undoStack.value.pop()
    if (!cmd) return
    cmd.undo()

    if(cmd instanceof SceneSettingCommand) {
      useEditorCoreStore().setSceneMetadata(cmd.getSceneMetadata())
    }
    
    redoStack.value.push(cmd)
    useEditorCoreStore().notifyStateUpdate()     // 关键：通知所有组件刷新
    useEditorCoreStore().notifyTreeUpdate()
  }
  function redo() {
    const cmd = redoStack.value.pop()
    if (!cmd) return
    cmd.redo()
    undoStack.value.push(cmd)
    useEditorCoreStore().notifyStateUpdate()     // 关键：通知所有组件刷新
    useEditorCoreStore().notifyTreeUpdate()
  }
  function pushWithoutExecute(cmd: ActualCommand) {
    undoStack.value.push(cmd)
    redoStack.value = []
  }
  return { undoStack, redoStack, canUndo, canRedo, execute, undo, redo, pushWithoutExecute }
})
