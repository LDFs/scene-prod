import * as THREE from 'three'
import type { ActualCommand, AddCommand, DeleteCommand, TransformCommand } from './Command'
import type { SceneManager } from '../SceneManager'
import type {
  ObjectState,
  SceneCommand,
  CreateObjectCommand as AICreateObjectCommand,
  DeleteObjectCommand as AIDeleteObjectCommand,
} from '@scene-prod/shared'
import { findFreePosition } from '../utils/sceneTools'
import { convertSetPropertyCommand, type AICommandHooks } from './PropertyCommandHandlers'

export { BatchCommand } from './BatchCommand'
export type { AICommandHooks } from './PropertyCommandHandlers'

/** 统一执行新值、撤销到旧值；领域规则由属性处理器提供的 setter 负责。 */
export class HandleActualCommand<T> implements ActualCommand {
  constructor(
    private oldValue: T,
    private newValue: T,
    private setter: (value: T) => void,
  ) {}

  execute(): void {
    this.setter(this.newValue)
  }

  undo(): void {
    this.setter(this.oldValue)
  }

  redo(): void {
    this.setter(this.newValue)
  }
}

/**
 * 添加对象指令
 */
export class AddObjectCommand implements AddCommand {
  private sceneManager: SceneManager
  private object: THREE.Object3D
  private allowOverlap: boolean
  private isFirstCreate = true
  adjustmentNote = ''

  constructor(
    sceneManager: SceneManager,
    object: THREE.Object3D,
    allowOverlap = false,
    private hooks: AICommandHooks = {},
  ) {
    this.sceneManager = sceneManager
    this.object = object
    this.allowOverlap = allowOverlap
  }
  execute(): void {
    this.sceneManager.addObject2Scene(this.object)
    this.hooks.onSceneChange?.()
    if (!this.isFirstCreate || this.allowOverlap) return
    const originalPos = this.object.position.clone()
    findFreePosition(this.object as THREE.Mesh, this.sceneManager.scene, originalPos)
    this.isFirstCreate = false

    // 检测是否发生了位置修正
    const finalPos = this.object.position
    const moved = originalPos.distanceTo(finalPos) > 0.01
    console.log('--', originalPos, finalPos, moved)
    if (moved) {
      const fmt = (n: number) => parseFloat(n.toFixed(2))
      this.adjustmentNote =
        `「${this.object.name}」位置已从 ` +
        `(${fmt(originalPos.x)}, ${fmt(originalPos.y)}, ${fmt(originalPos.z)}) ` +
        `自动调整至 (${fmt(finalPos.x)}, ${fmt(finalPos.y)}, ${fmt(finalPos.z)}) 以避免重叠`
    }
  }
  undo(): void {
    this.sceneManager.removeObjectFromScene(this.object)
    this.hooks.onSceneChange?.()
  }
  redo(): void {
    this.sceneManager.addObject2Scene(this.object)
    this.hooks.onSceneChange?.()
  }
}

/**
 * 删除对象指令
 */
export class DeleteObjectCommand implements DeleteCommand {
  private sceneManager: SceneManager
  private object: THREE.Object3D
  constructor(
    sceneManager: SceneManager,
    object: THREE.Object3D,
    private hooks: AICommandHooks = {},
  ) {
    this.sceneManager = sceneManager
    this.object = object
  }
  execute(): void {
    this.sceneManager.removeObjectFromScene(this.object)
    this.hooks.onSceneChange?.()
  }
  undo(): void {
    this.sceneManager.addObject2Scene(this.object)
    this.hooks.onSceneChange?.()
  }
  redo(): void {
    this.sceneManager.removeObjectFromScene(this.object)
    this.hooks.onSceneChange?.()
  }
}

/**
 * 位置、旋转、缩放修改指令
 */
export class TransformObjectCommand implements TransformCommand {
  private object: THREE.Object3D
  private oldState: ObjectState
  private newState: ObjectState
  constructor(object: THREE.Object3D, oldState: ObjectState, newState: ObjectState) {
    this.object = object
    this.oldState = oldState
    this.newState = newState
  }
  execute(): void {
    this.object.position.copy(this.newState.position)
    this.object.rotation.copy(this.newState.rotation)
    this.object.scale.copy(this.newState.scale)

    // 标记对象为已修改，以便持久化保存
    this.object.userData.positionModified = true
    this.object.userData.rotationModified = true
    this.object.userData.scaleModified = true
  }
  undo(): void {
    this.object.position.copy(this.oldState.position)
    this.object.rotation.copy(this.oldState.rotation)
    this.object.scale.copy(this.oldState.scale)

    // 即使是撤销，也标记为已修改，确保状态一致性
    this.object.userData.positionModified = true
    this.object.userData.rotationModified = true
    this.object.userData.scaleModified = true
  }
  redo(): void {
    this.object.position.copy(this.newState.position)
    this.object.rotation.copy(this.newState.rotation)
    this.object.scale.copy(this.newState.scale)

    this.object.userData.positionModified = true
    this.object.userData.rotationModified = true
    this.object.userData.scaleModified = true
  }
}

/** 可拖拽替换的贴图槽位 */
export type MaterialMapSlot = 'map' | 'normalMap'

/**
 * 贴图替换指令（从资源库拖图到材质面板触发）
 *
 * 独立记录单个贴图槽位，避免与颜色等属性的撤销互相覆盖。
 * 保留供尚未迁移到 HandleActualCommand 的调用方使用。
 */
export class MaterialMapCommand implements ActualCommand {
  constructor(
    private object: THREE.Object3D,
    /** 直接持有材质实例：面板编辑的就是 mesh.material[0]，必须作用在同一个实例上 */
    private material: THREE.Material,
    private slot: MaterialMapSlot,
    private oldTexture: THREE.Texture | null,
    private newTexture: THREE.Texture | null,
  ) {}

  private apply(texture: THREE.Texture | null) {
    ;(this.material as any)[this.slot] = texture
    // 贴图在有/无之间切换会改变着色器的 define，不重编译不会生效
    this.material.needsUpdate = true
    // 持久化靠这个标记决定要不要 diff 这个网格的材质
    this.object.userData.materialModified = true
  }

  execute(): void {
    this.apply(this.newTexture)
  }
  undo(): void {
    this.apply(this.oldTexture)
  }
  redo(): void {
    this.apply(this.newTexture)
  }
}

/** 批量命令会预先解析；执行到本条时才定位对象、读取旧值，重做复用原快照。 */
class DeferredAICommand implements ActualCommand {
  private command: ActualCommand | null = null

  constructor(
    public label: string,
    private createCommand: () => ActualCommand,
  ) {}

  execute() {
    this.command ??= this.createCommand()
    this.command.execute()
  }

  undo() {
    this.command?.undo()
  }

  redo() {
    if (this.command) this.command.redo()
    else this.execute()
  }
}

function convertDeleteCommand(
  cmd: AIDeleteObjectCommand,
  sceneManager: SceneManager,
  hooks: AICommandHooks = {},
): ActualCommand {
  return new DeferredAICommand('delete:' + (cmd.name || cmd.id), () => {
    const object = sceneManager.findObjectByUuid(cmd.id)
    if (!object) throw new Error(`找不到对象 ID：${cmd.id}`)
    return new DeleteObjectCommand(sceneManager, object, hooks)
  })
}

function convertCreateCommand(
  cmd: AICreateObjectCommand,
  sceneManager: SceneManager,
  hooks: AICommandHooks = {},
): ActualCommand {
  const geometry =
    cmd.objectType === 'sphere'
      ? new THREE.SphereGeometry(cmd.radius ?? 0.2, 24, 24)
      : new THREE.BoxGeometry(cmd.width ?? 1, cmd.height ?? 1, cmd.depth ?? 1)
  const material = new THREE.MeshStandardMaterial({
    color: cmd.color,
    roughness: cmd.roughness,
    metalness: cmd.metalness,
    opacity: cmd.opacity,
    transparent: cmd.opacity < 1,
    wireframe: cmd.wireframe,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = cmd.name
  mesh.position.set(cmd.position.x ?? 0, cmd.position.y ?? 0, cmd.position.z ?? 0)
  mesh.rotation.set(cmd.rotation.x ?? 0, cmd.rotation.y ?? 0, cmd.rotation.z ?? 0)
  mesh.scale.set(cmd.scale.x ?? 1, cmd.scale.y ?? 1, cmd.scale.z ?? 1)
  mesh.userData.isModelRoot = true
  return new AddObjectCommand(sceneManager, mesh, cmd.allowOverlap, hooks)
}

/** 仅分发 AI 意图；add_model 由前端异步资源加载器处理。 */
export function fromAICommand(
  cmd: SceneCommand,
  sceneManager: SceneManager,
  hooks: AICommandHooks = {},
): ActualCommand | null {
  switch (cmd.commandType) {
    case 'set_property': {
      const target = cmd.target.scope === 'scene' ? 'scene' : cmd.target.objectId
      return new DeferredAICommand(`set_property:${target}:${cmd.property}`, () =>
        convertSetPropertyCommand(
          cmd,
          sceneManager,
          hooks,
          (oldValue, newValue, setter) => new HandleActualCommand(oldValue, newValue, setter),
        ),
      )
    }
    case 'create':
      return convertCreateCommand(cmd, sceneManager, hooks)
    case 'delete':
      return convertDeleteCommand(cmd, sceneManager, hooks)
    case 'add_model':
      return null
  }
}
