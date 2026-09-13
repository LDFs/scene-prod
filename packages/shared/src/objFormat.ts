/**
 * OBJ / MTL 的文本解析。
 *
 * OBJ 是多文件资产：`.obj` 用 `mtllib` 声明材质库，`.mtl` 再用 `map_*` 声明贴图。
 * "这个 obj 用的是哪个 mtl" 的唯一可靠答案就是 `mtllib`——按同名去猜会出错，
 * 现实里 `Foo Bar 2.obj` 完全可能声明 `mtllib foo bar 2.mtl`（大小写不一致）。
 *
 * 这里只做纯文本解析，不碰文件系统，因此服务端（pipeline 前置检查）和
 * 前端（多选打包）能共用同一套实现，避免两侧判断出现分歧。
 */

/** MTL 里代表贴图的指令。小写比较 */
const TEXTURE_DIRECTIVES = [
  'map_kd', // 漫反射
  'map_ka', // 环境
  'map_ks', // 镜面
  'map_ns', // 镜面指数
  'map_d', // 透明度
  'map_bump',
  'bump',
  'disp', // 位移
  'decal',
  'refl', // 反射
  'norm', // 法线 (PBR 扩展)
  'map_pr', // 粗糙度 (PBR 扩展)
  'map_pm', // 金属度 (PBR 扩展)
  'map_ke', // 自发光 (PBR 扩展)
]

/**
 * 带固定参数个数的选项 flag。
 * 例：`map_Bump -bm 0.2 bump.png`、`refl -type sphere chrome.png`
 */
const FLAGS_WITH_ONE_ARG = ['blendu', 'blendv', 'clamp', 'bm', 'boost', 'texres', 'imfchan', 'type']
const FLAGS_WITH_TWO_ARGS = ['mm']
/** `-o` / `-s` / `-t` 的参数是 1~3 个数字，个数不固定 */
const FLAGS_WITH_NUMERIC_ARGS = ['o', 's', 't']

/** 统一分隔符、去掉开头的 "./"，便于跨平台比较 */
export function normalizeObjPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * 从 OBJ 文本里取出 `mtllib` 声明的材质库文件名。
 *
 * 分词方式对齐 obj2gltf 的 getMtlPaths：按空格切分后在以 `.mtl` 结尾的 token 处
 * 聚合成一项。这样 `mtllib my material file.mtl` 这种**带空格的文件名**、以及
 * `mtllib a.mtl b.mtl` 这种**一行多个**都能正确还原。多条 mtllib 行累加。
 *
 * 已去重（保持首次出现的顺序）。
 */
export function parseMtllibNames(objText: string): string[] {
  const names: string[] = []

  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!/^mtllib\s/i.test(line)) continue

    // 去掉 mtllib 关键字，再剥掉整体包裹的双引号
    const value = line.slice(6).trim().replace(/^"(.+)"$/, '$1')
    const tokens = value.split(/\s+/)

    let start = 0
    for (let i = 0; i < tokens.length; i++) {
      // 大小写不敏感：obj2gltf 自身只认小写 ".mtl"，但我们宁可多识别出来并给出提示，
      // 也不要把一个写成 .MTL 的依赖当成不存在
      if (!/\.mtl$/i.test(tokens[i])) continue
      names.push(normalizeObjPath(tokens.slice(start, i + 1).join(' ')))
      start = i + 1
    }
  }

  return dedupe(names)
}

/**
 * 从 MTL 文本里取出贴图文件名。
 *
 * 贴图指令可以带一串选项 flag（`map_Kd -s 1 1 1 -o 0 0 0 tex.png`），所以不能
 * 简单取最后一个 token——文件名本身可能含空格。这里先按已知 flag 及其参数个数
 * 剥除选项，剩下的整段就是文件名。
 *
 * 已去重（保持首次出现的顺序）。
 */
export function parseMtlTextureRefs(mtlText: string): string[] {
  const refs: string[] = []

  for (const rawLine of mtlText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const spaceIdx = line.search(/\s/)
    if (spaceIdx === -1) continue

    const directive = line.slice(0, spaceIdx).toLowerCase()
    if (!TEXTURE_DIRECTIVES.includes(directive)) continue

    const fileName = stripTextureFlags(line.slice(spaceIdx + 1).trim())
    if (fileName) refs.push(normalizeObjPath(fileName))
  }

  return dedupe(refs)
}

/**
 * 剥掉贴图指令上的选项 flag，返回文件名部分。
 *
 * 文件名可能被双引号包裹，也可能含空格，所以逐 token 前进、只消费认得的 flag，
 * 遇到第一个不是 flag 的 token 就把剩余整段当作文件名。
 */
function stripTextureFlags(value: string): string {
  // 整体被引号包裹时直接取内容（此时不会再有 flag）
  const quoted = value.match(/^"(.+)"$/)
  if (quoted) return quoted[1]

  const tokens = value.split(/\s+/)
  let i = 0

  while (i < tokens.length && tokens[i].startsWith('-')) {
    const flag = tokens[i].slice(1).toLowerCase()

    if (FLAGS_WITH_ONE_ARG.includes(flag)) {
      i += 2
    } else if (FLAGS_WITH_TWO_ARGS.includes(flag)) {
      i += 3
    } else if (FLAGS_WITH_NUMERIC_ARGS.includes(flag)) {
      i += 1
      // 贪婪吃掉紧随的 1~3 个数字。要求 token 整体是数字，否则 "1.png" 这类
      // 文件名会被误当成参数吃掉
      let consumed = 0
      while (i < tokens.length && consumed < 3 && isNumericToken(tokens[i])) {
        i += 1
        consumed += 1
      }
    } else {
      // 未知 flag：只跳过它自己，宁可把可能的参数留给文件名，也不要吃掉真文件名
      i += 1
    }
  }

  const rest = tokens.slice(i).join(' ').trim()
  // 剩余部分也可能带引号
  return rest.replace(/^"(.+)"$/, '$1')
}

function isNumericToken(token: string): boolean {
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(token)
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

/**
 * OBJ 顶点数据里的非有限值（`nan` / `-nan` / `inf`）。
 *
 * 这是真实存在的导出缺陷（如 Kaydara FBX 转 OBJ），而 obj2gltf 的 `vt` 正则
 * 字符类是 `[\d|\.|\+|\-|e|E]`，匹配不到 `nan`，于是这些行既不算 UV、也不算
 * 顶点/法线，被**静默丢弃**。`globalUvs` 因此少了条目，其后所有 UV 索引整体
 * 错位，最终在某个 face 上抛出 "UV index N is out of bounds"——报错点离真正的
 * 原因非常远。
 *
 * 把非有限分量改写为 0 能保住索引对齐（真正致命的是错位，而不是这几个本就
 * 无意义的 UV 值）。
 *
 * @returns 修复后的行；无需修复时返回 null
 */
export function repairObjVertexLine(line: string): string | null {
  // 只有 v / vt / vn 参与索引对齐
  if (!/^(v|vt|vn)\s/.test(line)) return null

  const tokens = line.split(/\s+/)
  let dirty = false

  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === '') continue
    if (Number.isFinite(Number.parseFloat(tokens[i]))) continue
    tokens[i] = '0.000000'
    dirty = true
  }

  return dirty ? tokens.join(' ') : null
}
