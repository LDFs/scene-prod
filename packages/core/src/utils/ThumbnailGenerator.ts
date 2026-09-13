import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/Addons.js'

import {setResizer} from './sceneTools'


export class ThumbnailGenerator {
  private width: number
  private height: number
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private gltfLoader: GLTFLoader
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer)
    pmremGenerator.compileEquirectangularShader()
    const roomEnvironment = new RoomEnvironment()
    this.scene.environment = pmremGenerator.fromScene(roomEnvironment).texture
    pmremGenerator.dispose()
    roomEnvironment.dispose()

    // 灯光组
    this.setupLights()

    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')

    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(dracoLoader)
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 10, 7);
    this.scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, 0, -5);
    this.scene.add(fillLight);
    const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
    topLight.position.set(0, 10, 0);
    this.scene.add(topLight);
  }

  loadModel(url: string): Promise<THREE.Object3D> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, (gltf) => resolve(gltf.scene as THREE.Object3D), undefined, reject);
    });
  }

  /**
   * 加载完成后的公共渲染逻辑：入场景 → 相机自适应 → 渲染 → 导出 PNG。
   * 无论成功与否，finally 都会移除模型、释放显存并回收所有 objectURL。
   * @param loadModel 各格式各自的加载逻辑，返回待渲染的 Object3D
   * @param urls 需要在结束时 revoke 的 objectURL 列表
   */
  private async renderToBlob(
    loadModel: () => Promise<THREE.Object3D>,
    urls: string[],
  ): Promise<Blob | null> {
    let model: THREE.Object3D | null = null
    try {
      model = await loadModel()
      this.scene.add(model)
      this.fitCameraToObject(model)
      this.renderer.render(this.scene, this.camera)
      return await new Promise((resolve) => {
        this.renderer.domElement.toBlob((blob) => resolve(blob), 'image/png', 0.85)
      })
    } catch (error) {
      console.error('生成缩略图失败:', error)
      return null
    } finally {
      // 深度清理资源
      if (model) {
        this.scene.remove(model)
        this.cleanupModel(model) // 彻底释放显存
      }
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }

  /** GLTF / GLB 缩略图 */
  async generate(file: File): Promise<Blob | null> {
    const url = URL.createObjectURL(file)
    return this.renderToBlob(() => this.loadModel(url), [url])
  }

  /**
   * OBJ（可选 MTL + 贴图）缩略图。
   *
   * mtlFile 应当是 OBJ 里 `mtllib` 真正声明的那个——按"去掉扩展名后同名"去猜会
   * 出错，现实里 `Foo Bar 2.obj` 完全可能声明 `mtllib foo bar 2.mtl`。
   *
   * textureFiles 是 MTL 里 `map_*` 引用的贴图。不传的话贴图一定加载不出来：
   * MTL 是通过 `blob:` URL 加载的，里面的相对路径没有可用的 base URL 去解析，
   * 请求会直接失败。所以这里用 LoadingManager 的 URL 改写把"贴图文件名"映射到
   * 各自的 blob URL。
   */
  async generateWithObj(objFile: File, mtlFile: File | null, textureFiles: File[] = []): Promise<Blob | null> {
    const url = URL.createObjectURL(objFile)
    const urls = [url]

    // 贴图名 → blob URL。大小写不敏感，与依赖扫描侧保持一致
    const textureUrls = new Map<string, string>()
    for (const file of textureFiles) {
      const blobUrl = URL.createObjectURL(file)
      urls.push(blobUrl)
      textureUrls.set(file.name.toLowerCase(), blobUrl)
    }

    const manager = new THREE.LoadingManager()
    manager.setURLModifier((requested) => {
      // data: 已经自包含，而且 payload 可能很长，不必解析
      if (requested.startsWith('data:')) return requested

      // 注意不能因为 requested 是 blob: 就跳过：MTLLoader 会把贴图相对路径拼到
      // MTL 自己的 blob base 后面，得到 "blob:http://host/wood.png" 这种四不像，
      // 正是这里要改写的目标。只按文件名匹配，命中就替换、没命中就原样放过
      // （我们自己的 blob URL 末段是 uuid，不会误命中）
      const name = requested.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
      return textureUrls.get(name) ?? requested
    })

    return this.renderToBlob(() => {
      if (mtlFile) {
        const mtlUrl = URL.createObjectURL(mtlFile)
        urls.push(mtlUrl)
        return new Promise<THREE.Object3D>((resolve, reject) => {
          const mtlLoader = new MTLLoader(manager)
          mtlLoader.load(mtlUrl, (materials) => {
            materials.preload()
            const objLoader = new OBJLoader(manager)
            objLoader.setMaterials(materials)
            objLoader.load(url, resolve, undefined, reject)
          }, undefined, reject)
        })
      }
      return new Promise<THREE.Object3D>((resolve, reject) => {
        new OBJLoader(manager).load(url, resolve, undefined, reject)
      })
    }, urls)
  }

  /** FBX 缩略图 */
  async generateWithFbx(file: File): Promise<Blob | null> {
    const url = URL.createObjectURL(file)
    return this.renderToBlob(
      () => new Promise<THREE.Object3D>((resolve, reject) => {
        // FBXLoader 回调直接返回 Group，无需取 .scene
        new FBXLoader().load(url, resolve, undefined, reject)
      }),
      [url],
    )
  }

  /**
   * 根据物体大小调整相机位置
   * @param object 
   */
  fitCameraToObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    // 把中心移到原点（不依赖初始 position）
    object.position.sub(center)

    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = this.camera.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)))
    cameraZ *= 1.5

    const direction = new THREE.Vector3(1, 1, 1).normalize()
    this.camera.position.copy(direction.multiplyScalar(cameraZ))
    this.camera.lookAt(0, 0, 0)

    // 按模型尺寸更新 near/far，避免被裁剪
    this.camera.near = Math.max(cameraZ / 1000, 0.01)
    this.camera.far = cameraZ * 1000
    // 更新投影矩阵
    this.camera.updateProjectionMatrix()
  }

  // 直接根据这个类，来创建查看场景
  async showDialogScene(container: HTMLElement, url: string) {
    if(!url.startsWith('http')){
      url = 'https://' + url
    }

    const model = await this.gltfLoader.loadAsync(url)
    console.log("load-model", model)
    this.scene.add(model.scene)
    this.renderer.render(this.scene, this.camera)
    container?.append(this.renderer.domElement)
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.camera.aspect = container.clientWidth/ container.clientHeight
    // this.camera.position.set(10, 10, 10)
    this.fitCameraToObject(model.scene)

    const orbitControl = new OrbitControls(this.camera, this.renderer.domElement)
    this.displayLoop(orbitControl)
    window.addEventListener('resize', () => {
      setResizer(this.camera, this.renderer, container)
    })
    return model.scene
  }

  displayLoop(orbitControl: OrbitControls) {
    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera)
      orbitControl.update()
    })
  }

  cleanDisplay(model: THREE.Object3D) {
    this.scene.remove(model)
    this.cleanupModel(model)
    this.renderer.setAnimationLoop(null)
  }

  cleanupModel(model: THREE.Object3D) {
    console.log("清理", model)
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            if (material instanceof THREE.Material) {
              this.disposeMaterial(material)
            }
          })
        } else {
          this.disposeMaterial(child.material)
        }
        child.material = null
      }
    })
  }

  disposeMaterial(material: THREE.Material) {
    material.dispose?.()
    // 清理材质中的纹理
    for (const key of Object.keys(material)) {
      const value = material[key as keyof typeof material];
      if (value && typeof value === 'object' && 'minFilter' in value) {
        value.dispose?.(); // 这是一个 Texture
      }
    }
  }

  dispose() {
    this.renderer.dispose();
    if (this.scene.environment) this.scene.environment.dispose();
    // 如果不再需要 GLTFLoader 也可以把 Draco 实例 dispose 掉
    this.gltfLoader.dracoLoader?.dispose();
  }
}