/**
 * 尺寸归一化启发式。
 *
 * 目标:把不同单位/尺度的模型大致换算到米制,使桌子、椅子等放进同一场景时
 * 相对大小合理。注意——仅凭几何无法可靠判定模型"本该"多大(90 单位可能是
 * 90m 的楼,也可能是 90cm 的椅子),因此本函数只做保守猜测:
 *
 *   - 已在人类尺度带内或偏小:不动(偏小更可能是合理的小物件,贸然放大风险更大);
 *   - 偏大:几乎都是 cm/mm 单位被当作米,按公制因子缩小到目标带。
 *
 * inch/ft、以及"建筑被误缩"这类歧义情形,交由导入时的类别预设 / 手动输入覆盖
 * (source 置为 'category' / 'manual')。
 */

export type Sizing = {
  normalizeScale: number
  unitGuess: string
  source: 'heuristic' | 'manual' | 'category'
}

// 人类尺度目标带(米):最长边落在 [0.1, 10] 视为合理,几何中心约 1m
const TARGET_MAX = 10
const TARGET_CENTER = 1

// 偏大时考虑的公制单位换算因子(→ 米)
const DOWNSCALE_FACTORS: Array<{ unit: string; factor: number }> = [
  { unit: 'cm', factor: 0.01 },
  { unit: 'mm', factor: 0.001 },
]

/**
 * 根据最长边(文件原始单位)计算归一化缩放。
 * @param longestEdge bounds.longestEdge
 */
export function computeSizing(longestEdge: number): Sizing {
  // 退化:空模型 / 异常值 → 1:1 不动
  if (!Number.isFinite(longestEdge) || longestEdge <= 0) {
    return { normalizeScale: 1, unitGuess: 'unknown', source: 'heuristic' }
  }

  // 已在目标带内或偏小:保留原始尺寸(不冒险放大)
  if (longestEdge <= TARGET_MAX) {
    return { normalizeScale: 1, unitGuess: 'm', source: 'heuristic' }
  }

  // 偏大:选换算后(对数距离)最接近目标中心的公制因子
  let best = DOWNSCALE_FACTORS[0]
  let bestDist = Infinity
  for (const cand of DOWNSCALE_FACTORS) {
    const size = longestEdge * cand.factor
    const dist = Math.abs(Math.log(size) - Math.log(TARGET_CENTER))
    if (dist < bestDist) {
      bestDist = dist
      best = cand
    }
  }
  return { normalizeScale: best.factor, unitGuess: best.unit, source: 'heuristic' }
}
