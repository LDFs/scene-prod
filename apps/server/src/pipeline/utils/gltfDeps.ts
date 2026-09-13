import fs from 'fs'
import path from 'path'
import { collectGltfExternalRefs, stripGltfImages } from '@scene-prod/shared'

/**
 * .gltf 用相对 uri 引用 .bin 和贴图。这些依赖不在时，读取会失败在很靠后的
 * 环节（Draco 压缩、甚至前端加载场景时），报错离原因很远。
 *
 * 这里提供前置检查，让"资源不全"在入口就被判定出来。**但缺失的严重程度分两档**，
 * 与 objDeps 的取舍一致：
 *   - 缺 buffers（.bin）→ 没有几何，产物是个空模型，判失败；
 *   - 缺 images（贴图）→ 只是没纹理，就地降级成"没填这个槽位"，只回报警告。
 *
 * 前端多选打包时也做同一套判定（见 web/src/utils/modelBundle.ts），两侧共用
 * packages/shared 里的实现。这里是直传 .zip 那条路径的兜底——那种包没经过前端
 * 扫描，缺依赖只能在这里发现。
 */

/** 解析 .gltf 文本，失败时抛出可读错误 */
export function parseGltf(text: string, label = 'glTF'): any {
  try {
    return JSON.parse(text)
  } catch (error: any) {
    throw new Error(`${label} 不是有效的 glTF JSON: ${error?.message ?? error}`)
  }
}

/**
 * 取出 glTF JSON 中指向外部文件的 uri（buffers 的几何数据 + images 的贴图）。
 * 已去重。
 */
export function collectExternalUris(gltfJson: any): string[] {
  return collectGltfExternalRefs(gltfJson).map((ref) => ref.uri)
}

export interface GltfDepResolution {
  /** 磁盘上找不到的几何数据 uri。非空即致命 */
  missingBuffers: string[]
  /** 磁盘上找不到的贴图 uri。引用已被摘除，模型仍可用，只需回报警告 */
  droppedImages: string[]
}

/**
 * 检查磁盘上的 .gltf 的依赖，并**就地**把缺失的贴图降级掉。
 *
 * 就地改写是有意的：.gltf 走到这一步，后面的 sanitize / optimizeSceneGraph 本来
 * 也会把结果写回同一个路径（见 pipeline/index.ts），所以不必像 objRepair 那样
 * 另存副本再清理。几何数据就缺了的话整单会判失败，此时不动文件。
 *
 * 非 .gltf（.glb 自包含、.obj 走 objDeps）直接返回空结果。
 */
export function resolveGltfDeps(gltfPath: string): GltfDepResolution {
  const result: GltfDepResolution = { missingBuffers: [], droppedImages: [] }
  if (path.extname(gltfPath).toLowerCase() !== '.gltf') return result

  const json = parseGltf(fs.readFileSync(gltfPath, 'utf-8'), path.basename(gltfPath))
  const baseDir = path.dirname(gltfPath)
  const deadImages = new Set<number>()

  for (const ref of collectGltfExternalRefs(json)) {
    if (fs.existsSync(path.resolve(baseDir, ref.uri))) continue

    if (ref.kind === 'buffer') {
      result.missingBuffers.push(ref.uri)
    } else {
      result.droppedImages.push(ref.uri)
      ref.imageIndices.forEach((imageIndex) => deadImages.add(imageIndex))
    }
  }

  // 几何数据缺失 → 整单判失败，没必要再改文件
  if (result.missingBuffers.length > 0 || deadImages.size === 0) return result

  stripGltfImages(json, deadImages)
  fs.writeFileSync(gltfPath, JSON.stringify(json), 'utf-8')

  return result
}
