import { emit } from '@tauri-apps/api/event'
import { CheckMenuItem, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import { exit, relaunch } from '@tauri-apps/plugin-process'
import { range } from 'es-toolkit'
import { useI18n } from 'vue-i18n'

import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import { positionMainWindow, showWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { isMac } from '@/utils/platform'

export function useAppMenu() {
  const catStore = useCatStore()
  const { t } = useI18n()

  const getScaleMenuItems = async () => {
    const options = range(50, 151, 25)

    const items = options.map((item) => {
      return CheckMenuItem.new({
        text: `${item}%`,
        checked: catStore.window.scale === item,
        action: () => {
          catStore.window.scale = item
        },
      })
    })

    if (!options.includes(catStore.window.scale)) {
      items.unshift(CheckMenuItem.new({
        text: `${catStore.window.scale}%`,
        checked: true,
        enabled: false,
      }))
    }

    return Promise.all(items)
  }

  const getOpacityMenuItems = async () => {
    const options = range(25, 101, 25)

    const items = options.map((item) => {
      return CheckMenuItem.new({
        text: `${item}%`,
        checked: catStore.window.opacity === item,
        action: () => {
          catStore.window.opacity = item
        },
      })
    })

    if (!options.includes(catStore.window.opacity)) {
      items.unshift(CheckMenuItem.new({
        text: `${catStore.window.opacity}%`,
        checked: true,
        enabled: false,
      }))
    }

    return Promise.all(items)
  }

  const getPositionMenuItems = () => {
    const placements = [
      ['topLeft', 'top-left'],
      ['topRight', 'top-right'],
      ['bottomLeft', 'bottom-left'],
      ['bottomRight', 'bottom-right'],
      ['center', 'center'],
      ['nextMonitor', 'next-monitor'],
    ] as const

    return Promise.all(placements.map(([label, placement]) => {
      return MenuItem.new({
        text: t(`composables.useAppMenu.labels.${label}`),
        action: () => positionMainWindow(placement),
      })
    }))
  }

  const getBaseMenu = async () => {
    return await Promise.all([
      MenuItem.new({
        text: t('composables.useAppMenu.labels.preference'),
        accelerator: isMac ? 'Cmd+,' : '',
        action: () => showWindow(WINDOW_LABEL.PREFERENCE),
      }),
      MenuItem.new({
        text: catStore.window.visible ? t('composables.useAppMenu.labels.hideCat') : t('composables.useAppMenu.labels.showCat'),
        action: () => {
          catStore.window.visible = !catStore.window.visible
        },
      }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      CheckMenuItem.new({
        text: t('composables.useAppMenu.labels.passThrough'),
        checked: catStore.window.passThrough,
        action: () => {
          catStore.window.passThrough = !catStore.window.passThrough
        },
      }),
      CheckMenuItem.new({
        text: t('composables.useAppMenu.labels.gameMode'),
        checked: catStore.window.gameMode,
        action: () => {
          catStore.window.gameMode = !catStore.window.gameMode
        },
      }),
      Submenu.new({
        text: t('composables.useAppMenu.labels.windowSize'),
        items: await getScaleMenuItems(),
      }),
      Submenu.new({
        text: t('composables.useAppMenu.labels.opacity'),
        items: await getOpacityMenuItems(),
      }),
      Submenu.new({
        text: t('composables.useAppMenu.labels.windowPosition'),
        items: await getPositionMenuItems(),
      }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      MenuItem.new({
        text: t('composables.useAppMenu.labels.copyPetImage'),
        action: () => emit(LISTEN_KEY.COPY_PET_IMAGE),
      }),
      MenuItem.new({
        text: t('composables.useAppMenu.labels.savePetImage'),
        action: () => emit(LISTEN_KEY.SAVE_PET_IMAGE),
      }),
    ])
  }

  const getExitMenu = async () => {
    return await Promise.all([
      MenuItem.new({
        text: t('composables.useAppMenu.labels.restartApp'),
        action: relaunch,
      }),
      MenuItem.new({
        text: t('composables.useAppMenu.labels.quitApp'),
        accelerator: isMac ? 'Cmd+Q' : '',
        action: () => exit(0),
      }),
    ])
  }

  return {
    getBaseMenu,
    getExitMenu,
  }
}
