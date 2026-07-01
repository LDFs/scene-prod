import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';


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

  /** OBJ（可选 MTL）缩略图 */
  async generateWithObj(objFile: File, mtlFile: File | null): Promise<Blob | null> {
    const url = URL.createObjectURL(objFile)
    const urls = [url]
    return this.renderToBlob(() => {
      if (mtlFile) {
        const mtlUrl = URL.createObjectURL(mtlFile)
        urls.push(mtlUrl)
        return new Promise<THREE.Object3D>((resolve, reject) => {
          const mtlLoader = new MTLLoader()
          mtlLoader.load(mtlUrl, (materials) => {
            materials.preload()
            const objLoader = new OBJLoader()
            objLoader.setMaterials(materials)
            objLoader.load(url, resolve, undefined, reject)
          }, undefined, reject)
        })
      }
      return new Promise<THREE.Object3D>((resolve, reject) => {
        new OBJLoader().load(url, resolve, undefined, reject)
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

    // 居中模型
    object.position.x += (object.position.x - center.x)
    object.position.y += (object.position.y - center.y)
    object.position.z += (object.position.z - center.z)

    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = this.camera.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)))
    cameraZ *= 1.5

    const direction = new THREE.Vector3(1, 1, 1).normalize()
    this.camera.position.copy(direction.multiplyScalar(cameraZ))
    this.camera.lookAt(0, 0, 0)

    // 更新投影矩阵
    this.camera.updateProjectionMatrix()
  }

  cleanupModel(model: THREE.Object3D) {
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