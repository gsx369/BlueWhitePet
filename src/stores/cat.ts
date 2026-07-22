import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export interface CatStore {
  model: {
    mirror: boolean
    mouseMirror: boolean
    motionSound: boolean
    behavior: boolean
    autoReleaseDelay: number
    maxFPS: number
    ignoreMouse: boolean
  }
  window: {
    visible: boolean
    passThrough: boolean
    gameMode: boolean
    alwaysOnTop: boolean
    scale: number
    opacity: number
    radius: number
    hideOnHover: boolean
    hideOnHoverDelay: number
    keepInScreen: boolean
  }
  performance: {
    idleEnabled: boolean
    idleAfter: number
    idleFPS: number
  }
  feedback: {
    hudEnabled: boolean
    dialogueEnabled: boolean
    rewardNotifications: boolean
  }
  stats: {
    inputCount: number
    interactionCount: number
  }
}

// Runtime-only activity state must stay outside Pinia. Mouse movement can fire
// hundreds of times per second, while this project's Pinia plugin persists and
// broadcasts every state mutation even when that key is filtered from storage.
export const catActivityAt = ref(Date.now())

const ACTIVITY_UPDATE_INTERVAL = 250
const STATS_FLUSH_INTERVAL = 1000

export const useCatStore = defineStore('cat', () => {
  /* ------------ 废弃字段（后续删除） ------------ */

  /** @deprecated 请使用 `model.mirror` */
  const mirrorMode = ref(false)

  /** @deprecated 请使用 `model.mouseMirror` */
  const mouseMirror = ref(false)

  /** @deprecated 请使用 `window.passThrough` */
  const penetrable = ref(false)

  /** @deprecated 请使用 `window.alwaysOnTop` */
  const alwaysOnTop = ref(true)

  /** @deprecated 请使用 `window.scale` */
  const scale = ref(100)

  /** @deprecated 请使用 `window.opacity` */
  const opacity = ref(100)

  /** @deprecated 用于标识数据是否已迁移，后续版本将删除 */
  const migrated = ref(false)

  const model = reactive<CatStore['model']>({
    mirror: false,
    mouseMirror: false,
    motionSound: true,
    behavior: true,
    autoReleaseDelay: 3,
    maxFPS: 60,
    ignoreMouse: false,
  })

  const window = reactive<CatStore['window']>({
    visible: true,
    passThrough: false,
    gameMode: false,
    alwaysOnTop: false,
    scale: 100,
    opacity: 100,
    radius: 0,
    hideOnHover: false,
    hideOnHoverDelay: 0,
    keepInScreen: true,
  })

  const performance = reactive<CatStore['performance']>({
    idleEnabled: true,
    idleAfter: 60,
    idleFPS: 15,
  })

  const feedback = reactive<CatStore['feedback']>({
    hudEnabled: true,
    dialogueEnabled: true,
    rewardNotifications: true,
  })

  const stats = reactive<CatStore['stats']>({
    inputCount: 0,
    interactionCount: 0,
  })

  const temporaryPassThrough = ref(false)
  let pendingInputCount = 0
  let statsFlushTimer: ReturnType<typeof setTimeout> | undefined

  const flushStats = () => {
    clearTimeout(statsFlushTimer)
    statsFlushTimer = undefined

    if (pendingInputCount === 0) return

    stats.inputCount += pendingInputCount
    pendingInputCount = 0
  }

  const markActivity = (countInput = false) => {
    const now = Date.now()

    if (now - catActivityAt.value >= ACTIVITY_UPDATE_INTERVAL) {
      catActivityAt.value = now
    }

    if (!countInput) return

    pendingInputCount += 1
    statsFlushTimer ??= setTimeout(flushStats, STATS_FLUSH_INTERVAL)
  }

  const recordInteraction = () => {
    stats.interactionCount += 1

    markActivity()
  }

  const resetStats = () => {
    clearTimeout(statsFlushTimer)
    statsFlushTimer = undefined
    pendingInputCount = 0
    stats.inputCount = 0
    stats.interactionCount = 0
  }

  const init = () => {
    if (migrated.value) return

    model.mirror = mirrorMode.value
    model.mouseMirror = mouseMirror.value

    window.visible = true
    window.passThrough = penetrable.value
    window.alwaysOnTop = alwaysOnTop.value
    window.scale = scale.value
    window.opacity = opacity.value

    migrated.value = true
  }

  return {
    migrated,
    model,
    window,
    performance,
    feedback,
    stats,
    temporaryPassThrough,
    markActivity,
    recordInteraction,
    flushStats,
    resetStats,
    init,
  }
}, {
  tauri: {
    filterKeys: ['temporaryPassThrough'],
  },
})
