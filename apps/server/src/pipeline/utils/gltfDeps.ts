import fs from 'fs'
import path from 'path'

/**
 * .gltf 用相对 uri 引用 .bin 和贴图。这些依赖不在时，读取会失败在很靠后的
 * 环节（Draco 压缩、甚至前端加载场景时），报错离原因很远。
 *
 * 这里提供前置检查，让"资源不全"在入口就被判定出来。
 */

/** data: / http(s): / blob: 开头的 uri 是自包含或远程的，不需要随包提供 */
function isExternalFileUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0) return false
  return !/^(data:|https?:|blob:|\/\/)/i.test(uri)
}

function decode(uri: string): string {
  try {
    return decodeURIComponent(uri)
  } catch {
    return uri
  }
}

/**
 * 取出 glTF JSON 中指向外部文件的 uri（buffers 的几何数据 + images 的贴图）。
 * 已去重。
 */
export function collectExternalUris(gltfJson: any): string[] {
  const uris = [...(gltfJson?.buffers ?? []), ...(gltfJson?.images ?? [])]
    .map((entry: any) => entry?.uri)
    .filter(isExternalFileUri)
    .map((uri: string) => decode(uri).replace(/\\/g, '/'))
  return Array.from(new Set(uris))
}

/** 解析 .gltf 文本，失败时抛出可读错误 */
export function parseGltf(text: string, label = 'glTF'): any {
  try {
    return JSON.parse(text)
  } catch (error: any) {
    throw new Error(`${label} 不是有效的 glTF JSON: ${error?.message ?? error}`)
  }
}

/**
 * 检查磁盘上的 .gltf，返回其中找不到对应文件的依赖 uri。
 * 非 .gltf（.glb 自包含）直接返回空数组。
 */
export function findMissingGltfDeps(gltfPath: string): string[] {
  if (path.extname(gltfPath).toLowerCase() !== '.gltf') return []

  const json = parseGltf(fs.readFileSync(gltfPath, 'utf-8'), path.basename(gltfPath))
  const baseDir = path.dirname(gltfPath)

  return collectExternalUris(json).filter((uri) => !fs.existsSync(path.resolve(baseDir, uri)))
}
