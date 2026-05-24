// TODO: Command 接口：do / undo / serialize
export interface Command {
  execute(command: Command): void
  undo(): void
  redo(): void
}

export interface ActualCommand extends Command {
  execute(): void
}

export interface AddCommand extends Command {
  execute(): void
}

export interface DeleteCommand extends Command {
  execute(): void
}

export interface TransformCommand extends Command {
  execute(): void
}

export interface MaterialCommand extends Command {
  execute(): void
}