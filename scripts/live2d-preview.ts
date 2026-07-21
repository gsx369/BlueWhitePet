import { Config, Live2DSprite } from 'easy-live2d'
import { Application, Ticker } from 'pixi.js'

Config.MouseFollow = false
Config.MotionSound = false

const canvas = document.querySelector<HTMLCanvasElement>('#live2d')!
const app = new Application()

await app.init({
  canvas,
  resizeTo: window,
  backgroundAlpha: 0,
  autoDensity: true,
  resolution: Math.max(window.devicePixelRatio || 1, 1),
})

const sprite = new Live2DSprite({
  modelPath: '/src-tauri/assets/models/blue-white-a-standard/cat.model3.json',
  ticker: Ticker.shared,
})

app.stage.addChild(sprite)
await sprite.ready

const naturalWidth = sprite.width
const naturalHeight = sprite.height
const scale = Math.min(window.innerWidth / naturalWidth, window.innerHeight / naturalHeight)

sprite.scale.set(scale)
sprite.anchor.set(0.5)
sprite.x = window.innerWidth / 2
sprite.y = window.innerHeight / 2

document.documentElement.dataset.ready = 'true'
document.documentElement.dataset.modelSize = `${naturalWidth}x${naturalHeight}`
