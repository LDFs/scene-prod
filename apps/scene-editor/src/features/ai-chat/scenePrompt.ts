import * as THREE from 'three'

type SceneObjectSummary = {
  name: string
  type: string
  position: string
  size: string
  // 以下字段仅在非默认时才有值，减少 prompt 体积
  rotation?: string
  scale?: string
  color?: string
  hidden?: boolean
}

const fmt = (n: number) => parseFloat(n.toFixed(2)).toString()
const fmtVec = (x: number, y: number, z: number) => `(${fmt(x)},${fmt(y)},${fmt(z)})`

function summarizeObject(obj: THREE.Object3D): SceneObjectSummary {
  const p = obj.position
  const r = obj.rotation
  const s = obj.scale

  let type = 'unknown'
  let color: string | undefined

  if (obj instanceof THREE.Mesh) {
    const geo = obj.geometry
    if (geo instanceof THREE.BoxGeometry) type = 'box'
    else if (geo instanceof THREE.SphereGeometry) type = 'sphere'
    else type = 'mesh'

    if (obj.material instanceof THREE.MeshStandardMaterial) {
      color = `#${obj.material.color.getHexString()}`
    }
  } else if (obj.userData?.modelType === 'GLTF') {
    type = 'gltf'
  } else if (obj instanceof THREE.Group) {
    type = 'group'
  }

  const box = new THREE.Box3().setFromObject(obj)
  const size = new THREE.Vector3()
  box.getSize(size)

  const isDefault = (x: number, y: number, z: number, d: number) => x === d && y === d && z === d

  return {
    name: obj.name || obj.uuid,
    type,
    position: fmtVec(p.x, p.y, p.z),
    size: fmtVec(size.x, size.y, size.z),
    // 旋转/缩放为默认值时省略；缩放默认 1，旋转默认 0
    rotation: isDefault(r.x, r.y, r.z, 0) ? undefined : fmtVec(r.x, r.y, r.z),
    scale: isDefault(s.x, s.y, s.z, 1) ? undefined : fmtVec(s.x, s.y, s.z),
    color,
    hidden: obj.visible ? undefined : true,
  }
}

function renderObjectList(objects: THREE.Object3D[]): string {
  if (objects.length === 0) return '（场景为空）'
  // 表头只出现一次，逐行紧凑输出；position/size 为世界坐标下的中心与包围盒尺寸
  const header = '格式: 序号. "名称" | 类型 | 位置 | 尺寸 [| 旋转 | 缩放 | 颜色 | 隐藏]（旋转/缩放为默认值时省略）'
  const lines = objects.map((obj, i) => {
    const s = summarizeObject(obj)
    const parts = [`"${s.name}"`, s.type, s.position, s.size]
    if (s.rotation) parts.push(`旋转${s.rotation}`)
    if (s.scale) parts.push(`缩放${s.scale}`)
    if (s.color) parts.push(s.color)
    if (s.hidden) parts.push('隐藏')
    return `  ${i + 1}. ${parts.join(' | ')}`
  })
  return `${header}\n${lines.join('\n')}`
}

type LibraryModelSummary = {
  name: string
  originalName?: string
}

function renderModelLibrary(models: LibraryModelSummary[]): string {
  if (models.length === 0) return '（暂无可用模型）'
  return models
    .map((m, i) => {
      const desc = m.originalName && m.originalName !== m.name ? `（${m.originalName}）` : ''
      return `  ${i + 1}. "${m.name}"${desc}`
    })
    .join('\n')
}

export function buildSceneSystemPrompt(
  objects: THREE.Object3D[],
  libraryModels: LibraryModelSummary[] = [],
): string {
  return `你是一个三维场景编辑器的 AI 助手。用户用自然语言描述对场景的修改需求，你需要将其转化为具体的执行指令。

【重要】你必须严格返回如下 JSON 格式的字符串，不要输出任何额外文字和字符：
{"explanation":"用中文描述你做了什么","commands":[...]}

【当前场景中的物体】
${renderObjectList(objects)}

【可用模型库】
${renderModelLibrary(libraryModels)}

【可用命令类型】

1. create — 新建基础几何体
{"commandType":"create","objectType":"box"|"sphere","name":"物体名称","position":{"x":0,"y":0,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1},"color":"#ffffff","roughness":0.8,"metalness":0,"opacity":1,"allowOverlap":false}
  可选：box 额外字段 width/height/depth；sphere 额外字段 radius
  allowOverlap：默认 false；用户明确表示允许重叠时设为 true，系统将跳过自动位置修正

2. delete — 删除物体（name 必须是场景中已有名称）
{"commandType":"delete","name":"物体名称"}

3. transform — 修改位置/旋转/缩放，只填需要改的字段（绝对值，旋转单位为弧度）
{"commandType":"transform","name":"物体名称","position":{"x":0,"y":0,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}}

4. modify_material — 修改材质，只填需要改的字段
{"commandType":"modify_material","name":"物体名称","color":"#ff0000","roughness":0.5,"metalness":0.8,"opacity":1,"emissiveColor":"#000000","emissiveIntensity":0,"wireframe":false,"flatShading":false,"transparent":false}

5. modify_property — 修改名称或显隐
{"commandType":"modify_property","name":"当前名称","newName":"新名称","visible":true}

6. add_model — 从【可用模型库】中取出已有模型加入场景
{"commandType":"add_model","modelName":"库中模型名称","name":"加入场景后的名称","position":{"x":0,"y":0,"z":0},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1},"allowOverlap":false}
  modelName 必须是上方【可用模型库】清单中列出的名称
  name 可选，缺省使用 modelName；scale 为相对倍数（作用在模型尺寸归一化之后），缺省为 1
  position/rotation 不填则放在默认位置

【规则】
- commands 按顺序执行，可包含多条
- delete / transform / modify_material / modify_property 的 name 必须使用上方列表中的已有名称
- 当用户想加入"库中已有的模型"（如椅子、汽车等具体物体）时，使用 add_model，且 modelName 必须取自【可用模型库】清单；不要为这种需求用 create 凭空生成几何体
- 若用户想要的模型不在【可用模型库】清单中，不要臆造 modelName，应在 explanation 中说明库中没有该模型，commands 返回空数组
- create 仅用于创建 box/sphere 这类基础几何体
- "右移一点"等相对位移，请在原坐标基础上加偏移量（一点 ≈ 1 单位）
- 新建物体时，除非用户明确说明允许物体重叠，否则新物体的其包围盒不得与现有物体的包围盒重叠。如果用户给出的是具体的坐标且这个坐标会与其他物体重叠时，询问用户是否允许重叠。
- 列表中每个物体给出了中心位置与包围盒尺寸，其包围盒范围为 位置 ± 尺寸/2，请据此选择合适的位置避免重叠。
- explanation 只用一句字符串来描述你创建/修改了什么（颜色、形状、位置数值等），不要对重叠、碰撞、空间关系做任何判断或承诺，系统会自动处理
- 如果用户意图不涉及场景操作，commands 返回空数组，explanation 正常回答`
}