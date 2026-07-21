import { onMounted, onUnmounted, ref, watch } from 'vue'

import { catActivityAt, useCatStore } from '@/stores/cat'
import live2d from '@/utils/live2d'

export function useIdleRender() {
  const catStore = useCatStore()
  const isIdle = ref(false)
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let appliedFPS: number | undefined
  let mounted = false

  const clearIdleTimer = () => {
    if (!idleTimer) return

    clearTimeout(idleTimer)
    idleTimer = void 0
  }

  const updateRenderRate = () => {
    if (!mounted) return

    clearIdleTimer()

    const configuredMaxFPS = Number.isFinite(catStore.model.maxFPS)
      ? Math.max(0, Math.round(catStore.model.maxFPS))
      : 60
    const configuredIdleFPS = Number.isFinite(catStore.performance.idleFPS)
      ? Math.max(1, Math.round(catStore.performance.idleFPS))
      : 15
    const idleFPS = configuredMaxFPS > 0
      ? Math.min(configuredMaxFPS, configuredIdleFPS)
      : configuredIdleFPS
    const idleAfter = (Number.isFinite(catStore.performance.idleAfter)
      ? Math.max(0, catStore.performance.idleAfter)
      : 60) * 1000
    const idleFor = Date.now() - catActivityAt.value
    const nextFPS = catStore.performance.idleEnabled && idleFor >= idleAfter
      ? idleFPS
      : configuredMaxFPS

    isIdle.value = catStore.performance.idleEnabled && idleFor >= idleAfter

    if (nextFPS !== appliedFPS) {
      appliedFPS = nextFPS
      live2d.setMaxFPS(nextFPS)
    }

    if (catStore.performance.idleEnabled && !isIdle.value) {
      idleTimer = setTimeout(updateRenderRate, Math.max(1, idleAfter - idleFor))
    }
  }

  const stopWatching = watch([
    () => catStore.model.maxFPS,
    () => catStore.performance.idleEnabled,
    () => catStore.performance.idleAfter,
    () => catStore.performance.idleFPS,
    () => catActivityAt.value,
  ], updateRenderRate)

  onMounted(() => {
    mounted = true
    updateRenderRate()
  })

  onUnmounted(() => {
    mounted = false
    clearIdleTimer()
    stopWatching()
    catStore.flushStats()
    appliedFPS = undefined
    live2d.setMaxFPS(Number.isFinite(catStore.model.maxFPS) ? Math.max(0, catStore.model.maxFPS) : 60)
  })

  return {
    isIdle,
  }
}
