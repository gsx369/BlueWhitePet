<script setup lang="ts">
import type { MotionInfo } from 'easy-live2d'

import { convertFileSrc } from '@tauri-apps/api/core'
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { sep } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { warn } from '@tauri-apps/plugin-log'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { message } from 'antdv-next'
import { round } from 'es-toolkit'
import { nth } from 'es-toolkit/compat'
import { nanoid } from 'nanoid'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { InteractionEventResult } from '@/domain/progression'
import type { WindowPlacement } from '@/plugins/window'
import type { ModelTapInteraction } from '@/stores/model'

import { useAppMenu } from '@/composables/useAppMenu'
import { useDevice } from '@/composables/useDevice'
import { useGamepad } from '@/composables/useGamepad'
import { useIdleRender } from '@/composables/useIdleRender'
import { useModel } from '@/composables/useModel'
import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY } from '@/constants'
import { hideWindow, setAlwaysOnTop, setTaskbarVisibility, showWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { useGeneralStore } from '@/stores/general.ts'
import { useModelStore } from '@/stores/model'
import { useProgressionStore } from '@/stores/progression'
import { isImage } from '@/utils/is'
import live2d from '@/utils/live2d'
import { join } from '@/utils/path'
import { copyPetImage, savePetImage } from '@/utils/petCapture'
import { isWindows } from '@/utils/platform'
import { clearObject } from '@/utils/shared'

const { startListening } = useDevice()
const appWindow = getCurrentWebviewWindow()
const { modelSize, handleLoad, handleDestroy, handleResize, handleKeyChange } = useModel()
const catStore = useCatStore()
const progressionStore = useProgressionStore()
const { getBaseMenu, getExitMenu } = useAppMenu()
const { t } = useI18n()
const modelStore = useModelStore()
const generalStore = useGeneralStore()
const resizing = ref(false)
const backgroundImagePath = ref<string>()
const { stickActive } = useGamepad()
const petWindowRef = useTemplateRef<HTMLElement>('petWindow')
const imageInteractionLayerRef = useTemplateRef<HTMLElement>('imageInteractionLayer')
const live2dInteractionLayerRef = useTemplateRef<HTMLElement>('live2dInteractionLayer')
const imageWheelFeedbackLayerRef = useTemplateRef<HTMLElement>('imageWheelFeedbackLayer')
const live2dWheelFeedbackLayerRef = useTemplateRef<HTMLElement>('live2dWheelFeedbackLayer')
const characterStageRef = useTemplateRef<HTMLElement>('characterStage')
const petImageRef = useTemplateRef<HTMLImageElement>('petImage')
const interaction = ref<Interaction>()
const wheelFeedback = ref<WheelFeedback>()
const bubbleText = ref('')
const bubbleSide = ref<BubbleSide>('left')
const hudBurst = ref(0)
const hudBurstVersion = ref(0)
const rewardToast = ref<RewardToast>()
const temporarilyTransparent = ref(false)
const currentRenderer = computed(() => modelStore.currentModel?.renderer ?? 'live2d')
const imageModel = computed(() => currentRenderer.value === 'image' ? modelStore.currentModel?.image : undefined)
const effectiveOpacity = computed(() => {
  return temporarilyTransparent.value
    ? Math.min(catStore.window.opacity, 12)
    : catStore.window.opacity
})
const activeInteractionLayer = computed(() => {
  return currentRenderer.value === 'live2d'
    ? live2dInteractionLayerRef.value
    : imageInteractionLayerRef.value
})
const activeWheelFeedbackLayer = computed(() => {
  return currentRenderer.value === 'live2d'
    ? live2dWheelFeedbackLayerRef.value
    : imageWheelFeedbackLayerRef.value
})
const speechSlotStyle = computed(() => {
  const bounds = modelStore.currentModel?.bubbleBounds

  if (!bounds) return

  return {
    top: `${bounds.y * 100}%`,
    right: 'auto',
    left: `${bounds.x * 100}%`,
    width: `${bounds.width * 100}%`,
    height: `${bounds.height * 100}%`,
  }
})
const hudSlotStyle = computed(() => {
  const bounds = modelStore.currentModel?.hudBounds

  if (!bounds) return

  return {
    top: `${bounds.y * 100}%`,
    right: 'auto',
    left: `${bounds.x * 100}%`,
    width: `${bounds.width * 100}%`,
    height: `${bounds.height * 100}%`,
  }
})
const hudVisible = computed(() => {
  return catStore.feedback.hudEnabled
    && progressionStore.initialized
    && catStore.window.scale >= 30
})
const rewardToastVisible = computed(() => {
  return catStore.feedback.rewardNotifications
    && Boolean(rewardToast.value)
    && catStore.window.scale >= 30
})

const interactions = ['jump', 'squash', 'shake'] as const
const dialogues = [
  '欸？是在叫我吗？',
  '今天也要加油呀！',
  '嘿嘿，吓我一跳～',
  '肚子有一点点饿了…',
  '一起去散步吧！',
  '没关系，我陪着你。',
  '呀哈！',
  '总会有办法的！',
] as const
const live2dDialogues = [
  '呀哈！',
  '嘿嘿～',
  '一起加油！',
  '没关系！',
  '肚子饿了…',
  '出发吧！',
] as const
const bubbleVisible = computed(() => {
  return Boolean(bubbleText.value)
    && Boolean(modelStore.currentModel?.bubbleBounds)
    && catStore.window.scale >= 35
})

type Interaction = typeof interactions[number]
type BubbleSide = 'left' | 'right'
type WheelFeedback = 'up' | 'down'

interface PointerStart {
  pointerId: number
  x: number
  y: number
}

interface RewardToast {
  rewardId: string
  name: string
  cover?: string
  rarity?: string
}

const DRAG_THRESHOLD = 6
const WHEEL_THRESHOLD = 36
const SCALE_STEP = 5

let interactionIndex = 0
let interactionAnimationVersion = 0
let tapInteractionVersion = 0
let lastTapActionIndex = -1
let lastDialogueIndex = -1
let lastDialogueAt = 0
let pointerStart: PointerStart | undefined
let bubbleTimer: ReturnType<typeof setTimeout> | undefined
let hudBurstTimer: ReturnType<typeof setTimeout> | undefined
let rewardToastTimer: ReturnType<typeof setTimeout> | undefined
let wheelResetTimer: ReturnType<typeof setTimeout> | undefined
let temporaryTransparencyTimer: ReturnType<typeof setTimeout> | undefined
let wheelDelta = 0
let wheelScaleGesture = false
let wheelFeedbackVersion = 0
let modelLoadVersion = 0
let modelLoadQueue: Promise<void> = Promise.resolve()
let windowSizeVersion = 0
let windowSizeQueue: Promise<void> = Promise.resolve()
const rewardToastQueue: RewardToast[] = []

onMounted(startListening)

useIdleRender()

onUnmounted(() => {
  modelLoadVersion += 1
  windowSizeVersion += 1
  handleDestroy()
  clearTimeout(bubbleTimer)
  clearTimeout(hudBurstTimer)
  clearTimeout(rewardToastTimer)
  clearTimeout(temporaryTransparencyTimer)
  rewardToastQueue.length = 0
  catStore.temporaryPassThrough = false
  resetWheelState()
})

const debouncedResize = useDebounceFn(async () => {
  await handleResize()

  resizing.value = false
}, 100)

useEventListener('resize', () => {
  resizing.value = true

  debouncedResize()
})

useEventListener('blur', handlePointerCancel)

watch(() => modelStore.currentModel?.id, () => {
  const model = modelStore.currentModel
  const version = ++modelLoadVersion

  windowSizeVersion += 1
  modelStore.modelReady = false
  backgroundImagePath.value = undefined
  clearObject([modelStore.supportKeys, modelStore.pressedKeys])
  lastTapActionIndex = -1
  clearInteractionState()

  modelLoadQueue = modelLoadQueue.then(async () => {
    const isCurrent = () => version === modelLoadVersion

    if (!model || !isCurrent()) return

    const loaded = await handleLoad(model, isCurrent)

    if (!loaded || !isCurrent()) return

    if (model.renderer === 'image') {
      modelStore.modelReady = true

      return
    }

    const path = join(model.path, 'resources', 'background.png')
    const existed = await exists(path).catch(() => false)

    if (!isCurrent()) return

    backgroundImagePath.value = existed ? convertFileSrc(path) : void 0

    const resourcePath = join(model.path, 'resources')
    const groups = ['left-keys', 'right-keys']

    for await (const groupName of groups) {
      const groupDir = join(resourcePath, groupName)
      const files = await readDir(groupDir).catch(() => [])

      if (!isCurrent()) return

      const imageFiles = files.filter(file => isImage(file.name))

      for (const file of imageFiles) {
        const fileName = file.name.split('.')[0]

        modelStore.supportKeys[fileName] = join(groupDir, file.name)
      }
    }

    if (isCurrent()) modelStore.modelReady = true
  }).catch((error) => {
    if (version === modelLoadVersion) modelStore.modelReady = false

    void warn(`Model load queue failed: ${String(error)}`)
  })
}, { immediate: true })

watch([() => catStore.window.scale, modelSize], ([scale, nextModelSize]) => {
  const version = ++windowSizeVersion

  windowSizeQueue = windowSizeQueue.then(async () => {
    if (!nextModelSize || version !== windowSizeVersion) return

    const { width, height } = nextModelSize

    await appWindow.setSize(
      new PhysicalSize({
        width: Math.round(width * (scale / 100)),
        height: Math.round(height * (scale / 100)),
      }),
    )

    if (version !== windowSizeVersion || currentRenderer.value !== 'live2d') return

    live2d.resizeModel(nextModelSize)
  }).catch((error) => {
    void warn(`Window resize queue failed: ${String(error)}`)
  })
}, { immediate: true })

watch([modelStore.pressedKeys, stickActive], ([keys, stickActive]) => {
  const dirs = Object.values(keys).map((path) => {
    return nth(path.split(sep()), -2)!
  })

  const hasLeft = dirs.some(dir => dir.startsWith('left'))
  const hasRight = dirs.some(dir => dir.startsWith('right'))

  handleKeyChange(true, stickActive.left || hasLeft)
  handleKeyChange(false, stickActive.right || hasRight)
}, { deep: true })

watch(() => catStore.window.visible, async (value) => {
  value ? showWindow() : hideWindow()
})

watch([
  () => catStore.window.passThrough,
  () => catStore.window.gameMode,
  () => catStore.temporaryPassThrough,
], ([passThrough, gameMode, temporaryPassThrough]) => {
  appWindow.setIgnoreCursorEvents(passThrough || gameMode || temporaryPassThrough)
}, { immediate: true })

watch([
  () => catStore.window.alwaysOnTop,
  () => catStore.window.gameMode,
], ([alwaysOnTop, gameMode]) => {
  setAlwaysOnTop(alwaysOnTop || gameMode)
}, { immediate: true })

watch([
  () => catStore.window.gameMode,
  () => generalStore.app.trayVisible,
], ([gameMode, trayVisible]) => {
  // Game mode makes the pet itself click-through. Keep the tray escape route
  // available even if it had previously been disabled in preferences.
  if (gameMode && !trayVisible) generalStore.app.trayVisible = true
}, { immediate: true })

watch(() => generalStore.app.taskbarVisible, setTaskbarVisibility, { immediate: true })

watch(() => catStore.model.motionSound, live2d.setMotionSoundEnabled, { immediate: true })

useTauriListen<MotionInfo>(LISTEN_KEY.START_MOTION, ({ payload }) => {
  live2d.startMotion(payload)
})

useTauriListen<number>(LISTEN_KEY.SET_EXPRESSION, ({ payload }) => {
  live2d.setExpression(payload)
})

useTauriListen<WindowPlacement>(LISTEN_KEY.POSITION_MAIN_WINDOW, ({ payload }) => {
  void placeMainWindow(payload)
})

useTauriListen(LISTEN_KEY.COPY_PET_IMAGE, () => {
  void handleCopyPetImage()
})

useTauriListen(LISTEN_KEY.SAVE_PET_IMAGE, () => {
  void handleSavePetImage()
})

useTauriListen(LISTEN_KEY.RESET_PET_STATS, () => {
  catStore.resetStats()
})

async function placeMainWindow(placement: WindowPlacement) {
  try {
    const monitors = await availableMonitors()

    if (monitors.length === 0) return

    const [windowPosition, windowSize] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ])
    const windowCenter = {
      x: windowPosition.x + windowSize.width / 2,
      y: windowPosition.y + windowSize.height / 2,
    }
    const currentIndex = Math.max(0, monitors.findIndex(({ position, size }) => {
      return windowCenter.x >= position.x
        && windowCenter.x < position.x + size.width
        && windowCenter.y >= position.y
        && windowCenter.y < position.y + size.height
    }))
    const targetIndex = placement === 'next-monitor'
      ? (currentIndex + 1) % monitors.length
      : currentIndex
    const targetMonitor = monitors[targetIndex]
    const { position, size } = targetMonitor.workArea
    const margin = Math.round(20 * targetMonitor.scaleFactor)
    const centerX = position.x + (size.width - windowSize.width) / 2
    const centerY = position.y + (size.height - windowSize.height) / 2
    const targetPlacement = placement === 'next-monitor' ? 'center' : placement

    let x = centerX
    let y = centerY

    if (targetPlacement.endsWith('left')) x = position.x + margin
    if (targetPlacement.endsWith('right')) x = position.x + size.width - windowSize.width - margin
    if (targetPlacement.startsWith('top')) y = position.y + margin
    if (targetPlacement.startsWith('bottom')) y = position.y + size.height - windowSize.height - margin

    const maxX = position.x + size.width - windowSize.width
    const maxY = position.y + size.height - windowSize.height

    x = maxX >= position.x ? Math.max(position.x, Math.min(x, maxX)) : centerX
    y = maxY >= position.y ? Math.max(position.y, Math.min(y, maxY)) : centerY

    await appWindow.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
  } catch (error) {
    void warn(`Unable to position the pet window: ${String(error)}`)
  }
}

function getPetCaptureSource() {
  if (currentRenderer.value === 'live2d') {
    return live2d.captureCanvas()
  }

  return petImageRef.value
}

async function handleCopyPetImage() {
  try {
    const source = getPetCaptureSource()

    if (!source) {
      message.warning(t('pages.main.hints.imageUnavailable'))
      return
    }

    await copyPetImage(source, { mirror: catStore.model.mirror })
    message.success(t('pages.main.hints.copySuccess'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('pages.main.hints.imageUnavailable'))
  }
}

async function handleSavePetImage() {
  try {
    const source = getPetCaptureSource()

    if (!source) {
      message.warning(t('pages.main.hints.imageUnavailable'))
      return
    }

    const savedPath = await savePetImage(source, { mirror: catStore.model.mirror })

    if (savedPath) message.success(t('pages.main.hints.saveSuccess'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('pages.main.hints.imageUnavailable'))
  }
}

function startWindowDrag() {
  if (!pointerStart) return

  releasePointerCapture(pointerStart.pointerId)
  pointerStart = undefined
  void appWindow.startDragging()
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) return

  pointerStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  }

  petWindowRef.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  handleMouseMove(event)

  if (!pointerStart || pointerStart.pointerId !== event.pointerId) return

  if ((event.buttons & 1) === 0) {
    handlePointerCancel()
    return
  }

  const distance = Math.hypot(
    event.clientX - pointerStart.x,
    event.clientY - pointerStart.y,
  )

  if (distance < DRAG_THRESHOLD) return

  startWindowDrag()
}

function handlePointerUp(event: PointerEvent) {
  if (event.button !== 0 || !pointerStart || pointerStart.pointerId !== event.pointerId) return

  const start = pointerStart

  releasePointerCapture(start.pointerId)
  pointerStart = undefined

  const distance = Math.hypot(
    event.clientX - start.x,
    event.clientY - start.y,
  )

  const clickedCharacter = isInsideCharacter(event.clientX, event.clientY)

  if (distance >= DRAG_THRESHOLD || !clickedCharacter) return

  triggerInteraction()
}

function handlePointerCancel() {
  if (pointerStart) releasePointerCapture(pointerStart.pointerId)

  pointerStart = undefined
}

function releasePointerCapture(pointerId: number) {
  if (petWindowRef.value?.hasPointerCapture(pointerId)) {
    petWindowRef.value.releasePointerCapture(pointerId)
  }
}

function clearInteractionState() {
  interactionAnimationVersion += 1
  tapInteractionVersion += 1
  interaction.value = undefined
  bubbleText.value = ''
  clearTimeout(bubbleTimer)
  resetWheelState()
}

function resetWheelState() {
  wheelFeedbackVersion += 1
  wheelFeedback.value = undefined
  wheelDelta = 0
  wheelScaleGesture = false
  clearTimeout(wheelResetTimer)
}

function isInsideCharacter(x: number, y: number) {
  const bounds = modelStore.currentModel?.interactionBounds
  const windowRect = petWindowRef.value?.getBoundingClientRect()

  if (bounds && windowRect) {
    let relativeX = (x - windowRect.left) / windowRect.width
    const relativeY = (y - windowRect.top) / windowRect.height

    if (catStore.model.mirror) relativeX = 1 - relativeX

    return relativeX >= bounds.x
      && relativeX <= bounds.x + bounds.width
      && relativeY >= bounds.y
      && relativeY <= bounds.y + bounds.height
  }

  if (currentRenderer.value === 'live2d') return true

  const rect = characterStageRef.value?.getBoundingClientRect()

  if (!rect) return false

  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function chooseTapInteraction() {
  const configured = modelStore.currentModel?.interactions?.tap

  if (!configured?.length) {
    const fallback = interactions[interactionIndex % interactions.length]

    interactionIndex += 1

    return { fallback, weight: 1 } satisfies ModelTapInteraction
  }

  const candidates = configured.length > 1
    ? configured
        .map((action, index) => ({ action, index }))
        .filter(({ index }) => index !== lastTapActionIndex)
    : configured.map((action, index) => ({ action, index }))
  const totalWeight = candidates.reduce((total, { action }) => total + action.weight, 0)
  let cursor = Math.random() * totalWeight
  let choice = candidates[candidates.length - 1]

  for (const candidate of candidates) {
    cursor -= candidate.action.weight

    if (cursor <= 0) {
      choice = candidate
      break
    }
  }

  lastTapActionIndex = choice.index

  return choice.action
}

async function playFallbackInteraction(nextInteraction: Interaction) {
  const version = ++interactionAnimationVersion

  interaction.value = undefined

  await nextTick()

  if (version !== interactionAnimationVersion) return

  // Force a style flush so repeated clicks restart the same CSS animation cleanly.
  void activeInteractionLayer.value?.offsetWidth
  interaction.value = nextInteraction
}

async function playTapInteraction(
  action: ModelTapInteraction,
  version: number,
  modelId: string | undefined,
) {
  const isCurrent = () => {
    return version === tapInteractionVersion
      && modelStore.currentModel?.id === modelId
  }
  let motionStarted = false

  if (
    isCurrent()
    && currentRenderer.value === 'live2d'
    && action.motionGroup !== undefined
    && action.motionIndex !== undefined
  ) {
    const motions = modelStore.currentMotions
      .find(([groupName]) => groupName === action.motionGroup)?.[1]
    const motion = motions?.[action.motionIndex]

    const motionResult = motion && modelStore.modelReady
      ? live2d.startMotion(motion)
      : undefined

    if (motionResult) {
      motionStarted = true
      void motionResult.then((handle) => {
        if (isCurrent() && handle === -1) void playFallbackInteraction(action.fallback)
      }).catch((error) => {
        void warn(`Unable to start tap motion: ${String(error)}`)
        if (isCurrent()) void playFallbackInteraction(action.fallback)
      })
    }
  }

  if (
    isCurrent()
    && currentRenderer.value === 'live2d'
    && modelStore.modelReady
    && action.expressionIndex !== undefined
    && modelStore.currentExpressions[action.expressionIndex]
  ) {
    live2d.setExpression(action.expressionIndex)
  }

  if (isCurrent() && !motionStarted) await playFallbackInteraction(action.fallback)
}

function showInteractionBurst(count: number) {
  if (count <= 0) return

  hudBurst.value += count
  hudBurstVersion.value += 1
  clearTimeout(hudBurstTimer)
  hudBurstTimer = setTimeout(() => {
    hudBurst.value = 0
  }, 700)
}

function showDialogue(text: string, force = false) {
  if (
    !catStore.feedback.dialogueEnabled
    || !modelStore.currentModel?.bubbleBounds
  ) {
    return false
  }

  const now = Date.now()

  if (!force && (now - lastDialogueAt < 1800 || Math.random() >= 0.45)) return false

  lastDialogueAt = now
  bubbleText.value = text
  bubbleSide.value = currentRenderer.value === 'live2d'
    ? 'left'
    : Math.random() < 0.5 ? 'left' : 'right'

  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubbleText.value = ''
  }, force ? 3200 : 2400)

  return true
}

function showRandomDialogue() {
  const dialoguePool = currentRenderer.value === 'live2d' ? live2dDialogues : dialogues
  const choices = dialoguePool
    .map((text, index) => ({ text, index }))
    .filter(({ index }) => index !== lastDialogueIndex)
  const choice = choices[Math.floor(Math.random() * choices.length)]

  if (!choice) return

  if (showDialogue(choice.text)) lastDialogueIndex = choice.index
}

function showNextRewardToast() {
  if (rewardToast.value) return

  const nextReward = rewardToastQueue.shift()

  if (!nextReward) return

  rewardToast.value = nextReward
  clearTimeout(rewardToastTimer)
  rewardToastTimer = setTimeout(() => {
    rewardToast.value = undefined
    rewardToastTimer = setTimeout(showNextRewardToast, 180)
  }, 3800)
}

function enqueueRewardToast(rewardId: string) {
  if (!catStore.feedback.rewardNotifications) return

  const definition = progressionStore.getRewardDefinition(rewardId)
  const model = modelStore.models.find(model => model.rewardId === rewardId)

  rewardToastQueue.push({
    rewardId,
    name: definition ? t(definition.titleKey) : model?.displayName ?? rewardId,
    cover: model ? convertFileSrc(join(model.path, model.cover ?? 'resources/cover.png')) : undefined,
    rarity: model?.rarity ?? definition?.rarity,
  })
  showNextRewardToast()
}

function handleProgressionFeedback(result: InteractionEventResult) {
  showInteractionBurst(result.acceptedInteractions)

  for (const reward of result.rewards) enqueueRewardToast(reward.rewardId)

  const reward = result.rewards[0]

  if (reward) {
    const definition = progressionStore.getRewardDefinition(reward.rewardId)
    const rewardName = definition ? t(definition.titleKey) : reward.rewardId

    showDialogue(t('pages.main.growth.newReward', { reward: rewardName }), true)
    return
  }

  const milestone = result.milestones.at(-1)

  if (milestone) {
    showDialogue(t('pages.main.growth.milestone', { count: milestone.target }), true)
    return
  }

  showRandomDialogue()
}

function triggerInteraction() {
  const now = Date.now()
  const action = chooseTapInteraction()
  const version = ++tapInteractionVersion
  const modelId = modelStore.currentModel?.id

  catStore.recordInteraction()
  void playTapInteraction(action, version, modelId)

  const result = progressionStore.recordValidInteraction(nanoid(), now)

  handleProgressionFeedback(result)
}

function handleAnimationEnd(event: AnimationEvent) {
  if (event.target !== event.currentTarget) return

  interaction.value = undefined
}

function handleWheelFeedbackEnd(event: AnimationEvent) {
  if (event.target !== event.currentTarget) return

  wheelFeedback.value = undefined
}

async function triggerWheelFeedback(direction: WheelFeedback) {
  const version = ++wheelFeedbackVersion

  wheelFeedback.value = undefined

  await nextTick()

  if (version !== wheelFeedbackVersion) return

  // Keep wheel feedback separate from click interactions so both can compose.
  void activeWheelFeedbackLayer.value?.offsetWidth
  wheelFeedback.value = direction
}

async function handleContextmenu(event: MouseEvent) {
  event.preventDefault()

  if (event.ctrlKey || event.metaKey) {
    triggerTemporaryTransparency()
    return
  }

  if (event.shiftKey) return

  const menu = await Menu.new({
    items: [
      ...await getBaseMenu(),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      ...await getExitMenu(),
    ],
  })

  // Temporarily disable always-on-top on Windows so the context menu is not covered
  if (isWindows && (catStore.window.alwaysOnTop || catStore.window.gameMode)) {
    setAlwaysOnTop(false)
  }

  await menu.popup()

  // Restore always-on-top after the menu is closed
  if (!isWindows || (!catStore.window.alwaysOnTop && !catStore.window.gameMode)) return

  setAlwaysOnTop(true)
}

function triggerTemporaryTransparency() {
  clearTimeout(temporaryTransparencyTimer)
  temporarilyTransparent.value = true
  catStore.temporaryPassThrough = true
  catStore.markActivity()

  temporaryTransparencyTimer = setTimeout(() => {
    temporarilyTransparent.value = false
    catStore.temporaryPassThrough = false
  }, 1600)
}

function handleMouseMove(event: MouseEvent) {
  const { buttons, shiftKey, movementX, movementY } = event

  if (buttons !== 2 || !shiftKey) return

  const delta = (movementX + movementY) * 0.5
  const nextScale = Math.max(10, Math.min(catStore.window.scale + delta, 500))

  catStore.window.scale = round(nextScale)
}

function handleWheel(event: WheelEvent) {
  const scaleGesture = event.ctrlKey || event.metaKey

  if (scaleGesture !== wheelScaleGesture) {
    wheelDelta = 0
    wheelScaleGesture = scaleGesture
  }

  wheelDelta += event.deltaY

  clearTimeout(wheelResetTimer)
  wheelResetTimer = setTimeout(() => {
    wheelDelta = 0
  }, 120)

  if (Math.abs(wheelDelta) < WHEEL_THRESHOLD) return

  const direction = wheelDelta < 0 ? 1 : -1

  if (scaleGesture) {
    const nextScale = Math.max(10, Math.min(catStore.window.scale + direction * SCALE_STEP, 500))

    catStore.window.scale = round(nextScale)
  } else {
    void triggerWheelFeedback(direction > 0 ? 'up' : 'down')
  }

  wheelDelta = 0
}
</script>

<template>
  <div
    ref="petWindow"
    class="pet-window"
    @contextmenu="handleContextmenu"
    @dragstart.prevent
    @pointercancel="handlePointerCancel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @wheel.prevent.stop="handleWheel"
  >
    <div
      v-show="currentRenderer === 'live2d'"
      class="live2d-layer"
      :class="{ 'live2d-layer--mirrored': catStore.model.mirror }"
      :style="{
        opacity: effectiveOpacity / 100,
        borderRadius: `${catStore.window.radius}%`,
      }"
    >
      <img
        v-if="backgroundImagePath"
        class="live2d-fill object-cover"
        draggable="false"
        :src="backgroundImagePath"
      >

      <div
        ref="live2dWheelFeedbackLayer"
        class="wheel-feedback-layer live2d-character-layer"
        :class="wheelFeedback ? `wheel-feedback-layer--${wheelFeedback}` : undefined"
        @animationend="handleWheelFeedbackEnd"
      >
        <div
          ref="live2dInteractionLayer"
          class="interaction-layer live2d-character-layer"
          :class="interaction ? `interaction-layer--${interaction}` : undefined"
          @animationend="handleAnimationEnd"
        >
          <canvas
            id="live2dCanvas"
            class="live2d-fill"
          />

          <img
            v-for="path in modelStore.pressedKeys"
            :key="path"
            class="live2d-fill object-cover"
            draggable="false"
            :src="convertFileSrc(path)"
          >
        </div>
      </div>

      <div
        v-show="resizing || !modelStore.modelReady"
        class="live2d-fill flex items-center justify-center bg-black"
      >
        <span class="text-center text-[10vw] text-[#fff]">
          {{ resizing ? $t('pages.main.hints.redrawing') : $t('pages.main.hints.switching') }}
        </span>
      </div>
    </div>

    <div
      class="speech-slot"
      :class="`speech-slot--${currentRenderer}`"
      :style="speechSlotStyle"
    >
      <Transition name="bubble">
        <div
          v-if="bubbleVisible"
          class="speech-bubble"
          :class="`speech-bubble--${bubbleSide}`"
        >
          {{ bubbleText }}
        </div>
      </Transition>
    </div>

    <div
      v-if="hudVisible || rewardToastVisible"
      class="hud-slot"
      :style="hudSlotStyle"
    >
      <Transition
        mode="out-in"
        name="reward"
      >
        <div
          v-if="rewardToastVisible && rewardToast"
          :key="rewardToast.rewardId"
          class="reward-toast"
          :class="rewardToast.rarity ? `reward-toast--${rewardToast.rarity}` : undefined"
          role="status"
        >
          <img
            v-if="rewardToast.cover"
            :alt="rewardToast.name"
            class="reward-toast__cover"
            draggable="false"
            :src="rewardToast.cover"
          >
          <i
            v-else
            class="i-lucide:gift reward-toast__icon"
          />

          <span class="reward-toast__content">
            <small aria-hidden="true">🎁</small>
            <strong>{{ $t('pages.main.growth.newReward', { reward: rewardToast.name }) }}</strong>
          </span>
        </div>

        <div
          v-else-if="hudVisible"
          key="interaction-hud"
          class="interaction-hud"
          :title="$t('pages.main.growth.lifetimeTotal', { count: progressionStore.lifetimeInteractions.toLocaleString() })"
        >
          <span class="interaction-hud__total">
            <i class="i-lucide:mouse-pointer-click" />
            {{ progressionStore.lifetimeInteractions.toLocaleString() }}
          </span>

          <span
            v-if="hudBurst"
            :key="hudBurstVersion"
            class="interaction-hud__burst"
          >
            +{{ hudBurst }}
            <small v-if="hudBurst > 1">
              {{ $t('pages.main.growth.combo', { count: hudBurst }) }}
            </small>
          </span>
        </div>
      </Transition>
    </div>

    <template v-if="currentRenderer === 'image'">
      <div
        ref="characterStage"
        class="character-stage"
      >
        <div
          ref="imageWheelFeedbackLayer"
          class="wheel-feedback-layer"
          :class="wheelFeedback ? `wheel-feedback-layer--${wheelFeedback}` : undefined"
          @animationend="handleWheelFeedbackEnd"
        >
          <div
            ref="imageInteractionLayer"
            class="interaction-layer"
            :class="interaction ? `interaction-layer--${interaction}` : undefined"
            @animationend="handleAnimationEnd"
          >
            <div
              class="model-layer"
              :class="{ 'model-layer--mirrored': catStore.model.mirror }"
              :style="{
                opacity: effectiveOpacity / 100,
                borderRadius: `${catStore.window.radius}%`,
              }"
            >
              <img
                v-if="imageModel"
                ref="petImage"
                alt="蓝白猫桌宠"
                class="model-fill pet-sprite"
                draggable="false"
                :src="imageModel.src"
              >
            </div>
          </div>
        </div>

        <div
          v-show="!modelStore.modelReady"
          class="model-fill flex items-center justify-center bg-black"
        >
          <span class="text-center text-[10vw] text-[#fff]">
            {{ $t('pages.main.hints.switching') }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.pet-window {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.pet-window img {
  -webkit-user-drag: none;
}

.live2d-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  transform-origin: center;

  &--mirrored {
    transform: scaleX(-1);
  }
}

.live2d-fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.speech-slot {
  position: absolute;
  z-index: 20;
  top: 0;
  right: 4%;
  left: 4%;
  height: 20%;
  pointer-events: none;

  &--live2d {
    top: 2%;
    right: auto;
    left: 2%;
    width: 36%;
    height: 22%;

    .speech-bubble {
      top: 0;
      right: auto;
      left: 0;
      max-width: 100%;
      font-size: clamp(8px, 2.8vw, 15px);
      white-space: normal;

      &::after {
        right: 18%;
        left: auto;
      }
    }
  }
}

.speech-bubble {
  position: absolute;
  top: 9%;
  max-width: 84%;
  padding: 0.58em 0.9em;
  border: max(1px, 0.32vw) solid rgb(43 55 73 / 88%);
  border-radius: 999px;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 0.22em 0.65em rgb(34 50 72 / 20%);
  color: #273447;
  font-size: clamp(8px, 3.8vw, 17px);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;

  &::after {
    position: absolute;
    bottom: -0.42em;
    width: 0.72em;
    height: 0.72em;
    border-right: inherit;
    border-bottom: inherit;
    background: inherit;
    content: '';
    transform: rotate(45deg);
  }

  &--left {
    left: 2%;

    &::after {
      left: 24%;
    }
  }

  &--right {
    right: 2%;

    &::after {
      right: 24%;
    }
  }
}

.hud-slot {
  position: absolute;
  z-index: 24;
  top: 3%;
  right: 4%;
  width: 32%;
  height: 12%;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  pointer-events: none;
}

.interaction-hud {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  justify-content: flex-end;
  color: #26374d;
  font-size: clamp(8px, 3vw, 15px);
  font-weight: 800;
  line-height: 1;

  &__total {
    display: inline-flex;
    min-width: 3.3em;
    align-items: center;
    justify-content: center;
    gap: 0.34em;
    padding: 0.48em 0.72em;
    border: max(1px, 0.24vw) solid rgb(55 72 96 / 78%);
    border-radius: 999px;
    background: rgb(255 255 255 / 92%);
    box-shadow: 0 0.22em 0.62em rgb(31 48 72 / 18%);
    white-space: nowrap;
  }

  &__burst {
    position: absolute;
    top: calc(100% + 0.18em);
    right: 0.28em;
    display: flex;
    align-items: center;
    gap: 0.38em;
    color: #1687c7;
    filter: drop-shadow(0 0.08em 0 rgb(255 255 255 / 90%));
    font-size: 1.12em;
    animation: interaction-burst 700ms cubic-bezier(0.18, 0.75, 0.2, 1) both;
    white-space: nowrap;

    small {
      font-size: 0.58em;
      font-weight: 750;
    }
  }
}

.reward-toast {
  --reward-accent: #69809e;

  display: flex;
  min-width: 100%;
  max-width: 175%;
  align-items: center;
  gap: 0.52em;
  padding: 0.45em 0.62em;
  border: max(1px, 0.3vw) solid var(--reward-accent);
  border-radius: 0.72em;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 0.3em 1em color-mix(in srgb, var(--reward-accent) 32%, transparent);
  color: #26374d;
  font-size: clamp(7px, 2.5vw, 13px);
  line-height: 1.15;

  &--uncommon {
    --reward-accent: #25a66f;
  }

  &--rare {
    --reward-accent: #3389e6;
  }

  &--epic {
    --reward-accent: #9a62db;
  }

  &--legendary {
    --reward-accent: #e49a25;
  }

  &__cover,
  &__icon {
    width: 2.65em;
    height: 2.65em;
    flex: 0 0 auto;
    border-radius: 0.52em;
  }

  &__cover {
    background: #edf6fb;
    object-fit: contain;
  }

  &__icon {
    display: grid;
    place-items: center;
    color: var(--reward-accent);
    font-size: 1.7em;
  }

  &__content {
    display: grid;
    min-width: 0;
    gap: 0.16em;

    small {
      font-size: 0.82em;
    }

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.reward-enter-active,
.reward-leave-active {
  transition:
    opacity 170ms ease,
    transform 200ms cubic-bezier(0.18, 0.75, 0.2, 1);
}

.reward-enter-from,
.reward-leave-to {
  opacity: 0;
  transform: translateY(-0.35em) scale(0.9);
}

.character-stage {
  position: absolute;
  z-index: 1;
  top: 22%;
  right: 0;
  bottom: 0;
  left: 0;
}

.interaction-layer,
.wheel-feedback-layer,
.model-layer {
  position: relative;
  width: 100%;
  height: 100%;
}

.wheel-feedback-layer {
  transform-origin: 50% 92%;
  will-change: transform;

  &--up {
    animation: pet-wheel-nod-up 440ms cubic-bezier(0.22, 0.74, 0.26, 1);
  }

  &--down {
    animation: pet-wheel-nod-down 440ms cubic-bezier(0.22, 0.74, 0.26, 1);
  }
}

.interaction-layer {
  transform-origin: 50% 100%;
  will-change: transform;

  &--jump {
    animation: pet-jump 620ms cubic-bezier(0.22, 0.74, 0.26, 1);
  }

  &--squash {
    animation: pet-squash 560ms cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  &--shake {
    animation: pet-shake 520ms ease-in-out;
  }
}

.live2d-character-layer {
  position: absolute;
  inset: 0;

  &.interaction-layer--jump {
    animation-name: pet-jump-live2d;
  }
}

.model-layer {
  overflow: hidden;
  transform-origin: center;

  &--mirrored {
    transform: scaleX(-1);
  }
}

.model-fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.pet-sprite {
  box-sizing: border-box;
  padding: 0 6% 2%;
  object-fit: contain;
  object-position: center bottom;
}

.bubble-enter-active,
.bubble-leave-active {
  transition:
    opacity 150ms ease,
    transform 180ms ease;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(0.35em) scale(0.92);
}

@keyframes interaction-burst {
  0% {
    opacity: 0;
    transform: translateY(0.35em) scale(0.82);
  }
  22% {
    opacity: 1;
    transform: translateY(0) scale(1.08);
  }
  72% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-0.55em) scale(0.96);
  }
}

@keyframes pet-jump {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  18% {
    transform: translateY(1.8%) scale(1.035, 0.965);
  }
  48% {
    transform: translateY(-9%) scale(0.985, 1.02);
  }
  72% {
    transform: translateY(0) scale(1.025, 0.975);
  }
  86% {
    transform: translateY(-1.5%) scale(0.995, 1.008);
  }
}

@keyframes pet-jump-live2d {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  18% {
    transform: translateY(0.8%) scale(1.02, 0.98);
  }
  48% {
    transform: translateY(-2.6%) scale(0.99, 1.015);
  }
  72% {
    transform: translateY(0) scale(1.015, 0.985);
  }
  86% {
    transform: translateY(-0.5%) scale(0.997, 1.005);
  }
}

@keyframes pet-squash {
  0%,
  100% {
    transform: scale(1);
  }
  24% {
    transform: scale(1.055, 0.76);
  }
  52% {
    transform: scale(0.965, 1.085);
  }
  74% {
    transform: scale(1.025, 0.94);
  }
  88% {
    transform: scale(0.992, 1.018);
  }
}

@keyframes pet-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0);
  }
  15% {
    transform: translateX(-2.4%) rotate(-2deg);
  }
  30% {
    transform: translateX(2.4%) rotate(2deg);
  }
  45% {
    transform: translateX(-1.8%) rotate(-1.5deg);
  }
  60% {
    transform: translateX(1.8%) rotate(1.5deg);
  }
  75% {
    transform: translateX(-0.9%) rotate(-0.7deg);
  }
  88% {
    transform: translateX(0.6%) rotate(0.4deg);
  }
}

@keyframes pet-wheel-nod-up {
  0%,
  100% {
    transform: translateY(0) rotate(0);
  }
  25% {
    transform: translateY(-1.2%) rotate(-1.5deg);
  }
  50% {
    transform: translateY(0.45%) rotate(0.85deg);
  }
  74% {
    transform: translateY(-0.35%) rotate(-0.4deg);
  }
}

@keyframes pet-wheel-nod-down {
  0%,
  100% {
    transform: translateY(0) rotate(0);
  }
  25% {
    transform: translateY(1.2%) rotate(1.5deg);
  }
  50% {
    transform: translateY(-0.45%) rotate(-0.85deg);
  }
  74% {
    transform: translateY(0.35%) rotate(0.4deg);
  }
}
</style>
