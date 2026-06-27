import { prune, dedup, transformMesh } from '@gltf-transform/functions'
import { Document, Node as GLTFNode, Scene } from '@gltf-transform/core'
import { createNodeIO } from '../utils/ioUtil'
import { ProcessAssetType } from '../type'

/** 4x4 单位矩阵 */
const IDENTITY: number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

/**
 * 把每个网格节点的「世界变换」烘焙进顶点数据,再把节点清零并提到 scene 下。
 *
 * 为什么不用官方 flatten:
 *   官方 flatten 走 clearNodeParent,做的是 `node.setMatrix(node.getWorldMatrix())`,
 *   即把累积的世界矩阵回写成节点的 TRS(平移 + 四元数旋转 + 缩放)。当祖先链里存在
 *   「非均匀缩放 + 旋转」时,世界矩阵会包含切变(shear),而 TRS 表示不了切变,
 *   分解时被丢弃 → 部件错位。
 *
 * 本实现把世界矩阵直接作用到顶点上。顶点是点集,任意仿射矩阵(含切变)作用其上
 * 都是精确的,因此相对位置不会丢失。
 *
 * 安全约束(与官方 flatten 对齐):
 *   - 跳过骨骼关节 / 被动画引用的节点及其后代,避免破坏蒙皮动画;
 *   - 子树中包含受保护节点的节点整棵保留(清零它会改变骨骼的世界变换);
 *   - 网格被多个节点共享(实例化)时,先克隆再烘焙,避免互相污染。
 */
function bakeFlatten(document: Document) {
  const root = document.getRoot()
  const logger = document.getLogger()

  // 1) 受保护集合:骨骼关节、被动画(非 weights)引用的节点,及其后代
  const joints = new Set<GLTFNode>()
  for (const skin of root.listSkins()) {
    for (const joint of skin.listJoints()) joints.add(joint)
  }
  const animated = new Set<GLTFNode>()
  for (const anim of root.listAnimations()) {
    for (const channel of anim.listChannels()) {
      const target = channel.getTargetNode()
      if (target && channel.getTargetPath() !== 'weights') animated.add(target)
    }
  }
  // scene.traverse 是自顶向下(父先于子),因此「继承自父」的传播是正确的
  const protectedSet = new Set<GLTFNode>()
  for (const scene of root.listScenes()) {
    scene.traverse((node) => {
      const parent = node.getParentNode()
      const inherited = parent !== null && protectedSet.has(parent)
      if (joints.has(node) || animated.has(node) || inherited) protectedSet.add(node)
    })
  }

  // 2) 标记「子树中是否包含受保护节点」——这类节点不可烘焙/清零
  const hasProtectedInSubtree = new Set<GLTFNode>()
  const markSubtree = (node: GLTFNode): boolean => {
    let flag = protectedSet.has(node)
    for (const child of node.listChildren()) {
      if (markSubtree(child)) flag = true
    }
    if (flag) hasProtectedInSubtree.add(node)
    return flag
  }
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) markSubtree(child)
  }

  // 3) 收集可烘焙节点 + 快照世界矩阵(必须在任何改动之前完成,否则后续清零会污染快照)
  const targets: Array<{ node: GLTFNode; scene: Scene; worldMatrix: number[] }> = []
  for (const scene of root.listScenes()) {
    scene.traverse((node) => {
      if (!node.getMesh()) return
      if (protectedSet.has(node)) return
      if (hasProtectedInSubtree.has(node)) return
      targets.push({ node, scene, worldMatrix: node.getWorldMatrix() as number[] })
    })
  }

  // 4) 烘焙:世界矩阵 -> 顶点;节点清零;提为 scene 直接子节点
  let baked = 0
  for (const { node, scene, worldMatrix } of targets) {
    let mesh = node.getMesh()
    if (!mesh) continue
    // 网格被多个节点共享(实例化)时先克隆,避免一次变换污染其他实例
    const referencingNodes = mesh.listParents().filter((p) => p instanceof GLTFNode)
    if (referencingNodes.length > 1) {
      mesh = mesh.clone()
      node.setMesh(mesh)
    }
    transformMesh(mesh, worldMatrix as any)
    node.setMatrix(IDENTITY as any)
    scene.addChild(node)
    baked++
  }

  logger.debug(`[bakeFlatten] 烘焙 ${baked} 个网格节点,保护 ${protectedSet.size} 个骨骼/动画节点`)
}

/**
 * 优化场景图:压平冗余层级(几何烘焙,切变安全)、清理、去重。
 * 让可编辑的 mesh 直接挂在 scene 下,减少下钻层数,且保持各部件相对位置精确。
 */
async function optimizeSceneGraph(context: ProcessAssetType) {
  const io = await createNodeIO()
  try {
    const document = await io.read(context.gltfPath)

    // 1) 几何烘焙式压平(替代官方 flatten,避免非均匀缩放导致的错位)
    bakeFlatten(document)

    // 2) 清理压平后残留的空节点 / 无用资源,再做去重
    //    dedup 放在压平之后:此时几何已带各自世界坐标,不会被错误合并;
    //    仍可去重相同的 material / texture / accessor。
    await document.transform(
      prune(),
      dedup(),
      // join(),  // 可选:合并兼容 mesh 降 draw call,会丢失单 mesh 粒度,与"逐部件编辑"冲突,默认关闭
    )

    await io.write(context.gltfPath, document)
    console.log('[SceneGraph] 场景图优化完成')
  } catch (error: any) {
    console.error('[SceneGraph] 优化失败:', error.message)
    // 失败不阻断流程
  }
}

export { optimizeSceneGraph }
