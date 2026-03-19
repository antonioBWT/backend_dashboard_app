<script setup lang="ts">
import { ref } from 'vue'
import { aiApi } from '../../api'

const props = defineProps<{ filters: Record<string, any> }>()
const emit = defineEmits<{ close: [] }>()

interface Message { role: 'user' | 'ai'; text: string; loading?: boolean }

const messages = ref<Message[]>([
  { role: 'ai', text: 'Hello! I can answer questions about the Twitter data. Try: "Why is there a spike this month?" or "What are the most viewed tweets?"' },
])
const input = ref('')
const loading = ref(false)

const suggestions = [
  'What are the main topics discussed?',
  'Which theme has the most engagement?',
  'Summarize the sentiment this period',
  'Who are the most influential authors?',
]

async function send(text?: string) {
  const q = text ?? input.value.trim()
  if (!q || loading.value) return

  messages.value.push({ role: 'user', text: q })
  input.value = ''
  loading.value = true
  messages.value.push({ role: 'ai', text: '', loading: true })

  try {
    const res = await aiApi.chat(q, props.filters)
    messages.value[messages.value.length - 1] = { role: 'ai', text: res.answer }
  } catch {
    messages.value[messages.value.length - 1] = { role: 'ai', text: 'Sorry, I could not process that request right now. Please try again later.' }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <div class="chat-title">🤖 AI Data Assistant</div>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="messages" ref="messagesEl">
      <div v-for="(m, i) in messages" :key="i" :class="['message', m.role]">
        <div class="bubble">
          <span v-if="m.loading" class="typing">
            <span></span><span></span><span></span>
          </span>
          <span v-else>{{ m.text }}</span>
        </div>
      </div>
    </div>

    <div class="suggestions">
      <button v-for="s in suggestions" :key="s" class="suggestion" @click="send(s)">{{ s }}</button>
    </div>

    <div class="chat-input">
      <el-input
        v-model="input"
        placeholder="Ask about the data..."
        @keyup.enter="send()"
        :disabled="loading"
        size="default"
      >
        <template #append>
          <el-button @click="send()" :loading="loading" type="primary">Send</el-button>
        </template>
      </el-input>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  position: fixed;
  bottom: 0;
  right: 24px;
  width: 420px;
  max-height: 520px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  display: flex;
  flex-direction: column;
  z-index: 200;
  box-shadow: 0 -4px 30px rgba(0,0,0,0.4);
}

.chat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.chat-title { font-weight: 600; font-size: 14px; }
.close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 6px; }

.messages {
  flex: 1; overflow-y: auto; padding: 16px; display: flex;
  flex-direction: column; gap: 10px;
}
.message { display: flex; }
.message.user { justify-content: flex-end; }
.message.ai { justify-content: flex-start; }
.bubble {
  max-width: 85%; padding: 10px 14px; border-radius: 12px;
  font-size: 13px; line-height: 1.5;
}
.message.user .bubble { background: var(--primary); color: #fff; border-radius: 12px 12px 2px 12px; }
.message.ai .bubble { background: var(--surface2); border: 1px solid var(--border); border-radius: 12px 12px 12px 2px; }

.typing { display: flex; gap: 4px; align-items: center; height: 16px; }
.typing span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted);
  animation: bounce 1.2s infinite;
}
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }

.suggestions {
  padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 6px;
  border-top: 1px solid var(--border);
}
.suggestion {
  font-size: 11px; padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-muted); cursor: pointer; white-space: nowrap;
  transition: all 0.15s;
}
.suggestion:hover { border-color: var(--primary); color: var(--primary); }

.chat-input { padding: 12px; border-top: 1px solid var(--border); }
</style>
