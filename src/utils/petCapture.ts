import { Image } from '@tauri-apps/api/image'
import { join, pictureDir } from '@tauri-apps/api/path'
import { writeImage } from '@tauri-apps/plugin-clipboard-manager'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

export type PetCaptureSource = HTMLCanvasElement | HTMLImageElement

export interface PetCaptureOptions {
  mirror?: boolean
}

function getSourceSize(source: PetCaptureSource) {
  const width = source instanceof HTMLImageElement
    ? source.naturalWidth
    : source.width
  const height = source instanceof HTMLImageElement
    ? source.naturalHeight
    : source.height

  if (width <= 0 || height <= 0) {
    throw new Error('桌宠图像尚未加载完成，无法复制或保存')
  }

  return { width, height }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('当前环境无法创建图像画布')
  }

  return context
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? `：${error.message}` : ''
}

function readImageData(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  try {
    return context.getImageData(0, 0, width, height)
  } catch (error) {
    throw new Error(
      `无法读取桌宠图像；素材可能来自未允许跨域访问的地址（tainted canvas）${errorMessage(error)}`,
    )
  }
}

function cropTransparentBounds(
  source: HTMLCanvasElement,
  imageData: ImageData,
) {
  const { width, height } = source
  const pixels = imageData.data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3]

      if (alpha === 0) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    throw new Error('桌宠图像当前完全透明，请稍后重试')
  }

  const croppedWidth = maxX - minX + 1
  const croppedHeight = maxY - minY + 1

  if (croppedWidth === width && croppedHeight === height) {
    return source
  }

  const canvas = createCanvas(croppedWidth, croppedHeight)
  const context = getContext(canvas)
  context.drawImage(
    source,
    minX,
    minY,
    croppedWidth,
    croppedHeight,
    0,
    0,
    croppedWidth,
    croppedHeight,
  )
  return canvas
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('画布无法转换为 PNG 图像'))
      }, 'image/png')
    } catch (error) {
      reject(new Error(`画布无法转换为 PNG 图像${errorMessage(error)}`))
    }
  })
}

export function renderPetImage(
  source: PetCaptureSource,
  options: PetCaptureOptions = {},
) {
  const { width, height } = getSourceSize(source)
  const canvas = createCanvas(width, height)
  const context = getContext(canvas)

  context.save()

  if (options.mirror) {
    context.translate(width, 0)
    context.scale(-1, 1)
  }

  try {
    context.drawImage(source, 0, 0, width, height)
  } catch (error) {
    throw new Error(`无法将桌宠渲染到画布${errorMessage(error)}`)
  } finally {
    context.restore()
  }

  const imageData = readImageData(context, width, height)
  return cropTransparentBounds(canvas, imageData)
}

export async function copyPetImage(
  source: PetCaptureSource,
  options: PetCaptureOptions = {},
) {
  const canvas = renderPetImage(source, options)
  const context = getContext(canvas)
  const imageData = readImageData(context, canvas.width, canvas.height)
  const rgba = new Uint8Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength,
  )
  const image = await Image.new(rgba, canvas.width, canvas.height)

  try {
    await writeImage(image)
  } finally {
    await image.close().catch(() => undefined)
  }
}

export async function savePetImage(
  source: PetCaptureSource,
  options: PetCaptureOptions = {},
) {
  const canvas = renderPetImage(source, options)
  const blob = await canvasToPngBlob(canvas)
  const defaultPath = await join(await pictureDir(), 'BlueWhitePet.png')
  const selectedPath = await save({
    title: '保存桌宠图片',
    defaultPath,
    filters: [
      {
        name: 'PNG 图片',
        extensions: ['png'],
      },
    ],
  })

  if (!selectedPath) {
    return null
  }

  const targetPath = selectedPath.toLowerCase().endsWith('.png')
    ? selectedPath
    : `${selectedPath}.png`
  await writeFile(targetPath, new Uint8Array(await blob.arrayBuffer()))
  return targetPath
}
