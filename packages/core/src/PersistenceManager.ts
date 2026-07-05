// 持久化管理器
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { SceneManager } from './SceneManager'
import type { SerializedObject, SceneMetadata, Asset } from '@scene-prod/shared'
import { IEditorAdapter, ISceneRepository } from './adapter'
import { getXYZValueWithDefault } from './utils/sceneTools'
import { createPrimitive, type PrimitiveType } from './utils/objectFactory'

/**
 * 创建对象的描述符，供 createObject 派发使用
 */
export type ObjectDescriptor =
  | { kind: 'gltf'; url: string; name?: string; normalizeScale?: number }
  | { kind: 'obj'; url: string; name?: string; material?: Asset | null }
  | { kind: 'primitive'; primitive: PrimitiveType }

/**
 * 序列化、反序列化对象
 * 加载场景（使用数据库、场景管理器）
 * 保存场景
 * 加载模型
 */
export class PersistenceManager {
  static dracoPath: string = '/draco/'

  static setDracoPath(path: string) {
    PersistenceManager.dracoPath = path.endsWith('/') ? path : path + '/'
  }

  private sceneManager: SceneManager | null = null
  private objectMap: Map<string, string> = new Map()
  private gltfLoader: GLTFLoader = new GLTFLoader()
  private currentSceneId: string = 'default'
  private repository: ISceneRepository | null = null
  private editorAdapter: IEditorAdapter | null = null

  constructor(
    sceneManager: SceneManager,
    repository: ISceneRepository,
    editorAdapter: IEditorAdapter,
    options: {
      dracoPath?: string
    } = {},
  ) {
    this.sceneManager = sceneManager

    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(options.dracoPath || PersistenceManager.dracoPath)
    // 这样就可以加载被压缩的模型
    this.gltfLoader.setDRACOLoader(dracoLoader)

    this.repository = repository
    this.editorAdapter = editorAdapter
  }

  async init(sceneId: string) {
    this.currentSceneId = sceneId
    await this.repository?.init()
    await this.loadScene(sceneId)
  }

  /**
   * 公开（只读）初始化：用于分享链接的 viewer
   * 只加载已发布场景，不涉及编辑相关的写入
   * @param sceneId 场景ID
   */
  async initPublic(sceneId: string): Promise<boolean> {
    this.currentSceneId = sceneId
    await this.repository?.init()
    const sceneData = await this.loadScene(sceneId, true)
    // null 表示场景不存在或未发布，viewer 据此展示错误态
    return !!sceneData
  }

  /**
   * 序列化对象，三维模型 -> 数据库数据模型
   * @param object 需要序列化的对象
   * @returns 序列化后的对象
   */
  serializeObject(object: THREE.Object3D): SerializedObject {
    console.log('序列化的源对象--', object)
    if (object.userData.modelType === 'GLTF') {
      return {
        id: object.uuid,
        sceneId: '',
        type: 'GLTF',
        name: object.name || '',
        url: object.userData.modelUrl,
        visible: object.visible,
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
        scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
        modifications: this.extractModifications(object),
        // children: object.children?.map(child => this.serializeObject(child)),
      }
    } else {
      const mesh = object as THREE.Mesh
      const geometry = mesh.geometry as (THREE.BufferGeometry & { parameters?: Record<string, unknown> }) | undefined
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      return {
        id: object.uuid,
        sceneId: '',
        type: object.type || 'Unknown',
        name: object.name || '',
        url: object.userData.modelUrl,
        visible: object.visible,
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
        scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
        geometry: {
          type: geometry?.type || 'Unknown',
          parameters: geometry?.parameters || {},
        },
        material: material?.toJSON() || {},
        // children: object.children?.map(child => this.serializeObject(child)),
      }
    }
  }

  /**
   * 反序列化对象，数据库数据模型 -> 三维模型
   * @param data 需要反序列化的数据
   * @returns 反序列化后的对象
   */
  async deserializeObject(data: SerializedObject): Promise<THREE.Object3D | null> {
    if (data.type === 'GLTF') {
      const model = await this.loadGLTFModel(data.url)
      model.uuid = data.id
      model.name = data.name
      if (data.visible !== undefined) model.visible = data.visible
      let { x, y, z } = getXYZValueWithDefault(data.position, 0)
      model.position.set(x, y, z)
      ;({ x, y, z } = getXYZValueWithDefault(data.rotation, 0))
      model.rotation.set(x, y, z)
      ;({ x, y, z } = getXYZValueWithDefault(data.scale, 1))
      model.scale.set(x, y, z)
      if (data.modifications) {
        this.applyModifications(model, data.modifications)
      }
      return model
    } else {
      let geometry
      if (data.geometry?.type === 'BoxGeometry') {
        const p = data.geometry.parameters
        geometry = new THREE.BoxGeometry(p.width, p.height, p.depth)
      } else if (data.geometry?.type === 'SphereGeometry') {
        const p = data.geometry.parameters
        geometry = new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments)
      } else {
        // 默认几何体
        geometry = new THREE.BoxGeometry(1, 1, 1)
      }
      const material = new THREE.MeshStandardMaterial({
        color: data.material?.color || 0xffffff,
        roughness: data.material?.roughness ?? 0.5,
        metalness: data.material?.metalness ?? 0.5,
        emissive: data.material?.emissive ?? 0x000000,
        emissiveIntensity: data.material?.emissiveIntensity ?? 1,
        opacity: data.material?.opacity ?? 1,
        alphaTest: data.material?.alphaTest ?? 0,
        blending: data.material?.blending ?? THREE.NormalBlending,
        side: data.material?.side ?? THREE.FrontSide,
        transparent: data.material?.transparent ?? false,
        depthTest: data.material?.depthTest ?? true,
        depthWrite: data.material?.depthWrite ?? true,
        vertexColors: data.material?.vertexColors ?? false,
        wireframe: data.material?.wireframe ?? false,
        flatShading: data.material?.flatShading ?? false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.uuid = data.id
      mesh.name = data.name
      if (data.visible !== undefined) mesh.visible = data.visible
      let { x, y, z } = getXYZValueWithDefault(data.position, 0)
      mesh.position.set(x, y, z)
      ;({ x, y, z } = getXYZValueWithDefault(data.rotation, 0))
      mesh.rotation.set(x, y, z)
      ;({ x, y, z } = getXYZValueWithDefault(data.scale, 1))
      mesh.scale.set(x, y, z)
      return mesh
    }
  }

  async loadGLTFModel(url: string, name?: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          gltf.scene.position.set(0, 0, 0)
          if (gltf.scene.children.length > 0) {
            gltf.scene.children[0].position.set(0, 0, 0)
          }
          const model = gltf.scene
          model.userData.modelType = 'GLTF'
          model.userData.modelUrl = url
          model.userData.isModelRoot = true  // 标记根节点
          name && (model.name = name)
          if (model instanceof THREE.Group) {
            resolve(model)
          } else {
            reject(new Error('模型加载失败'))
          }
        },
        undefined,
        (error) => {
          const errorMsg = `模型加载失败: ${url}`
          console.error('❌', errorMsg, error)
          reject(new Error(errorMsg))
        },
      )
    })
  }

  async loadModel(url: string, material: Asset|null): Promise<THREE.Group> {
    if (!url.endsWith('.obj')) return Promise.reject('模型类型不支持')
    let model: THREE.Object3D | null = null
    if (material) {
      model = await new Promise<THREE.Object3D>((resolve, reject) => {
        const mtlLoader = new MTLLoader()
        mtlLoader.load(
          material.url!,
          (materials) => {
            materials.preload()
            const objLoader = new OBJLoader()
            objLoader.setMaterials(materials)
            objLoader.load(url, resolve, undefined, reject)
          },
          undefined,
          reject,
        )
      })
    } else {
      model = await new Promise<THREE.Object3D>((resolve, reject) => {
        new OBJLoader().load(url, resolve, undefined, reject)
      })
    }
    model.userData.isModelRoot = true  // 标记根节点
    return new Promise((resolve, reject) => {
      if (model instanceof THREE.Group) {
        resolve(model)
      } else {
        reject(new Error('模型加载失败'))
      }
    })
  }

  /**
   * 根据描述符创建对象，统一 GLTF / OBJ / 基础几何体的创建入口
   * 只负责创建，不负责放置到场景中（放置由 SceneManager.placeObjectAt 与 AddObjectCommand 处理）
   * @param descriptor 对象描述符
   * @returns 创建的对象，类型不支持时返回 null
   */
  async createObject(descriptor: ObjectDescriptor): Promise<THREE.Object3D | null> {
    switch (descriptor.kind) {
      case 'gltf': {
        const object = await this.loadGLTFModel(descriptor.url, descriptor.name)
        // 首次实例化时把模型换算到米制（之后会随 scale 一并保存，重载场景不再重复应用）
        if (object && descriptor.normalizeScale && descriptor.normalizeScale !== 1) {
          object.scale.multiplyScalar(descriptor.normalizeScale)
        }
        return object
      }
      case 'obj':
        return this.loadModel(descriptor.url, descriptor.material ?? null)
      case 'primitive':
        return createPrimitive(descriptor.primitive)
    }
  }

  /**
   * 提取 GLTF 对象的修改记录, 用于存储在数据库中
   * @param object 需要提取修改的对象
   * @returns 修改的记录
   */
  extractModifications(object: THREE.Object3D): Record<string, any> {
    const modifications: Record<string, any> = {}
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child !== object) {
        const hasModifications =
          child.userData.positionModified ||
          child.userData.rotationModified ||
          child.userData.scaleModified ||
          child.userData.visibleModified ||
          child.userData.materialModified
        if (hasModifications) {
          const path = this.getObjectPath(child, object)
          modifications[path] = {}

          if (child.userData.visibleModified) {
            modifications[path].visible = child.visible
          }
          if (child.userData.positionModified) {
            modifications[path].position = { x: child.position.x, y: child.position.y, z: child.position.z }
          }
          if (child.userData.rotationModified) {
            modifications[path].rotation = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z }
          }
          if (child.userData.scaleModified) {
            modifications[path].scale = { x: child.scale.x, y: child.scale.y, z: child.scale.z }
          }
          if (child.userData.materialModified && child.material) {
            modifications[path].material = {
              // 将颜色(color: Color {isColor: true, r: 0.10946171076915331, g: 0.9911020971136257, b: 0.6724431569510133})转换为十六进制字符串
              color: child.material.color ? '#' + child.material.color.getHexString() : undefined,
              roughness: child.material.roughness,
              metalness: child.material.metalness,
              emissive: child.material.emissive ? '#' + child.material.emissive.getHexString() : undefined,
              emissiveIntensity: child.material.emissiveIntensity,
              opacity: child.material.opacity,
              alphaTest: child.material.alphaTest,
              blending: child.material.blending,
              side: child.material.side,
              transparent: child.material.transparent,
              depthTest: child.material.depthTest,
              depthWrite: child.material.depthWrite,
              vertexColors: child.material.vertexColors,
              wireframe: child.material.wireframe,
              flatShading: child.material.flatShading,
            }
          }
        }
      }
    })
    console.log('序列化模型的修改：', modifications)
    return modifications
  }

  /**
   * 获取对象相对于根节点的路径
   * 一律使用子节点在父 children 中的索引（child_<index>），而非名称：
   * 同一源模型多次加载时索引是稳定且唯一的，可避免 GLTF 同级重名/空名带来的匹配歧义。
   * @param object 需要获取路径的对象
   * @param root 根对象
   * @returns 路径 (例如: 'child_0/child_2/child_1')
   */
  getObjectPath(object: THREE.Object3D, root: THREE.Object3D): string {
    const path: string[] = []
    let current: THREE.Object3D | null = object
    while (current && current !== root) {
      const parent: THREE.Object3D | null = current.parent
      const index = parent ? parent.children.indexOf(current) : -1
      // current 一定是其 parent 的 child，index 正常不会为 -1；兜底为 0
      path.unshift(`child_${index >= 0 ? index : 0}`)
      current = parent || null
    }
    return path.join('/')
  }

  /**
   * 应用修改的记录到根对象
   * @param rootObject 根对象
   * @param modifications 修改的记录
   */
  applyModifications(rootObject: THREE.Object3D, modifications: Record<string, any>) {
    console.log('反序列化模型的修改--', modifications)
    for (const [path, mods] of Object.entries(modifications)) {
      const child = this.findObjectByPath(rootObject, path)
      if (child) {
        if (mods.visible !== undefined) {
          child.visible = mods.visible
          child.userData.visibleModified = true
        }
        if (mods.position) {
          child.position.set(mods.position.x, mods.position.y, mods.position.z)
          child.userData.positionModified = true
        }
        if (mods.rotation) {
          child.rotation.set(mods.rotation.x, mods.rotation.y, mods.rotation.z)
          child.userData.rotationModified = true
        }
        if (mods.scale) {
          child.scale.set(mods.scale.x, mods.scale.y, mods.scale.z)
          child.userData.scaleModified = true
        }
        if (mods.material && child instanceof THREE.Mesh && child.material) {
          if (mods.material.color !== undefined) child.material.color.set(mods.material.color)
          if (mods.material.roughness !== undefined) child.material.roughness = mods.material.roughness
          if (mods.material.metalness !== undefined) child.material.metalness = mods.material.metalness
          if (mods.material.emissive !== undefined && child.material.emissive)
            child.material.emissive.set(mods.material.emissive)
          if (mods.material.emissiveIntensity !== undefined)
            child.material.emissiveIntensity = mods.material.emissiveIntensity
          if (mods.material.opacity !== undefined) child.material.opacity = mods.material.opacity
          if (mods.material.alphaTest !== undefined) child.material.alphaTest = mods.material.alphaTest

          if (mods.material.blending !== undefined) child.material.blending = mods.material.blending
          if (mods.material.side !== undefined) child.material.side = mods.material.side
          if (mods.material.transparent !== undefined) child.material.transparent = mods.material.transparent
          if (mods.material.depthTest !== undefined) child.material.depthTest = mods.material.depthTest
          if (mods.material.depthWrite !== undefined) child.material.depthWrite = mods.material.depthWrite
          if (mods.material.vertexColors !== undefined) child.material.vertexColors = mods.material.vertexColors
          if (mods.material.wireframe !== undefined) child.material.wireframe = mods.material.wireframe
          if (mods.material.flatShading !== undefined) child.material.flatShading = mods.material.flatShading

          child.material.needsUpdate = true
          child.userData.materialModified = true
        }
      }
    }
  }

  /**
   * 根据路径查找对象, 用于应用修改的记录
   * 新数据的路径段均为 child_<index>（走索引查找，无歧义）；
   * 非 child_ 段为历史遗留的按名称路径，仅作向后兼容保留。
   * @param rootObject 根对象
   * @param path 路径 (例如: 'child_0/child_1')
   * @returns 找到的对象或 null
   */
  findObjectByPath(rootObject: THREE.Object3D, path: string): THREE.Object3D | null {
    const parts = path.split('/')
    let current: THREE.Object3D | null = rootObject
    for (const part of parts) {
      if (part.startsWith('child_')) {
        const index = parseInt(part.split('_')[1])
        current = current.children?.[index] || null
      } else {
        // 兼容旧数据：按名称匹配（可能因同级重名而命中第一个）
        current = current.children?.find((child) => child.name === part) || null
      }
      if (!current) return null
    }
    return current
  }

  /**
   * 加载场景
   * @param sceneId 场景ID
   * @param isPublic 是否加载已发布的场景
   * @returns sceneData | null
   */
  async loadScene(sceneId: string, isPublic = false) {
    this.currentSceneId = sceneId || this.currentSceneId

    const sceneData = isPublic
      ? await this.repository?.getPublicSceneData(this.currentSceneId)
      : await this.repository?.getSceneData(this.currentSceneId)

    this.sceneManager?.clearScene()
    // this.editorAdapter?.resetObjects()
    this.editorAdapter?.clearSelection()

    if (sceneData?.metadata) {
      this.editorAdapter?.setSceneMetadata(sceneData.metadata)

      if (sceneData.metadata.cameraFar) {
        this.sceneManager?.setCameraFar(sceneData.metadata.cameraFar)
      }
      this.sceneManager?.setCameraPosition(getXYZValueWithDefault(sceneData.metadata.cameraPosition, 5))
      const envUrl = sceneData.metadata.environmentUrl
      if (envUrl) {
        try {
          await this.sceneManager?.loadEnvironment(envUrl)
        } catch (error) {
          console.error('加载环境贴图失败:', error)
        }
      }
    }

    const objects = sceneData?.objects || []
    let successCount = 0
    let failedCount = 0
    const failedObjects: { name: string; type: string; error: string }[] = []
    for (const data of objects) {
      try {
        const object = await this.deserializeObject(data)
        if (object) {
          this.sceneManager?.addObject2Scene(object)
          this.objectMap.set(object.uuid, data.id)
          // this.editorAdapter?.addObject(object)
          successCount++
        }
      } catch (error: unknown) {
        failedCount++
        failedObjects.push({
          name: data.name || '未命名',
          type: data.type || 'Unknown',
          error: (error as Error).message || '未知错误',
        })
      }
    }

    console.log(`场景加载完成：成功 ${successCount}/${objects.length}`)

    return sceneData ?? null
  }

  async saveScene(
    storeData: SceneMetadata,
    callBacks?: {
      onSuccess?: (message: string) => void
      onError?: (message: string) => void
    },
  ) {
    if (!this.currentSceneId) {
      console.error('当前未设置场景ID')
      callBacks?.onError?.('当前未设置场景ID')
      return false
    }
    const serializedObjects = Array.from(this.sceneManager?.objects || []).map((object) => this.serializeObject(object))
    const environmentUrl = this.sceneManager?.environmentUrl || null

    console.log('serializedObjects-', serializedObjects)
    const result = await this.repository?.saveScene({
      objects: serializedObjects,
      sceneId: this.currentSceneId,
      name: storeData.name || '未命名',
      description: storeData.description || '',
      cameraFar: storeData.cameraFar || 1000,
      lastModified: storeData.lastModified || Date.now(),
      objectCount: storeData.objectCount || serializedObjects.length,
      environmentUrl: environmentUrl || '',
      gisConfig: storeData.gisConfig || null,
      thumbnail: '',
      cloudUrls: '',
      backgroundColor: storeData.backgroundColor || '#ffffff',
      ambientIntensity: storeData.ambientIntensity || 1.0,
      cameraPosition: this.sceneManager?.getCameraPosition() || { x: 5, y: 5, z: 5 },
      isPublished: storeData.isPublished
    })
    if (!result) {
      callBacks?.onError?.('保存场景失败')
      return false
    }

    serializedObjects.forEach((obj) => {
      const data = Array.from(this.sceneManager?.objects || []).find((object) => object.uuid === obj.id)
      if (data) {
        this.objectMap.set(data.uuid, obj.id)
      }
    })
    callBacks?.onSuccess?.('保存场景成功')
    return true
  }

  async clearScene() {
    if (!this.currentSceneId) return
    await this.repository?.clearAllObjects(this.currentSceneId)
    this.objectMap.clear()
    this.sceneManager?.clearScene()
  }
}
