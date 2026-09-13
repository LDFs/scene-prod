import { onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'
import { ThumbnailGenerator } from '@scene-prod/core'
import type { AssetWithId } from '@scene-prod/shared'
import { uploadAsset, waitForProcessing } from '../services/asset'
import {
  scanGltfDependencies,
  scanObjDependencies,
  packBundle,
  isGltfUploadable,
  type GltfDependencyReport,
} from '../utils/modelBundle'

/**
 * 资产上传流程。资产管理页和编辑器资源库面板共用同一套逻辑：
 * 依赖扫描 → 打包 → 生成缩略图 → 串行上传 →（可选）等待后台处理并汇报结果。
 *
 * 上传完成后要做什么（刷新整页 / 前插到列表头部）由调用方通过 hooks 决定。
 *
 * 支持的上传资源的方式：
 * 1. 单选文件
 * 2. 多选文件
 * 3. 上传压缩包.zip
 * 4. 上传文件夹
 *
 * 对于模型和所需资源分开的情况：
 * 1 .gltf，就是单纯的索引文件，罗列所需要的资源。几何数据（.bin）缺失时报错，
 *   贴图缺失只提示（扫描时已把引用摘掉，导入成无贴图模型）。多选时，被 gltf
 *   引用的资源就不再单独上传 而是一起被压缩到一个zip中
 * 2 .obj与.mtl，上传压缩包、多选、文件夹。缺 .mtl / 贴图都只提示。
 *
 */

/**
 * 模型入口可选的扩展名。除模型本体外还放开了 .bin、.mtl 和贴图：
 * .gltf / .obj 的依赖必须与它一起选中，扫描才能找到。
 */
export const MODEL_UPLOAD_ACCEPT = '.gltf,.glb,.obj,.mtl,.fbx,.zip,.bin,.jpg,.jpeg,.png,.webp,.ktx2'

/**
 * 贴图入口可选的扩展名。
 */
export const TEXTURE_UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.webp,.hdr,.exr'

export interface UploadHooks {
  /** 上传接口全部返回后触发。此时模型仍可能在后台处理（pending/processing） */
  onUploaded?: (assets: AssetWithId[]) => void | Promise<void>
  /**
   * 是否就地等待后台处理并用消息汇报结果，默认 true。
   * 调用方自己有状态角标 + 轮询时应传 false，否则上传态会一直挂到处理结束（可达数分钟）。
   */
  reportProcessing?: boolean
  /** 有资产处理到达终态（ready/failed）后触发，用于刷新列表状态。仅 reportProcessing 时会调用 */
  onProcessed?: () => void | Promise<void>
}

/** 取小写扩展名，不含点；无扩展名返回空串 */
const extOf = (file: File) => {
  const idx = file.name.lastIndexOf('.')
  return idx === -1 ? '' : file.name.slice(idx + 1).toLowerCase()
}

/**
 * 可作为独立资产上传的扩展名。
 * 选择文件夹时没有 accept 过滤，README / .DS_Store 之类都会被带进来，
 * 靠这个白名单挡掉，避免产生垃圾资产记录。
 *
 * 注意这里**没有 mtl**：.mtl 只是 .obj 的材质定义，转换时会被 obj2gltf 烘进 GLB，
 * 单独存一条 material 资产既没有缩略图、也不在任何筛选分类里、拖进场景也没有作用。
 * 与 .bin 一样，它只能作为依赖随模型一起上传。
 */
const STANDALONE_EXTENSIONS = new Set([
  'gltf',
  'glb',
  'obj',
  'fbx',
  'zip',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'ktx2',
  'hdr',
  'exr',
])

/** 只能作为依赖存在、不能独立成为资产的扩展名 → 提示文案 */
const DEPENDENCY_ONLY_EXTENSIONS: Record<string, string> = {
  bin: '请与引用它的 .gltf 一起选择',
  mtl: '请与引用它的 .obj 一起选择',
}

/**
 * 缩略图的渲染方式。
 *
 * 打包成 zip 之后就没法再按文件扩展名判断该怎么渲染了，所以入队时显式带上渲染源。
 */
type ThumbnailSource =
  | { kind: 'gltf'; file: File }
  | { kind: 'fbx'; file: File }
  | { kind: 'obj'; file: File; mtl: File | null; textures: File[] }

/** 待上传项：真正要上传的文件 + 怎么给它生成缩略图 */
interface UploadItem {
  file: File
  thumbnail: ThumbnailSource | null
}

/** 依赖不全时给出可操作的提示，而不是只说一句失败 */
function describeIncompleteBundle(file: File, missing: string[], ambiguous: string[]): string {
  const reasons: string[] = []
  if (missing.length > 0) {
    reasons.push(`缺少 ${missing.join('、')}`)
  }
  if (ambiguous.length > 0) {
    reasons.push(`${ambiguous.join('、')} 匹配到多个同名文件，无法确定用哪个`)
  }
  return `${file.name} 上传失败：${reasons.join('；')}。请把这些依赖文件（或整个模型目录）一起选中，或先打包成 .zip`
}

export function useAssetUpload() {
  const uploading = ref(false)
  const uploadStatus = ref('')

  /**
   * 缩略图生成器持有 WebGL 上下文，按需创建一个复用。
   * 预览弹窗也走它，所以对外暴露，避免调用方再开一个上下文。
   */
  let thumbnailGenerator: ThumbnailGenerator | null = null
  const getThumbnailGenerator = () => {
    if (!thumbnailGenerator) {
      thumbnailGenerator = new ThumbnailGenerator(100, 100)
    }
    return thumbnailGenerator
  }

  /** 按渲染源生成缩略图。失败只记日志——没有缩略图不该阻断上传 */
  const renderThumbnail = async (source: ThumbnailSource): Promise<Blob | null> => {
    const generator = getThumbnailGenerator()
    try {
      switch (source.kind) {
        case 'gltf':
          return await generator.generate(source.file)
        case 'fbx':
          return await generator.generateWithFbx(source.file)
        case 'obj':
          return await generator.generateWithObj(source.file, source.mtl, source.textures)
      }
    } catch (error) {
      console.error('生成缩略图失败:', error)
      return null
    }
  }

  /** @returns 上传成功返回资产记录，失败返回 null */
  const handleOneFile = async (item: UploadItem): Promise<AssetWithId | null> => {
    const { file, thumbnail: source } = item
    if (!file) {
      return null
    }
    let thumbnail: Blob | null = null
    try {
      if (source) {
        uploadStatus.value = `正在生成 ${file.name} 的缩略图...`
        thumbnail = await renderThumbnail(source)
      }

      uploadStatus.value = `正在上传 ${file.name}...`
      const result = await uploadAsset(file, thumbnail)

      if (!result.success) {
        ElMessage({
          message: '上传失败:' + result.message,
          type: 'error',
          duration: 8000,
        })
        return null
      }

      // 上传成功只代表文件已收下、任务已入队；模型的处理还在队列里异步进行，
      // 所以这里不能说"上传成功"就完事
      const asset = result.asset as AssetWithId | undefined
      const pending = asset?.processingStatus === 'pending' || asset?.processingStatus === 'processing'
      ElMessage({
        message: pending ? `${file.name} 已上传，正在处理...` : `${file.name} 上传成功`,
        type: 'success',
      })
      return asset ?? null
    } catch (error) {
      console.error('上传失败:', error)
      ElMessage({
        message: `${file.name} 上传失败`,
        type: 'error',
      })
      return null
    }
  }

  /**
   * 等待并汇报异步处理结果。
   *
   * 上传接口的 200 只说明入队成功，流水线里的失败（缺依赖资源、格式转换失败、
   * 云存储上传失败）此前没有任何回传通道，用户只会看到一句"上传成功"，直到把
   * 模型拖进场景才报错。这里把那些失败显式说出来。
   */
  const reportProcessingResults = async (uploaded: AssetWithId[], onProcessed?: UploadHooks['onProcessed']) => {
    // 只有模型会进流水线，其余类型直接是 skipped
    const processing = uploaded.filter(
      (asset) => asset.processingStatus === 'pending' || asset.processingStatus === 'processing',
    )
    if (processing.length === 0) return

    let anyFinished = false
    for (const asset of processing) {
      uploadStatus.value = `正在处理 ${asset.originalName}...`
      const outcome = await waitForProcessing(asset._id)

      if (outcome.ok) {
        anyFinished = true
        ElMessage({
          message: `${asset.originalName} 处理完成`,
          type: 'success',
        })
        // 成功但有瑕疵：ZIP 内多模型只用了一个、OBJ 缺 .mtl 回落了默认材质、
        // 修复了无效顶点值……资产能用，但和用户预期有出入，必须说出来
        if (outcome.warning) {
          ElNotification.warning({
            title: 'warning',
            message: `${asset.originalName}：${outcome.warning}`,
            duration: 12000,
          })
        }
      } else if (outcome.status === 'timeout') {
        ElNotification.info({
          title: 'info',
          message: `${asset.originalName}：${outcome.message}`,
          duration: 6000,
        })
      } else {
        anyFinished = true
        ElMessageBox.alert(`${outcome.message}`, `${asset.originalName} 处理失败`, {
          confirmButtonText: 'OK',
        })
      }
    }

    // 处理结果改变了资产状态（ready/failed、缩略图、产物路径），刷新以反映最新状态
    if (anyFinished) await onProcessed?.()
  }

  /**
   * .gltf 和 .obj 都是多文件资产，只传主文件等于传了一份索引。
   * 所以先扫描依赖，再决定怎么上传：
   *
   * 拦不拦截只看"缺了还能不能用"，两种格式一个标准：
   *
   *   - .gltf：几何数据在 .bin 里，缺了产物是个空模型 → 拦下并说明缺什么，
   *     不写入注定失败的记录。贴图缺失则由 scanGltfDependencies 摘掉材质引用，
   *     导入成无贴图模型 → 只提示。
   *   - .obj：材质在 .mtl 里、贴图再由 .mtl 引用。缺失时 obj2gltf 会回落到默认
   *     材质，产物仍是个能用的模型，所以**不拦截**，只提示，按单文件上传。
   *
   * 两者被引用到的依赖都标记为已消费，不再单独上传——否则会产生一堆无法独立
   * 使用的碎片资产（.bin / .mtl / 贴图各一条）。
   *
   * @returns 上传成功的资产记录
   */
  async function uploadFiles(files: File[], hooks: UploadHooks = {}): Promise<AssetWithId[]> {
    uploading.value = true
    uploadStatus.value = '正在处理...'
    try {
      const consumed = new Set<File>()
      const queue: UploadItem[] = []

      // ---- .gltf：几何数据必须齐全，缺贴图只提示 ----
      for (const file of files) {
        if (extOf(file) !== 'gltf') continue

        uploadStatus.value = `正在检查 ${file.name} 的依赖...`
        let report: GltfDependencyReport
        try {
          report = await scanGltfDependencies(file, files)
        } catch (error: any) {
          ElMessage({
            message: error?.message ?? `${file.name} 解析失败`,
            type: 'error',
          })
          consumed.add(file)
          continue
        }

        // 依赖全部内嵌为 data: uri 的 .gltf 是自包含的，按普通单文件上传即可
        if (report.required.length === 0) continue

        consumed.add(file)
        report.resolved.forEach((dep) => consumed.add(dep.file))

        const { missingBuffers, ambiguousBuffers, missingImages, ambiguousImages } = report.gltf

        // 几何数据缺了，产物会是个空模型，拦下来不写注定失败的记录
        if (!isGltfUploadable(report)) {
          ElMessageBox.alert(describeIncompleteBundle(file, missingBuffers, ambiguousBuffers), '导入失败', {
            confirmButtonText: 'OK',
            callback: () => {
              uploading.value = false
            },
          })
          continue
        }

        // 贴图缺了模型还能用，扫描时已把引用摘成"没填这个槽位"，只需说一声
        if (missingImages.length > 0) {
          ElNotification.warning({
            title: 'warning',
            message:
              `${file.name} 的 ${missingImages.length} 个贴图未一起选中（${missingImages.join('、')}），` +
              `已按无贴图导入。如需贴图请把整个模型目录一起选中，或先打包成 .zip`,
            duration: 8000,
          })
        }
        if (ambiguousImages.length > 0) {
          ElNotification.warning({
            title: 'warning',
            message:
              `${file.name}：贴图 ${ambiguousImages.join('、')} 匹配到多个同名文件，无法确定用哪个，` +
              `已按无贴图导入。建议改用"选择文件夹"上传`,
            duration: 8000,
          })
        }

        uploadStatus.value = `正在打包 ${file.name} 及 ${report.resolved.length} 个依赖...`
        queue.push({
          file: await packBundle(report),
          // 缩略图仍从原始 .gltf 渲染：ThumbnailGenerator 走 blob URL，
          // 拿不到 .bin/贴图，但至少能出几何形状
          thumbnail: { kind: 'gltf', file },
        })
      }

      // ---- .obj：缺依赖只提示，不拦截 ----
      for (const file of files) {
        if (extOf(file) !== 'obj') continue

        uploadStatus.value = `正在检查 ${file.name} 的材质...`
        console.log('处理文件-', file, files)
        const report = await scanObjDependencies(file, files)
        const { declaredMtls, mtlFiles, textureFiles, missingMtls, missingTextures } = report.obj

        // mtllib 解析出来的才是这个 obj 真正用的 mtl——按同名去猜会出错
        const thumbnail: ThumbnailSource = {
          kind: 'obj',
          file,
          mtl: mtlFiles[0] ?? null,
          textures: textureFiles,
        }

        if (missingMtls.length > 0) {
          ElNotification.warning({
            title: 'warning',
            message:
              `${file.name} 声明的材质库缺失（${missingMtls.join('、')}），` +
              `将使用默认材质。如需材质请把 .mtl 一起选中`,
            duration: 8000,
          })
        }
        if (missingTextures.length > 0) {
          ElNotification.warning({
            title: 'warning',
            message: `${file.name} 的材质引用了 ${missingTextures.length} 个未选中的贴图：${missingTextures.join('；')}`,
            duration: 8000,
          })
        }
        if (report.ambiguous.length > 0) {
          ElNotification.warning({
            title: 'warning',
            message: `${file.name}：${report.ambiguous.join('、')} 匹配到多个同名文件，无法确定用哪个。建议改用"选择文件夹"上传`,
            duration: 8000,
          })
        }
        if (report.obj.normalizedMtls.length > 0) {
          // 打包时已自动修正，说一声就好，不需要用户做什么
          console.log(`[Upload] ${file.name} 的材质库扩展名已规范为小写 .mtl:`, report.obj.normalizedMtls)
        }

        // 没声明 mtllib，或一个依赖都没找到 → 没什么可打包的，按单文件上传
        if (declaredMtls.length === 0 || report.resolved.length === 0) {
          consumed.add(file)
          queue.push({ file, thumbnail })
          continue
        }

        consumed.add(file)
        report.resolved.forEach((dep) => consumed.add(dep.file))

        uploadStatus.value = `正在打包 ${file.name} 及 ${report.resolved.length} 个依赖...`
        queue.push({ file: await packBundle(report), thumbnail })
      }

      // ---- 其余文件按单文件上传 ----
      const skipped: string[] = []
      for (const file of files) {
        if (consumed.has(file)) continue
        const ext = extOf(file)

        // .bin / .mtl 单独上传没有意义，还会产生无法使用的碎片资产
        const dependencyHint = DEPENDENCY_ONLY_EXTENSIONS[ext]
        if (dependencyHint) {
          ElNotification.warning({
            title: 'warning',
            message: `已跳过 ${file.name}：${dependencyHint}`,
            duration: 6000,
          })
          continue
        }
        if (!STANDALONE_EXTENSIONS.has(ext)) {
          skipped.push(file.name)
          continue
        }

        queue.push({ file, thumbnail: thumbnailSourceFor(file, ext) })
      }

      if (skipped.length > 0) {
        console.log('[Upload] 已跳过非资产文件:', skipped)
        ElNotification.info({
          title: 'info',
          message: `已跳过 ${skipped.length} 个非资产文件`,
          duration: 6000,
        })
      }

      // 串行上传：thumbnailGenerator 是共享单例，并发会让多个模型进同一个场景互相串图
      const uploaded: AssetWithId[] = []
      for (const item of queue) {
        const asset = await handleOneFile(item)
        if (asset) uploaded.push(asset)
      }

      if (uploaded.length === 0) return uploaded

      // 先让列表立刻出现"处理中"的条目，不必干等轮询
      await hooks.onUploaded?.(uploaded)
      uploading.value = false // 之后的轮询在后台进行
      if (hooks.reportProcessing !== false) {
        await reportProcessingResults(uploaded, hooks.onProcessed)
      }
      return uploaded

      // uploading.value = false
      // return []
    } finally {
      uploadStatus.value = ''
    }
  }

  onUnmounted(() => {
    thumbnailGenerator?.dispose()
    thumbnailGenerator = null
  })

  return { uploading, uploadStatus, uploadFiles, getThumbnailGenerator }
}

/** 单文件上传时按扩展名决定缩略图渲染方式；不支持预览的类型返回 null */
function thumbnailSourceFor(file: File, ext: string): ThumbnailSource | null {
  if (ext === 'gltf' || ext === 'glb') return { kind: 'gltf', file }
  if (ext === 'fbx') return { kind: 'fbx', file }
  // 走到这里的 .obj 是没有依赖、或依赖一个都没找到的情况，无材质渲染
  if (ext === 'obj') return { kind: 'obj', file, mtl: null, textures: [] }
  return null
}
