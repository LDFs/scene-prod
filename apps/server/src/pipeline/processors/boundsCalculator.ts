import { ProcessAssetType } from '../type'
import { createNodeIO } from '../utils/ioUtil'

export async function calculateBounds(context: ProcessAssetType) {
  const io = await createNodeIO()

  try {
    const document = await io.read(context.gltfPath)
    const root = document.getRoot()

    // 初始化边界值
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity

    // 统计信息
    let totalTriangles = 0
    let totalVertices = 0
    const materialCount = root.listMaterials().length
    const textureCount = root.listTextures().length

    // 遍历所有 mesh
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const posAccessor = prim.getAttribute('POSITION')
        if (!posAccessor) continue
        const positions = posAccessor.getArray()
        totalVertices += positions.length / 3

        // 计算三角形面数
        const indices = prim.getIndices()
        if (indices) {
          totalTriangles += indices.getCount() / 3
        } else {
          totalTriangles += positions.length / 9
        }

        // 计算边界
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i]
          const y = positions[i + 1]
          const z = positions[i + 2]

          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
          minZ = Math.min(minZ, z)
          maxZ = Math.max(maxZ, z)
        }
      }
    }

    // 空模型
    if (minX === Infinity) {
      minX = minY = minZ = 0
      maxX = maxY = maxZ = 0
    }

    // 包围球
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    }
    const radius = Math.sqrt(Math.pow(maxX - center.x, 2) + Math.pow(maxY - center.y, 2) + Math.pow(maxZ - center.z, 2))

    // 各轴尺寸与最长边（文件原始单位，供后续尺寸归一化使用）
    const dimensions = {
      x: maxX - minX,
      y: maxY - minY,
      z: maxZ - minZ,
    }
    const longestEdge = Math.max(dimensions.x, dimensions.y, dimensions.z)

    const bounds = {
      box: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
      },
      sphere: {
        center,
        radius,
      },
      dimensions,
      longestEdge,
    }

    const stats = {
      triangleCount: Math.floor(totalTriangles),
      vertexCount: totalVertices,
      materialCount,
      textureCount,
    }

    console.log(
      `[BoundsCalculator] 边界盒: [${minX.toFixed(2)}, ${minY.toFixed(2)}, ${minZ.toFixed(2)}] ~ [${maxX.toFixed(
        2,
      )}, ${maxY.toFixed(2)}, ${maxZ.toFixed(2)}]`,
    )
    console.log(
      `[BoundsCalculator] 统计: ${stats.triangleCount} 三角面, ${stats.vertexCount} 顶点, ${stats.materialCount} 材质, ${stats.textureCount} 纹理`,
    )
    console.log(
      `[BoundsCalculator] 尺寸: ${dimensions.x.toFixed(3)} × ${dimensions.y.toFixed(3)} × ${dimensions.z.toFixed(
        3,
      )}, 最长边 ${longestEdge.toFixed(3)}`,
    )

    return { bounds, stats }
  } catch (error: any) {
    console.error('[BoundsCalculator] 计算失败:', error.message)
    return {
      bounds: null,
      stats: null,
    }
  }
}
