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
import { ref, nextTick } from 'vue'
import { chatWithAI, chatWithAIStream, type ChatMessage } from '@/services/ai'
import { useManagerStore } from '@/stores/manager'
import { buildSceneSystemPrompt } from './scenePrompt'
import { AISceneResponseSchema } from '@scene-prod/shared/schema'
import { SceneCommand } from '@scene-prod/shared'
import { fromAICommand, ActualCommand, BatchCommand } from '@scene-prod/core'
import { useHistoryStore } from '@/stores/history'

const managerStore = useManagerStore()
const historyStore = useHistoryStore()

function getSystemMessages(): ChatMessage[] {
  const objects = managerStore.sceneManager ? [...managerStore.sceneManager.objects] : []
  return [{ role: 'system', content: buildSceneSystemPrompt(objects) }]
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

  const result = await chatWithAI([...getSystemMessages(), ...messages.value.filter((m) => !m.skipContext)])
  loading.value = false

  if (result.success) {
    try {
      const parsed = AISceneResponseSchema.parse(JSON.parse(result.content))
      console.log('[AI 指令]', parsed.commands)
      const failed: string[] = []

      const cmds = parsed.commands
        .map((cmd) => {
          const c = fromAICommand(cmd, managerStore.sceneManager!)
          if(!c) {
            failed.push(cmd.commandType)
          }
          return c
        })
        .filter(Boolean) as ActualCommand[]
      // .filter(Boolean) 过滤掉假植

      if (cmds.length > 0) {
        historyStore.execute(new BatchCommand(cmds, parsed.explanation))
      }

      messages.value.push({ role: 'assistant', content: parsed.explanation })
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
