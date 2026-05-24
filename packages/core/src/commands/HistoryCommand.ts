import { AddCommand, Command, DeleteCommand, TransformCommand } from './Command'

/**
 * @deprecated 不使用这个来进行历史记录，使用编辑器中的 historyStore 来管理历史记录
 */
export class HistoryCommand implements Command {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  constructor() {
    this.undoStack = []
    this.redoStack = []
  }
  execute(command: AddCommand | DeleteCommand | TransformCommand): void {
    this.undoStack.push(command)
    this.redoStack.length = 0
    command.execute()
  }
  undo(): void {
    const command = this.undoStack.pop()
    if (command) {
      command.undo()
      this.redoStack.push(command)
    }
  }
  redo(): void {
    const command = this.redoStack.pop()
    if (command) {
      command.redo()
    }
  }
  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
  getUndoStack() {
    return this.undoStack
  }
  getRedoStack() {
    return this.redoStack
  }
  pushWithoutExecute(command: AddCommand | DeleteCommand | TransformCommand): void {
    this.undoStack.push(command)
    this.redoStack.length = 0
  }
}
