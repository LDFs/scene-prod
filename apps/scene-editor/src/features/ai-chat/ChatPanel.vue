<template>
  <div class="chat-panel">
    <div class="chat-header">
      <h3>AI 助手</h3>
      <button class="clear-btn" :disabled="loading || messages.length === 0" @click="clearMessages">清空</button>
    </div>

    <div ref="listRef" class="chat-messages">
      <p v-if="messages.length === 0" class="empty-tip">向 AI 描述你的需求，开始对话吧～</p>

      <div v-for="(msg, index) in messages" :key="index" class="message-row" :class="msg.role">
        <div class="bubble" :class="{ loading: loading && index === messages.length - 1 && !msg.content }">
          {{ msg.content || (loading && index === messages.length - 1 ? '思考中…' : '') }}
        </div>
      </div>

      <div
        v-if="
          loading &&
          (messages.length === 0 || messages[messages.length - 1].content === '' || messages.length % 2 === 1)
        "
        class="assistant message-row"
      >
        <div class="loading">思考中...</div>
      </div>
    </div>

    <div class="chat-input">
      <textarea
        v-model="input"
        :disabled="loading"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows="2"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button class="send-btn" :disabled="loading || !input.trim()" @click="send">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import * as THREE from 'three'
import { chatWithAI, chatWithAIStream, type ChatMessage } from '@/services/ai'
import { useManagerStore } from '@/stores/manager'
import { buildSceneSystemPrompt } from './scenePrompt'
import { AISceneResponseSchema } from '@scene-prod/shared/schema'
import { SceneCommand, AssetWithId } from '@scene-prod/shared'
import { fromAICommand, ActualCommand, BatchCommand, AddObjectCommand } from '@scene-prod/core'
import { useHistoryStore } from '@/stores/history'
import { getAssets, getModelUrl } from '@/services/asset'

const managerStore = useManagerStore()
const historyStore = useHistoryStore()

// 模型库清单：用于告知 AI 有哪些可用模型，并在 add_model 时解析为具体资源
const libraryModels = ref<AssetWithId[]>([])

async function loadLibraryModels() {
  try {
    const { assets } = await getAssets('model')
    libraryModels.value = assets
  } catch (error) {
    console.error('加载模型库失败:', error)
  }
}

onMounted(loadLibraryModels)

function getSystemMessages(): ChatMessage[] {
  const objects = managerStore.sceneManager ? [...managerStore.sceneManager.objects] : []
  return [{ role: 'system', content: buildSceneSystemPrompt(objects, libraryModels.value) }]
}

/**
 * 把单条 AI 命令转成可执行命令。add_model 需异步加载 GLTF，故单独处理；
 * 其余命令复用同步的 fromAICommand。无法执行时返回 null。
 */
async function resolveCommand(cmd: SceneCommand): Promise<ActualCommand | null> {
  if (cmd.commandType !== 'add_model') {
    return fromAICommand(cmd, managerStore.sceneManager!)
  }

  const persistenceManager = managerStore.persistenceManager
  if (!persistenceManager) return null

  const asset = libraryModels.value.find((m) => m.name === cmd.modelName)
  if (!asset) return null

  const url = getModelUrl(asset)
  if (!url) return null

  const object = await persistenceManager.loadGLTFModel(url, cmd.name ?? cmd.modelName)

  // 尺寸归一化（与拖拽落地一致），再叠加 AI 指定的相对缩放
  const normalizeScale = asset.sizing?.normalizeScale ?? 1
  if (normalizeScale !== 1) object.scale.multiplyScalar(normalizeScale)
  if (cmd.scale) {
    object.scale.multiply(new THREE.Vector3(cmd.scale.x ?? 1, cmd.scale.y ?? 1, cmd.scale.z ?? 1))
  }

  if (cmd.position) {
    object.position.set(cmd.position.x ?? 0, cmd.position.y ?? 0, cmd.position.z ?? 0)
  }
  if (cmd.rotation) {
    object.rotation.set(cmd.rotation.x ?? 0, cmd.rotation.y ?? 0, cmd.rotation.z ?? 0)
  }

  return new AddObjectCommand(managerStore.sceneManager!, object, cmd.allowOverlap)
}

const messages = ref<ChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const listRef = ref<HTMLDivElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

async function send() {
  const content = input.value.trim()
  if (!content || loading.value) return

  messages.value.push({ role: 'user', content })
  input.value = ''
  loading.value = true
  await scrollToBottom()

  // 模型库为空时兜底加载一次，确保 AI 拿到最新清单
  if (libraryModels.value.length === 0) await loadLibraryModels()

  const result = await chatWithAI([...getSystemMessages(), ...messages.value.filter((m) => !m.skipContext)])
  loading.value = false

  if (result.success) {
    try {
      const parsed = AISceneResponseSchema.parse(JSON.parse(result.content))
      console.log('[AI 指令]', parsed.commands)
      const failed: string[] = []

      const resolved = await Promise.all(
        parsed.commands.map(async (cmd) => {
          try {
            const c = await resolveCommand(cmd)
            if (!c) {
              const label = cmd.commandType === 'add_model' ? cmd.modelName : cmd.name
              failed.push(cmd.commandType + label)
            }
            return c
          } catch (error) {
            console.error('解析指令失败:', cmd, error)
            const label = cmd.commandType === 'add_model' ? cmd.modelName : cmd.name
            failed.push(cmd.commandType + label)
            return null
          }
        }),
      )
      const cmds = resolved.filter(Boolean) as ActualCommand[]
      // .filter(Boolean) 过滤掉无法执行的指令

      if (cmds.length > 0) {
        const batch = new BatchCommand(cmds, parsed.explanation)
        historyStore.execute(batch)

        // 执行后收集调整信息，有些指令可能需要代码进行检测
        const notes = batch.getAdjustmentNotes()
        const explanation = notes.length > 0 ? `${parsed.explanation}\n\n⚠️ ${notes.join('\n')}` : parsed.explanation

        messages.value.push({ role: 'assistant', content: explanation })
      } else messages.value.push({ role: 'assistant', content: parsed.explanation })

      if (failed.length > 0) {
        messages.value.push({
          role: 'user',
          content: `[系统提示] 以下指令未能执行（对象不存在或参数有误）：${failed.join(', ')}`,
          skipContext: false,
        })
      }
    } catch (error: any) {
      messages.value.push({
        role: 'assistant',
        content: `❗执行出错：${error.message}`,
        skipContext: true,
      })
    }
  } else {
    messages.value.push({ role: 'assistant', content: `出错了：${result.message}` })
  }
  await scrollToBottom()
}

async function sendStream() {
  const content = input.value.trim()
  if (!content || loading.value) return

  messages.value.push({ role: 'user', content })
  input.value = ''
  loading.value = true
  await scrollToBottom()

  // 先占一个空的 assistant 消息，流式追加到这里而不是每次 push 新的
  messages.value.push({ role: 'assistant', content: '' })
  const idx = messages.value.length - 1

  await chatWithAIStream(
    messages.value.slice(0, idx),
    async (delta) => {
      messages.value[idx].content += delta
      await scrollToBottom()
    },
    () => {
      loading.value = false
    },
    (message) => {
      console.error('AI 流式对话失败:', message)
      messages.value[idx].content = `出错了：${message}`
      loading.value = false
    },
  )
  loading.value = false
}

function clearMessages() {
  messages.value = []
}
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  color: #e0e0e0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #333;
}

.chat-header h3 {
  margin: 0;
  font-size: 14px;
}

.clear-btn {
  background: transparent;
  border: 1px solid #444;
  color: #aaa;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}

.clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-tip {
  color: #777;
  font-size: 13px;
  text-align: center;
  margin-top: 24px;
}

.message-row {
  display: flex;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-row.user .bubble {
  background: #2f6feb;
  color: #fff;
}

.message-row.assistant .bubble {
  background: #2a2a2a;
  color: #e0e0e0;
}

.bubble.loading {
  color: #888;
  font-style: italic;
}

.chat-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #333;
}

.chat-input textarea {
  flex: 1;
  resize: none;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e0e0e0;
  padding: 8px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.chat-input textarea:focus {
  border-color: #2f6feb;
}

.send-btn {
  align-self: flex-end;
  background: #2f6feb;
  border: none;
  color: #fff;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
