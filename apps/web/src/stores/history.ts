// TODO: Command 模式的撤销 / 重做栈
import { defineStore } from 'pinia'
import { ActualCommand } from '@scene-prod/core'
import { computed } from 'vue'
import { ref } from 'vue'

export const useHistoryStore = defineStore('history', () => {
  const undoStack = ref<ActualCommand[]>([])
  const redoStack = ref<ActualCommand[]>([])

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  function execute(cmd: ActualCommand) {
    cmd.execute()
    undoStack.value.push(cmd) // 新数组触发响应式
    redoStack.value = []
  }
  function undo() {
    const cmd = undoStack.value.pop()
    if (!cmd) return
    cmd.undo()

    redoStack.value.push(cmd)
  }
  function redo() {
    const cmd = redoStack.value.pop()
    if (!cmd) return
    cmd.redo()
    undoStack.value.push(cmd)
  }
  function pushWithoutExecute(cmd: ActualCommand) {
    undoStack.value.push(cmd)
    redoStack.value = []
  }
  function dispose() {
    undoStack.value = []
    redoStack.value = []
  }
  return { undoStack, redoStack, canUndo, canRedo, execute, undo, redo, pushWithoutExecute, dispose }
})
