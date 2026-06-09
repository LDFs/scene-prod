import * as THREE from 'three'

type SceneObjectSummary = {
  name: string
  type: string
  position: string
  rotation: string
  scale: string
  color?: string
  visible: boolean
  bbox: {
    min: string,
    max: string,
    size: string
  }
}

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

  const fmt = (n: number) => parseFloat(n.toFixed(3)).toString()
  const fmtVec = (x: number, y: number, z: number) => `(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`

  const box = new THREE.Box3().setFromObject(obj)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  return {
    name: obj.name || obj.uuid,
    type,
    position: fmtVec(p.x, p.y, p.z),
    rotation: fmtVec(r.x, r.y, r.z),
    scale: fmtVec(s.x, s.y, s.z),
    color,
    visible: obj.visible,
    bbox: {
      min: `(${fmt(box.min.x)}, ${fmt(box.min.y)}, ${fmt(box.min.z)})`,
      max: `(${fmt(box.max.x)}, ${fmt(box.max.y)}, ${fmt(box.max.z)})`,
      size: `(${fmt(size.x)}, ${fmt(size.y)}, ${fmt(size.z)})`,
    }
  }
}

function renderObjectList(objects: THREE.Object3D[]): string {
  if (objects.length === 0) return '（场景为空）'
  return objects.map((obj, i) => {
    const s = summarizeObject(obj)
    const colorPart = s.color ? `, 颜色: ${s.color}` : ''
    const visiblePart = s.visible ? '' : ', 隐藏'
    return `  ${i + 1}. 名称: "${s.name}", 类型: ${s.type}, 位置: ${s.position}, 旋转: ${s.rotation}, 缩放: ${s.scale}${colorPart}${visiblePart}, 范围: ${s.bbox}`
  }).join('\n')
}

export function buildSceneSystemPrompt(objects: THREE.Object3D[]): string {
  return `你是一个三维场景编辑器的 AI 助手。用户用自然语言描述对场景的修改需求，你需要将其转化为具体的执行指令。

【重要】你必须严格返回如下 JSON 格式，不要输出任何额外文字：
{"explanation":"用中文描述你做了什么","commands":[...]}

【当前场景中的物体】
${renderObjectList(objects)}

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

【规则】
- commands 按顺序执行，可包含多条
- delete / transform / modify_material / modify_property 的 name 必须使用上方列表中的已有名称
- "右移一点"等相对位移，请在原坐标基础上加偏移量（一点 ≈ 1 单位）
- 新建物体时，除非用户明确说明允许物体重叠，否则新物体的其包围盒不得与现有物体的包围盒重叠。如果用户给出的是具体的坐标且这个坐标会与其他物体重叠时，询问用户是否允许重叠。
- 现有物体的包围盒范围已在列表中提供，请据此选择合适的位置。
- explanation 只描述你创建/修改了什么（颜色、形状、位置数值等），不要对重叠、碰撞、空间关系做任何判断或承诺，系统会自动处理
- 如果用户意图不涉及场景操作，commands 返回空数组，explanation 正常回答`
}