// TODO: 三角形统计管理器，统计场景中三角形的数量和渲染时间

import * as THREE from 'three'

export class TriangleStatsManager {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene
  private updateInterval: number | null = null
  private enabled: boolean = false
  private callback: Function|null = null

  private _cachedTotalTrangles: number = 0
  private _isDirty:boolean = false
  private _lastObjectCount: number = 0

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer
    this.scene = scene
  }

  /**
   * 获取实时渲染的三角形的数量，是经过 LOD、视锥剔除后的真实的渲染数量
   * @returns 渲染的三角形数量
   */
  getRenderedTriangles(): number{
    return this.renderer?.info?.render.triangles || 0
  }

  getTotalTriangles(): number{
    if(!this.scene) return 0

    const currentObjectCount = this._countObjects()
    if(currentObjectCount !== this._lastObjectCount) {
      this._lastObjectCount = currentObjectCount
      this._isDirty = true
    }

    // 如果场景中对象数量没有变化，则直接返回缓存的三角形数量
    if(!this._isDirty) {
      return this._cachedTotalTrangles
    }

    let total = 0
    this.scene.traverse((child) => {
      if(child instanceof THREE.Mesh && child.geometry){
        const geometry = child.geometry
        if(geometry.index) {
          // 索引几何体：三角形的数量 = 索引数量 / 3
          total += geometry.index.count / 3
        }else if(geometry.attributes && geometry.attributes.position) {
          // 非索引几何体：三角形的数量 = 顶点数量 / 3
          total += geometry.attributes.position.count / 3
        }
      }
    })
    this._cachedTotalTrangles = Math.floor(total)
    this._isDirty = false
    return this._cachedTotalTrangles
  }

  /**
   * 统计场景中Mesh对象的数量
   * @returns 场景中Mesh对象的数量
   */
  _countObjects(): number{
    let count = 0
    this.scene.traverse((child) => {
      if(child instanceof THREE.Mesh) {
        count++
      }
    })
    return count
  }

  makeDirty() {
    this._isDirty = true
  }

  getDrawCalls(): number {
    return this.renderer?.info?.render.calls || 0
  }

  getTextureCount(): number {
    return this.renderer?.info?.memory.textures || 0
  }

  getGeometryCount(): number {
    return this.renderer?.info?.memory.geometries || 0
  }

  getStats(): {
    renderedTriangles: number
    total: number
    drawCalls: number
    textureCount: number
    geometryCount: number
  } {
    return {
      renderedTriangles: this.getRenderedTriangles(),
      total: this.getTotalTriangles(),
      drawCalls: this.getDrawCalls(),
      textureCount: this.getTextureCount(),
      geometryCount: this.getGeometryCount()
    }
  }

  /**
   * 开启实时更新
   * @param callback 回调函数
   * @param interval 更新间隔时间
   */
  startLiveUpdate(callback: Function, interval=200) {
    if(this.updateInterval){
      this.stopLiveUpdate()
    }
    this.callback = callback
    this.enabled = true
    this.updateInterval = setInterval(() => {
      if(this.enabled && this.callback) {
        this.callback(this.getStats())
      }
    }, interval)
  }

  stopLiveUpdate() {
    if(this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    this.enabled = false
    this.callback = null
  }

  toggle(enable: boolean, callback: Function, interval=200) {
    if(enable) {
      this.startLiveUpdate(callback, interval)
    } else {
      this.stopLiveUpdate()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  dispose() {
    this.stopLiveUpdate()
    this.renderer = null
    this._cachedTotalTrangles = 0
    this._isDirty = true
  }

}