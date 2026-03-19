<template>
  <Transition name="loader-fade">
    <div v-if="visible" class="page-loader">
      <div class="loader-box">
        <div class="orbit-wrap">
          <div class="orbit orbit-1"></div>
          <div class="orbit orbit-2"></div>
          <div class="orbit orbit-3"></div>
          <div class="orbit-core"></div>
        </div>
        <div class="loader-text">{{ text || 'Loading data…' }}</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; text?: string }>()
</script>

<style scoped>
.page-loader {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 23, 0.75);
  backdrop-filter: blur(4px);
}

.loader-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.orbit-wrap {
  position: relative;
  width: 72px;
  height: 72px;
}

.orbit {
  position: absolute;
  border-radius: 50%;
  border: 2px solid transparent;
}

.orbit-1 {
  inset: 0;
  border-top-color: var(--primary);
  animation: spin1 1s linear infinite;
}
.orbit-2 {
  inset: 12px;
  border-right-color: var(--primary-light);
  animation: spin2 1.4s linear infinite reverse;
}
.orbit-3 {
  inset: 22px;
  border-bottom-color: rgba(99,102,241,0.5);
  animation: spin1 0.8s linear infinite;
}

.orbit-core {
  position: absolute;
  inset: 30px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 16px rgba(99,102,241,0.8);
  animation: core-pulse 1.5s ease-in-out infinite;
}

@keyframes spin1 { to { transform: rotate(360deg); } }
@keyframes spin2 { to { transform: rotate(-360deg); } }
@keyframes core-pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

.loader-text {
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.loader-fade-enter-active,
.loader-fade-leave-active { transition: opacity 0.3s ease; }
.loader-fade-enter-from,
.loader-fade-leave-to { opacity: 0; }
</style>
