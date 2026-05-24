import * as THREE from 'three'
import { ActualCommand, AddCommand, Command, DeleteCommand, MaterialCommand, TransformCommand } from './Command'
import { SceneManager } from '@/SceneManager'
import { PersistenceManager } from '@/PersistenceManager'
import { MaterialState, ObjectState, PropertyType, SceneMetadata } from '@scene-prod/shared'

/**
 * 添加对象指令
 */
export class AddObjectCommand implements AddCommand {
  private sceneManager: SceneManager
  private object: THREE.Object3D
  constructor(sceneManager: SceneManager, object: THREE.Object3D) {
    this.sceneManager = sceneManager
    this.object = object
  }
  execute(): void {
    this.sceneManager.addObject2Scene(this.object)
  }
  undo(): void {
    this.sceneManager.removeObjectFromScene(this.object)
  }
  redo(): void {
    this.sceneManager.addObject2Scene(this.object)
  }
}

/**
 * 删除对象指令
 */
export class DeleteObjectCommand implements DeleteCommand {
  private sceneManager: SceneManager
  private object: THREE.Object3D
  constructor(sceneManager: SceneManager, object: THREE.Object3D) {
    this.sceneManager = sceneManager
    this.object = object
  }
  execute(): void {
    this.sceneManager.removeObjectFromScene(this.object)
  }
  undo(): void {
    this.sceneManager.addObject2Scene(this.object)
  }
  redo(): void {
    this.sceneManager.removeObjectFromScene(this.object)
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

/**
 * 材质修改指令
 */
export class MaterialObjectCommand implements MaterialCommand {
  private object: THREE.Object3D
  private oldState: MaterialState
  private newState: MaterialState
  constructor(object: THREE.Object3D, oldState: MaterialState, newState: MaterialState) {
    this.object = object
    this.oldState = oldState
    this.newState = newState
  }
  execute(): void {
    if (this.object instanceof THREE.Mesh && this.object.material) {
      this.object.material.color.copy(this.newState.color)
      this.object.material.roughness = this.newState.roughness
      this.object.material.metalness = this.newState.metalness
      this.object.material.emissive.copy(this.newState.emissive)
      this.object.material.emissiveIntensity = this.newState.emissiveIntensity
      this.object.material.opacity = this.newState.opacity
      this.object.material.alphaTest = this.newState.alphaTest
      this.object.material.blending = this.newState.blending
      this.object.material.side = this.newState.side
      this.object.material.transparent = this.newState.transparent
      this.object.material.depthTest = this.newState.depthTest
      this.object.material.depthWrite = this.newState.depthWrite
      this.object.material.vertexColors = this.newState.vertexColors
      this.object.material.wireframe = this.newState.wireframe
      this.object.material.flatShading = this.newState.flatShading
    }
  }
  undo(): void {
    if (this.object instanceof THREE.Mesh && this.object.material) {
      this.object.material.color.copy(this.oldState.color)
      this.object.material.roughness = this.oldState.roughness
      this.object.material.metalness = this.oldState.metalness
      this.object.material.emissive.copy(this.oldState.emissive)
      this.object.material.emissiveIntensity = this.oldState.emissiveIntensity
      this.object.material.opacity = this.oldState.opacity
      this.object.material.alphaTest = this.oldState.alphaTest
      this.object.material.blending = this.oldState.blending
      this.object.material.side = this.oldState.side
      this.object.material.transparent = this.oldState.transparent
      this.object.material.depthTest = this.oldState.depthTest
      this.object.material.depthWrite = this.oldState.depthWrite
      this.object.material.vertexColors = this.oldState.vertexColors
      this.object.material.wireframe = this.oldState.wireframe
      this.object.material.flatShading = this.oldState.flatShading

      this.object.material.needsUpdate = true
    }
  }
  redo(): void {
    if (this.object instanceof THREE.Mesh && this.object.material) {
      this.object.material.color.copy(this.newState.color)
      this.object.material.roughness = this.newState.roughness
      this.object.material.metalness = this.newState.metalness
      this.object.material.emissive.copy(this.newState.emissive)
      this.object.material.emissiveIntensity = this.newState.emissiveIntensity
      this.object.material.opacity = this.newState.opacity
      this.object.material.alphaTest = this.newState.alphaTest
      this.object.material.blending = this.newState.blending
      this.object.material.side = this.newState.side
      this.object.material.transparent = this.newState.transparent
      this.object.material.depthTest = this.newState.depthTest
      this.object.material.depthWrite = this.newState.depthWrite
      this.object.material.vertexColors = this.newState.vertexColors
      this.object.material.wireframe = this.newState.wireframe
      this.object.material.flatShading = this.newState.flatShading
      this.object.material.needsUpdate = true
    }
  }
}

export class PropertiyBaseCommand implements ActualCommand {
  private object: THREE.Object3D | null
  private oldProperty: PropertyType
  private newProperty: PropertyType
  constructor(object: THREE.Object3D | null, oldProperty: PropertyType, newProperty: PropertyType) {
    // 假设指令里面的 object 记录的是被修改了值的对象，而不是被选择的对象
    this.object = object
    this.oldProperty = oldProperty
    this.newProperty = newProperty
  }
  getObject() {
    return this.object
  }
  setObject(object: THREE.Object3D | null) {
    this.object = object
  }
  setOldProperty(property: PropertyType) {
    this.oldProperty = property
  }
  setNewProperty(property: PropertyType) {
    this.newProperty = property
  }
  getOldProperty() {
    return this.oldProperty
  }
  getNewProperty() {
    return this.newProperty
  }
  execute(): void {
    if(!this.object) return
    this.object.name = this.newProperty.name
    this.object.visible = this.newProperty.visible
  }
  undo(): void {
    if(!this.object) return
    this.object.name = this.oldProperty.name
    this.object.visible = this.oldProperty.visible

  }
  redo(): void {
    if(!this.object) return
    this.object.name = this.newProperty.name
    this.object.visible = this.newProperty.visible
  }
}

export class SceneSettingCommand implements ActualCommand {
  private oldState: SceneMetadata
  private newState: SceneMetadata
  private sceneManager: SceneManager
  private sceneData: SceneMetadata

  constructor(sceneManager: SceneManager, oldState: SceneMetadata, newState: SceneMetadata, sceneData: SceneMetadata) {
    this.sceneManager = sceneManager
    this.oldState = oldState
    this.newState = newState
    this.sceneData = sceneData
  }
  execute(): void {
    this.sceneData.name = this.newState.name
    this.sceneData.description = this.newState.description
    this.sceneData.cameraFar = this.newState.cameraFar
    this.sceneData.backgroundColor = this.newState.backgroundColor
    this.sceneData.ambientIntensity = this.newState.ambientIntensity
    this.sceneData.lastModified = new Date()
    this.sceneData.environmentUrl = this.newState.environmentUrl

    this.sceneManager.setCameraFar(this.newState.cameraFar)
    this.sceneManager.setAmbientLight(this.newState.backgroundColor, this.newState.ambientIntensity)
    this.newState.environmentUrl && this.sceneManager.loadEnvironment(this.newState.environmentUrl)
  }
  getSceneMetadata() {
    return this.sceneData
  }
  undo(): void {
    this.sceneData.name = this.oldState.name
    this.sceneData.description = this.oldState.description
    this.sceneData.cameraFar = this.oldState.cameraFar
    this.sceneData.backgroundColor = this.oldState.backgroundColor
    this.sceneData.ambientIntensity = this.oldState.ambientIntensity
    this.sceneData.lastModified = new Date()
    this.sceneData.environmentUrl = this.oldState.environmentUrl

    this.sceneManager.setCameraFar(this.oldState.cameraFar)
    this.sceneManager.setAmbientLight(this.oldState.backgroundColor, this.oldState.ambientIntensity)
    this.oldState.environmentUrl && this.sceneManager.loadEnvironment(this.oldState.environmentUrl)
  }
  redo(): void {
    this.sceneData.name = this.newState.name
    this.sceneData.description = this.newState.description
    this.sceneData.cameraFar = this.newState.cameraFar
    this.sceneData.backgroundColor = this.newState.backgroundColor
    this.sceneData.ambientIntensity = this.newState.ambientIntensity
    this.sceneData.lastModified = new Date()
    this.sceneData.environmentUrl = this.newState.environmentUrl

    this.sceneManager.setCameraFar(this.newState.cameraFar)
    this.sceneManager.setAmbientLight(this.newState.backgroundColor, this.newState.ambientIntensity)
    this.newState.environmentUrl && this.sceneManager.loadEnvironment(this.newState.environmentUrl)
  }
}