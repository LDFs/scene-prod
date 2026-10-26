import type { ActualCommand } from './Command'

function commandLabel(command: ActualCommand): string {
  return 'label' in command && typeof command.label === 'string'
    ? command.label
    : command.constructor.name
}

export class BatchCommand implements ActualCommand {
  // 仅撤销本次 execute/redo 成功的命令。
  private executed: ActualCommand[] = []
  private errors: { cmd: ActualCommand; error: unknown; name: string }[] = []

  constructor(private cmds: ActualCommand[], public label: string) {}

  execute() {
    this.executed = []
    this.errors = []
    for (const command of this.cmds) {
      try {
        command.execute()
        this.executed.push(command)
      } catch (error) {
        this.errors.push({ cmd: command, error, name: commandLabel(command) })
        console.error('[BatchCommand] 指令执行失败,已跳过:', error)
      }
    }
  }

  undo() {
    ;[...this.executed].reverse().forEach((command) => command.undo())
  }

  redo() {
    this.executed = []
    this.errors = []
    for (const command of this.cmds) {
      try {
        command.redo()
        this.executed.push(command)
      } catch (error) {
        this.errors.push({ cmd: command, error, name: commandLabel(command) })
        console.error('[BatchCommand] 重做失败,已跳过:', error)
      }
    }
  }

  getAdjustmentNotes(): string[] {
    return this.cmds.flatMap((command) =>
      'adjustmentNote' in command && typeof command.adjustmentNote === 'string' && command.adjustmentNote
        ? [command.adjustmentNote]
        : [],
    )
  }

  getErrors(): { cmd: ActualCommand; error: unknown; name: string }[] {
    return this.errors
  }
}
