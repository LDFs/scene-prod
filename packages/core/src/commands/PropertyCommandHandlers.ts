import * as THREE from 'three'
import { PropertyDefinitions } from '@scene-prod/shared'
import type {
  SceneMetadata, SetPropertyCommand, MaterialPropertyTarget, PropertyChangeHooks,
  PropertyChangeFactory, PropertyDefinition, MaterialPropertyContext, ScenePropertyContext,
} from '@scene-prod/shared'
import type { SceneManager } from '../SceneManager'
import type { ActualCommand } from './Command'
import { BatchCommand } from './BatchCommand'

/** 宿主提供界面通知和当前场景元数据；属性规则位于 shared 的统一描述表。 */
export interface AICommandHooks extends PropertyChangeHooks {
  getSceneMetadata?: () => SceneMetadata
}

function findDefinition<Target>(
  definitions: Record<string, PropertyDefinition<Target>>, property: string,
): PropertyDefinition<Target> {
  if (!Object.prototype.hasOwnProperty.call(definitions, property)) {
    throw new Error(`不支持的属性：${property}`)
  }
  return definitions[property]
}

type MaterialSelection = Pick<MaterialPropertyTarget, 'materialIndex' | 'includeDescendants'>

/** 只处理目标选择和共享材质去重，属性值及副作用由描述表处理。 */
function createMaterialCommand(
  object: THREE.Object3D,
  property: string,
  value: unknown,
  hooks: AICommandHooks,
  selection: MaterialSelection,
  createCommand: PropertyChangeFactory<ActualCommand>,
): ActualCommand {
  const definition = findDefinition<MaterialPropertyContext>(PropertyDefinitions.material, property)
  const owners = new Map<THREE.MeshStandardMaterial, Set<THREE.Mesh>>()
  const collect = (child: THREE.Object3D) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const selected = selection.materialIndex === 'all' ? materials : [materials[selection.materialIndex]]
    for (const material of selected) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      const meshes = owners.get(material) ?? new Set<THREE.Mesh>()
      meshes.add(child)
      owners.set(material, meshes)
    }
  }
  if (selection.includeDescendants) object.traverse(collect)
  else collect(object)
  if (owners.size === 0) throw new Error(`对象「${object.name || object.uuid}」没有可编辑的标准材质（指定槽位）`)

  const commands = [...owners].map(([material, meshes]) =>
    definition.createChange({ material, owners: [...meshes] }, value, hooks, createCommand),
  )
  return commands.length === 1 ? commands[0] : new BatchCommand(commands, `修改「${object.name || object.uuid}」材质.${property}`)
}

/** 由工厂在首次执行时调用；注入命令构建函数，避免处理器反向引用工厂。 */
export function convertSetPropertyCommand(
  cmd: SetPropertyCommand,
  manager: SceneManager,
  hooks: AICommandHooks,
  createCommand: PropertyChangeFactory<ActualCommand>,
): ActualCommand {
  if (cmd.target.scope === 'scene') {
    const metadata = hooks.getSceneMetadata?.()
    if (!metadata) throw new Error('未提供当前场景元数据')
    const target: ScenePropertyContext = {
      metadata,
      runtime: {
        setAmbientLight: (color, intensity) => manager.setAmbientLight(color, intensity),
        setCameraFar: (far) => manager.setCameraFar(far),
        getCameraNear: () => manager.camera.near,
      },
    }
    return findDefinition<ScenePropertyContext>(PropertyDefinitions.scene, cmd.property)
      .createChange(target, cmd.value, hooks, createCommand)
  }
  const object = manager.findObjectByUuid(cmd.target.objectId)
  if (!object) throw new Error(`找不到对象 ID：${cmd.target.objectId}`)
  if (cmd.target.scope === 'material') {
    return createMaterialCommand(object, cmd.property, cmd.value, hooks, cmd.target, createCommand)
  }
  return findDefinition<THREE.Object3D>(PropertyDefinitions.object, cmd.property)
    .createChange(object, cmd.value, hooks, createCommand)
}
