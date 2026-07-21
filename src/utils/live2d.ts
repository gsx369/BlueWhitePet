import type { MotionInfo } from 'easy-live2d'

import { convertFileSrc } from '@tauri-apps/api/core'
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { Config, CubismSetting, Live2DSprite, Priority } from 'easy-live2d'
import { groupBy } from 'es-toolkit/compat'
import JSON5 from 'json5'
import { Application, Ticker } from 'pixi.js'

import type { ModelSize } from '@/composables/useModel'

import { i18n } from '@/locales'

import { join } from './path'

Config.MouseFollow = false
const MODEL_LOAD_TIMEOUT = 15_000

function splitModelPath(value: string, label: string) {
  if (!value || value.startsWith('/') || value.startsWith('\\') || /^[a-z]:[\\/]/i.test(value)) {
    throw new Error(`Invalid ${label} path: ${value}`)
  }

  return value.split(/[\\/]/).filter(segment => segment && segment !== '.')
}

function resolveModelAssetPath(root: string, baseSegments: string[], value: string) {
  const segments = [...baseSegments]

  for (const segment of splitModelPath(value, 'model asset')) {
    if (segment === '..') {
      if (segments.length === 0) throw new Error(`Model asset escapes its package: ${value}`)

      segments.pop()
    } else {
      segments.push(segment)
    }
  }

  return join(root, ...segments)
}

class Live2d {
  private app: Application | null = null
  public model: Live2DSprite | null = null

  constructor() { }

  private initApp() {
    if (this.app) return

    const view = document.getElementById('live2dCanvas') as HTMLCanvasElement
    this.app = new Application()

    return this.app.init({
      view,
      resizeTo: window,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: devicePixelRatio,
    })
  }

  public async load(path: string, entry?: string, shouldCommit: () => boolean = () => true) {
    await this.initApp()

    this.destroy()

    let modelFileName = entry

    if (!modelFileName) {
      const files = await readDir(path)

      modelFileName = files.find(file => file.name.endsWith('.model3.json'))?.name
    }

    if (!modelFileName) throw new Error(i18n.global.t('utils.live2d.hints.notFound'))

    const modelPathSegments = splitModelPath(modelFileName, 'model entry')

    if (modelPathSegments.includes('..')) {
      throw new Error(`Model entry escapes its package: ${modelFileName}`)
    }

    const modelDirectorySegments = modelPathSegments.slice(0, -1)
    const modelPath = join(path, ...modelPathSegments)

    const modelJSON = JSON5.parse(await readTextFile(modelPath))

    const modelSetting = new CubismSetting({
      modelJSON,
    })

    modelSetting.redirectPath(({ file }) => {
      return convertFileSrc(resolveModelAssetPath(path, modelDirectorySegments, file))
    })

    const model = new Live2DSprite({
      modelSetting,
      ticker: Ticker.shared,
    })

    this.app?.stage.addChild(model)

    let timeout: ReturnType<typeof setTimeout> | undefined

    try {
      await Promise.race([
        model.ready,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Live2D model loading timed out')), MODEL_LOAD_TIMEOUT)
        }),
      ])
    } catch (error) {
      model.destroy()
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (!shouldCommit()) {
      model.destroy()
      throw new Error('Live2D model load cancelled')
    }

    this.model = model

    const { width, height } = model

    const motions = groupBy(model.getMotions(), 'group')
    const expressions = model.getExpressions()

    return {
      width,
      height,
      motions,
      expressions,
    }
  }

  public destroy() {
    if (!this.model) return

    this.model?.destroy()

    this.model = null
  }

  public resizeModel(modelSize: ModelSize) {
    if (!this.model) return

    const { width, height } = modelSize
    const scaleX = innerWidth / width
    const scaleY = innerHeight / height
    const scale = Math.min(scaleX, scaleY)

    this.model.scale.set(scale)
    this.model.x = innerWidth / 2
    this.model.y = innerHeight / 2
    this.model.anchor.set(0.5)
  }

  public startMotion(motion: MotionInfo) {
    return this.model?.startMotion({
      ...motion,
      priority: Priority.Normal,
    })
  }

  public setExpression(index: number) {
    return this.model?.setExpression({ index })
  }

  public getParameterValueRange(id: string) {
    return this.model?.getParameterValueRangeById(id)
  }

  public setParameterValue(id: string, value: number | boolean) {
    return this.model?.setParameterValueById(id, Number(value))
  }

  public setMotionSoundEnabled(enabled: boolean) {
    Config.MotionSound = enabled
  }

  public setMaxFPS(fps: number) {
    Ticker.shared.maxFPS = fps
  }

  public captureCanvas() {
    if (!this.app || !this.model) return

    // Pixi's extract system renders into an intermediate target before reading
    // pixels, so capture works even when WebGL preserveDrawingBuffer is false.
    return this.app.renderer.extract.canvas({
      target: this.app.stage,
      resolution: this.app.renderer.resolution,
      clearColor: [0, 0, 0, 0],
      antialias: true,
    }) as HTMLCanvasElement
  }
}

const live2d = new Live2d()

export default live2d
