import { flatten, prune, dedup, join } from '@gltf-transform/functions'
import { createNodeIO } from '../utils/ioUtil'
import { ProcessAssetType } from '../type'

/**
 * 优化场景图：压平冗余层级、去重、合并
 * 让可编辑的 mesh 尽量靠近根节点，减少下钻层数
 */
async function optimizeSceneGraph(context: ProcessAssetType) {
  const io = await createNodeIO()
  try {
    const document = await io.read(context.gltfPath)

    await document.transform(
      dedup(),     // 合并重复的 accessor / material / texture / mesh
      flatten(),   // 压平节点层级，把中间空壳层的 transform 烘焙下去（自动跳过 skin/animation）
      prune(),     // 清除压平后产生的无用节点 / 空材质等
      // join(),   // 可选：合并兼容的 mesh 以减少 draw call（会丢失单 mesh 粒度，慎用）
    )

    await io.write(context.gltfPath, document)
    console.log('[SceneGraph] 场景图优化完成')
  } catch (error: any) {
    console.error('[SceneGraph] 优化失败:', error.message)
    // 失败不阻断流程
  }
}

export { optimizeSceneGraph }
