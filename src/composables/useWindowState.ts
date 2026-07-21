import type { Event } from '@tauri-apps/api/event'

import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { useDebounceFn } from '@vueuse/core'
import { isNumber } from 'es-toolkit/compat'
import { onMounted, ref, watch } from 'vue'

import { WINDOW_LABEL } from '@/constants'
import { useAppStore } from '@/stores/app'
import { useCatStore } from '@/stores/cat'

export type WindowState = Record<string, Partial<PhysicalPosition & PhysicalSize> | undefined>

const appWindow = getCurrentWebviewWindow()
const { label } = appWindow

export function useWindowState() {
  const appStore = useAppStore()
  const catStore = useCatStore()
  const isRestored = ref(false)

  onMounted(() => {
    appWindow.onMoved(onChange)

    appWindow.onResized(onChange)

    appWindow.onScaleChanged(clampToMonitor)
  })

  const clampToMonitor = useDebounceFn(async () => {
    if (label !== WINDOW_LABEL.MAIN || !catStore.window.keepInScreen) return

    const [monitors, windowSize, windowPos] = await Promise.all([
      availableMonitors(),
      appWindow.outerSize(),
      appWindow.outerPosition(),
    ])

    if (monitors.length === 0) return

    const windowCenter = {
      x: windowPos.x + windowSize.width / 2,
      y: windowPos.y + windowSize.height / 2,
    }
    const monitor = monitors.find(({ position, size }) => {
      return windowCenter.x >= position.x
        && windowCenter.x < position.x + size.width
        && windowCenter.y >= position.y
        && windowCenter.y < position.y + size.height
    }) ?? monitors.reduce((nearest, candidate) => {
      const nearestCenterX = nearest.position.x + nearest.size.width / 2
      const nearestCenterY = nearest.position.y + nearest.size.height / 2
      const candidateCenterX = candidate.position.x + candidate.size.width / 2
      const candidateCenterY = candidate.position.y + candidate.size.height / 2
      const nearestDistance = (windowCenter.x - nearestCenterX) ** 2
        + (windowCenter.y - nearestCenterY) ** 2
      const candidateDistance = (windowCenter.x - candidateCenterX) ** 2
        + (windowCenter.y - candidateCenterY) ** 2

      return candidateDistance < nearestDistance ? candidate : nearest
    })
    const { position: monitorPos, size: monitorSize } = monitor.workArea

    const minX = monitorPos.x
    const maxX = monitorPos.x + monitorSize.width - windowSize.width
    const minY = monitorPos.y
    const maxY = monitorPos.y + monitorSize.height - windowSize.height

    const clampedX = maxX >= minX
      ? Math.max(minX, Math.min(windowPos.x, maxX))
      : minX + (monitorSize.width - windowSize.width) / 2
    const clampedY = maxY >= minY
      ? Math.max(minY, Math.min(windowPos.y, maxY))
      : minY + (monitorSize.height - windowSize.height) / 2

    if (clampedX === windowPos.x && clampedY === windowPos.y) return

    return appWindow.setPosition(new PhysicalPosition(Math.round(clampedX), Math.round(clampedY)))
  }, 500)

  watch(() => catStore.window.keepInScreen, clampToMonitor)

  const onChange = async (event: Event<PhysicalPosition | PhysicalSize>) => {
    const minimized = await appWindow.isMinimized()

    if (minimized) return

    appStore.windowState[label] ??= {}

    Object.assign(appStore.windowState[label], event.payload)

    clampToMonitor()
  }

  const restoreState = async () => {
    const { x, y, width, height } = appStore.windowState[label] ?? {}

    if (isNumber(x) && isNumber(y)) {
      const monitors = await availableMonitors()

      const monitor = monitors.find((monitor) => {
        const { position, size } = monitor

        const inBoundsX = x >= position.x && x <= position.x + size.width
        const inBoundsY = y >= position.y && y <= position.y + size.height

        return inBoundsX && inBoundsY
      })

      if (monitor) {
        await appWindow.setPosition(new PhysicalPosition(x, y))
      }
    }

    if (width && height) {
      await appWindow.setSize(new PhysicalSize(width, height))
    }

    isRestored.value = true

    clampToMonitor()
  }

  return {
    isRestored,
    restoreState,
  }
}
