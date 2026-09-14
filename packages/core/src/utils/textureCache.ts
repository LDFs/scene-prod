import * as THREE from 'three'

/**
 * 按 url 加载贴图，并在进程内复用。
 *
 * 材质面板拖拽换图和场景反序列化两条路径都要把资源 url 变成 Texture，
 * 统一走这里，既省掉重复请求，也保证两边打的标记一致
 * （userData.assetUrl 是持久化和面板缩略图共同依赖的）。
 */

const loader = new THREE.TextureLoader()

/**
 * 缓存 key 必须带上 colorSpace：同一张图可能既当 map（srgb）又当 normalMap（无色彩空间），
 * 只用 url 做 key 会让两个槽位共用同一个实例，后设置的那个把前一个的色彩空间改掉。
 */
const cache = new Map<string, Promise<THREE.Texture>>()

/** 从 url 里取一个可读的名字，作为 texture.name 显示在面板上 */
function nameFromUrl(url: string): string {
  try {
    const path = url.startsWith('http') ? new URL(url).pathname : url
    return decodeURIComponent(path.split('/').pop() || url)
  } catch {
    return url
  }
}

/**
 * 加载贴图资源。
 * @param url 贴图地址
 * @param colorSpace 颜色贴图传 THREE.SRGBColorSpace，法线/粗糙度等数据贴图传 THREE.NoColorSpace
 * @returns 加载完成的 Texture（同一 url + colorSpace 返回同一个实例）
 *
 * 注意：返回的实例是共享的，调用方替换掉旧贴图后不要 dispose——
 * 撤销栈和别的材质可能还引用着它。
 */
export function loadAssetTexture(
  url: string,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): Promise<THREE.Texture> {
  const key = `${url}|${colorSpace}`
  const cached = cache.get(key)
  if (cached) return cached

  const task = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        // 不同种类的贴图区分 colorSpace
        texture.colorSpace = colorSpace
        texture.name = nameFromUrl(url)
        // 持久化时靠它把贴图还原成 url；内嵌贴图没有这个标记
        texture.userData.assetUrl = url
        resolve(texture)
      },
      undefined,
      (error) => {
        console.error('加载贴图失败:', url, error)
        reject(new Error(`加载贴图失败: ${url}`))
      },
    )
  })

  // 失败的 Promise 不能留在缓存里，否则一次网络抖动会把错误永久缓存住
  task.catch(() => cache.delete(key))

  cache.set(key, task)
  return task
}
