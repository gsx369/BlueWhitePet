<script setup lang="ts">
import type { MotionInfo } from 'easy-live2d'

import { convertFileSrc } from '@tauri-apps/api/core'
import { PhysicalSize } from '@tauri-apps/api/dpi'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { sep } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { round } from 'es-toolkit'
import { nth } from 'es-toolkit/compat'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import { useAppMenu } from '@/composables/useAppMenu'
import { useDevice } from '@/composables/useDevice'
import { useGamepad } from '@/composables/useGamepad'
import { useModel } from '@/composables/useModel'
import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY } from '@/constants'
import { hideWindow, setAlwaysOnTop, setTaskbarVisibility, showWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { useGeneralStore } from '@/stores/general.ts'
import { useModelStore } from '@/stores/model'
import { isImage } from '@/utils/is'
import live2d from '@/utils/live2d'
import { join } from '@/utils/path'
import { isWindows } from '@/utils/platform'
import { clearObject } from '@/utils/shared'

const { startListening } = useDevice()
const appWindow = getCurrentWebviewWindow()
const { modelSize, handleLoad, handleDestroy, handleResize, handleKeyChange } = useModel()
const catStore = useCatStore()
const { getBaseMenu, getExitMenu } = useAppMenu()
const modelStore = useModelStore()
const generalStore = useGeneralStore()
const resizing = ref(false)
const backgroundImagePath = ref<string>()
const { stickActive } = useGamepad()
const interactionLayerRef = useTemplateRef<HTMLElement>('interactionLayer')
const characterStageRef = useTemplateRef<HTMLElement>('characterStage')
const interaction = ref<Interaction>()
const bubbleText = ref('')
const bubbleSide = ref<BubbleSide>('left')
const currentRenderer = computed(() => modelStore.currentModel?.renderer ?? 'live2d')
const imageModel = computed(() => currentRenderer.value === 'image' ? modelStore.currentModel?.image : undefined)

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

type Interaction = typeof interactions[number]
type BubbleSide = 'left' | 'right'

interface PointerStart {
  x: number
  y: number
}

const DRAG_THRESHOLD = 6
const DRAG_DELAY = 180
const WHEEL_THRESHOLD = 36
const SCALE_STEP = 5

let interactionIndex = 0
let lastDialogueIndex = -1
let pointerStart: PointerStart | undefined
let dragTimer: ReturnType<typeof setTimeout> | undefined
let bubbleTimer: ReturnType<typeof setTimeout> | undefined
let wheelResetTimer: ReturnType<typeof setTimeout> | undefined
let wheelDelta = 0

onMounted(startListening)

onUnmounted(() => {
  handleDestroy()
  clearTimeout(dragTimer)
  clearTimeout(bubbleTimer)
  clearTimeout(wheelResetTimer)
})

const debouncedResize = useDebounceFn(async () => {
  await handleResize()

  resizing.value = false
}, 100)

useEventListener('resize', () => {
  resizing.value = true

  debouncedResize()
})

watch(() => modelStore.currentModel, async (model) => {
  if (!model) return

  await handleLoad()

  clearObject([modelStore.supportKeys, modelStore.pressedKeys])

  if (model.renderer === 'image') {
    backgroundImagePath.value = undefined
    modelStore.modelReady = true

    return
  }

  const path = join(model.path, 'resources', 'background.png')

  const existed = await exists(path)

  backgroundImagePath.value = existed ? convertFileSrc(path) : void 0

  const resourcePath = join(model.path, 'resources')
  const groups = ['left-keys', 'right-keys']

  for await (const groupName of groups) {
    const groupDir = join(resourcePath, groupName)
    const files = await readDir(groupDir).catch(() => [])
    const imageFiles = files.filter(file => isImage(file.name))

    for (const file of imageFiles) {
      const fileName = file.name.split('.')[0]

      modelStore.supportKeys[fileName] = join(groupDir, file.name)
    }
  }

  modelStore.modelReady = true
}, { deep: true, immediate: true })

watch([() => catStore.window.scale, modelSize], async ([scale, modelSize]) => {
  if (!modelSize) return

  const { width, height } = modelSize

  appWindow.setSize(
    new PhysicalSize({
      width: Math.round(width * (scale / 100)),
      height: Math.round(height * (scale / 100)),
    }),
  )
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

watch(() => catStore.window.passThrough, (value) => {
  appWindow.setIgnoreCursorEvents(value)
}, { immediate: true })

watch(() => catStore.window.alwaysOnTop, setAlwaysOnTop, { immediate: true })

watch(() => generalStore.app.taskbarVisible, setTaskbarVisibility, { immediate: true })

watch(() => catStore.model.motionSound, live2d.setMotionSoundEnabled, { immediate: true })

watch(() => catStore.model.maxFPS, live2d.setMaxFPS, { immediate: true })

useTauriListen<MotionInfo>(LISTEN_KEY.START_MOTION, ({ payload }) => {
  live2d.startMotion(payload)
})

useTauriListen<number>(LISTEN_KEY.SET_EXPRESSION, ({ payload }) => {
  live2d.setExpression(payload)
})

function clearDragTimer() {
  clearTimeout(dragTimer)
  dragTimer = undefined
}

function startWindowDrag() {
  if (!pointerStart) return

  pointerStart = undefined
  clearDragTimer()
  appWindow.startDragging()
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) return

  pointerStart = {
    x: event.clientX,
    y: event.clientY,
  }

  clearDragTimer()
  dragTimer = setTimeout(startWindowDrag, DRAG_DELAY)
}

function handlePointerMove(event: PointerEvent) {
  handleMouseMove(event)

  if (!pointerStart || (event.buttons & 1) === 0) return

  const distance = Math.hypot(
    event.clientX - pointerStart.x,
    event.clientY - pointerStart.y,
  )

  if (distance < DRAG_THRESHOLD) return

  startWindowDrag()
}

function handlePointerUp(event: PointerEvent) {
  if (event.button !== 0 || !pointerStart) return

  const start = pointerStart

  pointerStart = undefined
  clearDragTimer()

  const distance = Math.hypot(
    event.clientX - start.x,
    event.clientY - start.y,
  )

  if (distance >= DRAG_THRESHOLD || !isInsideCharacterStage(event.clientX, event.clientY)) return

  triggerInteraction()
}

function handlePointerCancel() {
  pointerStart = undefined
  clearDragTimer()
}

function isInsideCharacterStage(x: number, y: number) {
  const rect = characterStageRef.value?.getBoundingClientRect()

  if (!rect) return false

  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

async function triggerInteraction() {
  const nextInteraction = interactions[interactionIndex % interactions.length]

  interactionIndex += 1
  interaction.value = undefined

  await nextTick()

  // Force a style flush so repeated clicks restart the same CSS animation cleanly.
  void interactionLayerRef.value?.offsetWidth
  interaction.value = nextInteraction

  const choices = dialogues
    .map((text, index) => ({ text, index }))
    .filter(({ index }) => index !== lastDialogueIndex)
  const choice = choices[Math.floor(Math.random() * choices.length)]

  lastDialogueIndex = choice.index
  bubbleText.value = choice.text
  bubbleSide.value = Math.random() < 0.5 ? 'left' : 'right'

  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubbleText.value = ''
  }, 2400)
}

function handleAnimationEnd(event: AnimationEvent) {
  if (event.target !== event.currentTarget) return

  interaction.value = undefined
}

async function handleContextmenu(event: MouseEvent) {
  event.preventDefault()

  if (event.shiftKey) return

  const menu = await Menu.new({
    items: [
      ...await getBaseMenu(),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      ...await getExitMenu(),
    ],
  })

  // Temporarily disable always-on-top on Windows so the context menu is not covered
  if (isWindows && catStore.window.alwaysOnTop) {
    setAlwaysOnTop(false)
  }

  await menu.popup()

  // Restore always-on-top after the menu is closed
  if (!isWindows || !catStore.window.alwaysOnTop) return

  setAlwaysOnTop(true)
}

function handleMouseMove(event: MouseEvent) {
  const { buttons, shiftKey, movementX, movementY } = event

  if (buttons !== 2 || !shiftKey) return

  const delta = (movementX + movementY) * 0.5
  const nextScale = Math.max(10, Math.min(catStore.window.scale + delta, 500))

  catStore.window.scale = round(nextScale)
}

function handleWheel(event: WheelEvent) {
  wheelDelta += event.deltaY

  clearTimeout(wheelResetTimer)
  wheelResetTimer = setTimeout(() => {
    wheelDelta = 0
  }, 120)

  if (Math.abs(wheelDelta) < WHEEL_THRESHOLD) return

  const direction = wheelDelta < 0 ? 1 : -1
  const nextScale = Math.max(40, Math.min(catStore.window.scale + direction * SCALE_STEP, 300))

  catStore.window.scale = round(nextScale)
  wheelDelta = 0
}
</script>

<template>
  <div
    class="pet-window"
    @contextmenu="handleContextmenu"
    @pointercancel="handlePointerCancel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @wheel.prevent.stop="handleWheel"
  >
    <div class="speech-slot">
      <Transition name="bubble">
        <div
          v-if="bubbleText"
          class="speech-bubble"
          :class="`speech-bubble--${bubbleSide}`"
        >
          {{ bubbleText }}
        </div>
      </Transition>
    </div>

    <div
      ref="characterStage"
      class="character-stage"
    >
      <div
        ref="interactionLayer"
        class="interaction-layer"
        :class="interaction ? `interaction-layer--${interaction}` : undefined"
        @animationend="handleAnimationEnd"
      >
        <div
          class="model-layer"
          :class="{ 'model-layer--mirrored': catStore.model.mirror }"
          :style="{
            opacity: catStore.window.opacity / 100,
            borderRadius: `${catStore.window.radius}%`,
          }"
        >
          <img
            v-if="backgroundImagePath && currentRenderer === 'live2d'"
            class="model-fill object-cover"
            :src="backgroundImagePath"
          >

          <canvas
            v-show="currentRenderer === 'live2d'"
            id="live2dCanvas"
            class="model-fill"
          />

          <img
            v-if="imageModel"
            alt="蓝白猫桌宠"
            class="model-fill pet-sprite"
            :src="imageModel.src"
          >

          <template v-if="currentRenderer === 'live2d'">
            <img
              v-for="path in modelStore.pressedKeys"
              :key="path"
              class="model-fill object-cover"
              :src="convertFileSrc(path)"
            >
          </template>

          <div
            v-show="resizing || !modelStore.modelReady"
            class="model-fill flex items-center justify-center bg-black"
          >
            <span class="text-center text-[10vw] text-[#fff]">
              {{ resizing ? $t('pages.main.hints.redrawing') : $t('pages.main.hints.switching') }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pet-window {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  touch-action: none;
}

.speech-slot {
  position: absolute;
  z-index: 20;
  top: 0;
  right: 4%;
  left: 4%;
  height: 20%;
  pointer-events: none;
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

.character-stage {
  position: absolute;
  z-index: 1;
  top: 22%;
  right: 0;
  bottom: 0;
  left: 0;
}

.interaction-layer,
.model-layer {
  position: relative;
  width: 100%;
  height: 100%;
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
</style>
