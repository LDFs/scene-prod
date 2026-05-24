// TODO: FPS / triangles / renderer.info 监控

import Stats from "three/examples/jsm/libs/stats.module.js";

type Position = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

export class StatsManager {
  private stats: Stats | null = null
  private container: HTMLElement
  private position: Position
  private enabled: boolean
  constructor(container: HTMLElement, position: Position = 'top-right', enabled: boolean = false) {
    this.container = container || document.body
    this.position = position
    this.enabled = enabled || false
  }

  enable() {
    if (this.enabled) return
    this.stats = new Stats()
    this.stats.showPanel(0)

    const dom = this.stats.dom
    dom.style.position = 'absolute'
    dom.style.zIndex = '100'
    dom.style.top = ''
    dom.style.bottom = ''
    dom.style.right = ''
    dom.style.left = ''

    switch (this.position) {
      case 'top-right':
        dom.style.top = '0'
        dom.style.right = '0'
        break
      case 'top-left':
        dom.style.top = '0'
        dom.style.left = '0'
        break
      case 'bottom-right':
        dom.style.bottom = '0'
        dom.style.right = '0'
        break
      case 'bottom-left':
        dom.style.bottom = '0'
        dom.style.left = '0'
        break
    }
    this.container.appendChild(dom)
    this.enabled = true
  }

  disable() {
    if (!this.enabled || !this.stats) return
    if (this.stats.dom && this.stats.dom.parentElement) {
      this.stats.dom.parentElement.removeChild(this.stats.dom)
    }
    this.stats = null
    this.enabled = false
  }

  toggle(show: boolean) {
    if (show) {
      this.enable()
    } else {
      this.disable()
    }
  }

  setPanel(panel: number) {
    if (!this.enabled || !this.stats) return
    this.stats.showPanel(panel)
  }

  update() {
    if (this.enabled && this.stats) this.stats.update()
  }

  begin() {
    if (this.enabled && this.stats) this.stats.begin()
  }

  end() {
    if (this.enabled && this.stats) this.stats.end()
  }

  isEnabled() {
    return this.enabled
  }

  setContainer(container: HTMLElement) {
    const wasEnabled = this.enabled;
    if (wasEnabled) {
      this.disable();
    }
    this.container = container;
    if (wasEnabled) {
      this.enable();
    }
  }
}
