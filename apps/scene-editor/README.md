# scene-prod-editor

Scene Prod 的 3D 场景编辑器（Vue 3 + Vite + Three.js）。

## 启动

```bash
pnpm --filter scene-prod-editor dev
```

默认端口 `5273`，通过 `/api` 代理到 `http://localhost:3100`（scene-prod-server）。

## 目录

```
src/
├── main.ts
├── App.vue
├── layouts/           # 整体布局
├── features/
│   ├── asset-panel/   # 左：资产 / 场景树
│   ├── viewport/      # 中：3D Canvas
│   ├── inspector/     # 右：属性面板
│   └── toolbar/       # 顶：工具条
├── stores/            # Pinia：project / selection / history
├── commands/          # 撤销栈命令
└── services/          # API
```


## 用到的技术点
### DataTransfer API
在`Viewport.vue`和`LibraryPanel.vue`中，使用了 DataTransfer API 来传递模型 URL
过程：从`LibraryPanel.vue`中拖拽(`DragStart`)模型到`Viewport.vue`中(`Drop`)。
在拖拽模型到场景中时，将模型 URL 设置到 event.dataTransfer 中，在`Viewport.vue`的`onDrop`方法中，从 event.dataTransfer 中获取模型 URL，然后加载模型。
``` typescript
const onDragStart = (event: DragEvent, type: string, url: string='') => {
  event.dataTransfer?.setData('type', type);
  if (url) {
    event.dataTransfer?.setData('url', url);
  }
}

const onDrop = async (event: DragEvent) => {
  event.preventDefault()
  const type = event.dataTransfer?.getData('type')
  if (!type) return
  const url = event.dataTransfer?.getData('url')
  if (!url) return
  const model = await loadModel(url)
}
```
> 'url'是 DataTransfer API 中的保留格式名，它的格式需要为合法的绝对URI(以http:// 或 https:// 等开头)，否则浏览器会认为这不是合法的URI，会默认丢弃这个值
> 如果不想被默认丢弃，可以使用其他的格式名，如 'modelUrl'

### 请求静态资源
使用的是 fastify 框架
在 server 中注册
```typescript
import staticFiles from '@fastify/static'

await app.register(staticFiles, {
  root: path.join(__dirname, '..', 'uploads'),
  prefix: '/uploads/',
})
```
在应用中类似`http://localhost:3100/uploads/models/1778636295884-909471320.glb`的资源，会自动请求到 server 的`uploads`目录下的资源。

### 鼠标坐标转换
将鼠标在 canvas 上的像素位置转换为 Three.js 射线投射所需的坐标系, NDC 坐标，范围在[-1, 1] 之间。
```typescript
  const screenPos = new THREE.Vector2(
    (event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1,
  )
```

### 放置模型
three.js 的三维坐标，y 轴向上，z轴朝外, x 轴向右。
获取放置模型的位置，先计算 NDC 坐标，根据 相机-NDC坐标 计算出射线
1. 使用`raycaster.setFromCamera(screenPosition, camera)`来更新射线，`raycaster.intersectObjects(targets, resursive)`来获取射线与哪些物体相交，第一个物体为指向的坐标
2. 射线与地面（y 为0）的交点，先更新射线，使用`raycaster.ray.intersectPlane(plane, target)`来计算交点，结果存入 target 中，plane 为`plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)`
3. 将交点设置为模型的位置


### 模型修改的同步
模型及模型内部的物体被修改之后，需要同步到数据库中，以便加载时显示。主要通过`PersistenceManager`来实现。
显示时，将数据库中的数据反序列化(`deserializeObject`)成三维模型，并添加到场景中。反序列化时，就会将数据中的修改信息应用到模型上。对于模型内部的模型，修改信息中会使用每一层的`name`作为路径，来查找对象，比如`rootName/name/targetName`，就会先查找`rootName`，再查找`name`，最后查找`targetName`。
保存时，将模型的信息序列化(`serializeObject`)成数据库中的数据，并保存到数据库中。提取被标记修改了的属性。
在修改了模型时，修改模型的位置、旋转、缩放属性，通过`TransformController`来进行，并标记哪个属性被修改了。修改模型的材质属性，通过`MaterialPanel.vue`来进行，并标记`materialModified`为true，在序列化时会记录被修改的信息。


### 修改指令
修改模型时通过指令(`HistoryCommand`)记录修改的信息，方便回退
修改模型材质，通过`MaterialObjectCommand`来记录修改的信息。

- 修改模型名称后，场景树同步显示，通过 treeVersion 来触发重新渲染。`<TreeNode v-for="obj in sceneObjects" :key="obj.id + '-' + treeVersion" ... />`
`key` 变化后，会重新渲染，读取新的值


TODO. 
1. 正常来说，在编辑器里面的所有修改，都可以通过回退来恢复。    √
2. 使用快捷键，比如`Ctrl+Z`来撤销，`Ctrl+Y`来重做，`Strl+S`保存等    √
3. 在面板上修改模型数据时，在修改的同时就显示在场景中，而不是等到修改完成之后再显示。    √
- 三视图    √
4. 预览场景
5. 三维应用中最主要的问题是性能问题，在这个项目中能有什么优化？

- 当前项目要怎么定位？
这种 Web 三维编辑器对于blender这种编辑器的主要优势，是可以多人协作编辑，并且可以实时预览，分享链接，使用者广，使用方便，不需要安装软件，只需要浏览器就可以使用。
如果按"代码架构 + 商业可行性"双维度看，最值得仿照路线的三家是：

1. PlayCanvas（被 Snap 收购）
路线：Web 引擎 + Web 编辑器 + 一键发布到链接
对应你的 SceneManager / ViewManager / PersistenceManager 完全一致
适合做"通用工具型"路线

1.1 spline.design

2. 图扑 Hightopo / 优锘 ThingJS（国内）
路线：垂直工业可视化 + 自定义编辑器 + SDK 嵌入
国内 To B 跑通的真实样本，不烧钱也能赚钱
适合做"垂直工业孪生"路线

3. 酷家乐（国内）
路线：垂直家居行业 + Web 三维 + 海量 SKU 库
国内 Web 三维最大的商业成功案例，已冲港股
适合做"垂直消费配置"路线

AI 给的建议：
AI 驱动的 Web 三维展厅/场景搭建工具：一个前后端全栈的 Web 三维编辑器，支持 AI 自然语言驱动场景生成，核心基于命令模式架构实现操作可回溯，Three.js + Vue3 实现渲染与 UI 层解耦。
- 文字生成场景，流程：用户输入内容 -> 模型返回 SceneJSON -> 反序列化场景内容 -> 渲染
  - 集成 LLM 自然语言接口，用户可通过文字描述生成三维场景布局（OpenAI / DeepSeek）
- 自然语言操作指令，用户输入 "把红色的椅子移到窗边" → LLM 解析意图 → 生成 Command 序列 → 执行
- 封装 glint3d-core 为独立 npm 包，实现渲染引擎与编辑器 UI 的解耦

实现难点：
- 使用什么模型来生成场景。酷家乐使用千万级的模型库，目前这个项目可以考虑收集几十个常用的免费模型（在具体业务场景下的常见模型），让LLM选择（如果没有选中的模型，使用简易模型）。。也可以用户上传自己的模型
- 最核心的技术工作其实是设计稳定的场景 JSON schema 和配套的 prompt，让 LLM 不管输入什么都能生成结构正确的 JSON
