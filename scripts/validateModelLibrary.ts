import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, posix, relative, resolve, sep, win32 } from 'node:path'
import process from 'node:process'

type JsonRecord = Record<string, unknown>

interface PngSize {
  height: number
  width: number
}

const modelsRoot = resolve('src-tauri/assets/models')
const errors: string[] = []
const presetKeys = new Map<string, string>()
const defaultModels: string[] = []
const pngSizes = new Map<string, PngSize>()
const textureSizes = new Map<string, Map<string, PngSize & { file: string }>>()

function report(message: string) {
  errors.push(message)
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJson(file: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    report(`${label}: JSON 解析失败（${String(error)}）`)
  }
}

function resolveRelativeFile(base: string, value: unknown, label: string): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    report(`${label}: 必须是非空相对路径`)
    return
  }

  const segments = value.replaceAll('\\', '/').split('/')

  if (posix.isAbsolute(value) || win32.isAbsolute(value) || segments.includes('..')) {
    report(`${label}: 不允许绝对路径或 ..（${value}）`)
    return
  }

  const file = resolve(base, ...segments)
  const fromBase = relative(base, file)

  if (fromBase === '..' || fromBase.startsWith(`..${sep}`)) {
    report(`${label}: 路径越过模型目录（${value}）`)
    return
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    report(`${label}: 文件不存在（${value}）`)
    return
  }

  if (extname(file).toLowerCase() === '.png') validatePng(file, label)

  return file
}

function validatePng(file: string, label: string): PngSize | undefined {
  const cached = pngSizes.get(file)

  if (cached) return cached

  try {
    const header = readFileSync(file).subarray(0, 24)
    const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    const hasSignature = header.length >= 24 && signature.every((byte, index) => header[index] === byte)
    const hasIhdr = hasSignature
      && header.readUInt32BE(8) === 13
      && header.toString('ascii', 12, 16) === 'IHDR'

    if (!hasIhdr) {
      report(`${label}: PNG 缺少有效的 IHDR（${file}）`)
      return
    }

    const size = {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    }

    if (size.width === 0 || size.height === 0) {
      report(`${label}: PNG 尺寸必须大于 0（${file}）`)
      return
    }

    pngSizes.set(file, size)
    return size
  } catch (error) {
    report(`${label}: PNG 读取失败（${String(error)}）`)
  }
}

function validateOptionalReference(
  references: JsonRecord,
  key: string,
  model3Directory: string,
  label: string,
) {
  if (references[key] === undefined) return

  resolveRelativeFile(model3Directory, references[key], `${label}.${key}`)
}

function validateModel3(file: string, presetKey: string, modelLabel: string) {
  const value = readJson(file, `${modelLabel}.entry`)

  if (!isRecord(value) || !isRecord(value.FileReferences)) {
    report(`${modelLabel}.entry: 缺少 FileReferences 对象`)
    return
  }

  const references = value.FileReferences
  const model3Directory = dirname(file)

  resolveRelativeFile(model3Directory, references.Moc, `${modelLabel}.FileReferences.Moc`)

  const textures = references.Textures
  const modelTextures = new Map<string, PngSize & { file: string }>()

  if (!Array.isArray(textures) || textures.length === 0) {
    report(`${modelLabel}.FileReferences.Textures: 必须是非空数组`)
  } else {
    textures.forEach((texture, index) => {
      const textureLabel = `${modelLabel}.FileReferences.Textures[${index}]`
      const textureFile = resolveRelativeFile(model3Directory, texture, textureLabel)

      if (!textureFile || extname(textureFile).toLowerCase() !== '.png') {
        if (textureFile) report(`${textureLabel}: Live2D 纹理必须是 PNG`)
        return
      }

      const size = validatePng(textureFile, textureLabel)
      if (!size) return

      const name = basename(textureFile).toLowerCase()

      if (modelTextures.has(name)) {
        report(`${textureLabel}: 纹理文件名重复（${name}）`)
        return
      }

      modelTextures.set(name, { ...size, file: textureFile })
    })
  }

  textureSizes.set(presetKey, modelTextures)

  for (const key of ['DisplayInfo', 'Physics', 'Pose', 'UserData']) {
    validateOptionalReference(references, key, model3Directory, modelLabel)
  }

  if (references.Expressions !== undefined) {
    if (!Array.isArray(references.Expressions)) {
      report(`${modelLabel}.FileReferences.Expressions: 必须是数组`)
    } else {
      references.Expressions.forEach((expression, index) => {
        const expressionLabel = `${modelLabel}.FileReferences.Expressions[${index}].File`

        if (!isRecord(expression)) {
          report(`${expressionLabel}: 表情项必须是对象`)
          return
        }

        resolveRelativeFile(model3Directory, expression.File, expressionLabel)
      })
    }
  }

  if (references.Motions !== undefined) {
    if (!isRecord(references.Motions)) {
      report(`${modelLabel}.FileReferences.Motions: 必须是对象`)
    } else {
      for (const [group, motions] of Object.entries(references.Motions)) {
        if (!Array.isArray(motions)) {
          report(`${modelLabel}.FileReferences.Motions.${group}: 必须是数组`)
          continue
        }

        motions.forEach((motion, index) => {
          const motionLabel = `${modelLabel}.FileReferences.Motions.${group}[${index}]`

          if (!isRecord(motion)) {
            report(`${motionLabel}: 动作项必须是对象`)
            return
          }

          resolveRelativeFile(model3Directory, motion.File, `${motionLabel}.File`)

          if (motion.Sound !== undefined) {
            resolveRelativeFile(model3Directory, motion.Sound, `${motionLabel}.Sound`)
          }
        })
      }
    }
  }
}

function validateManifest(modelDirectory: string, folderName: string) {
  const manifestFile = join(modelDirectory, 'pet-model.json')
  const modelLabel = `模型 ${folderName}`

  if (!existsSync(manifestFile)) {
    report(`${modelLabel}: 缺少 pet-model.json`)
    return
  }

  const manifest = readJson(manifestFile, `${modelLabel}.pet-model.json`)

  if (!isRecord(manifest)) {
    report(`${modelLabel}.pet-model.json: 根节点必须是对象`)
    return
  }

  if (manifest.schemaVersion !== 1) report(`${modelLabel}.schemaVersion: 目前只支持 1`)

  const presetKey = manifest.presetKey

  if (typeof presetKey !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(presetKey)) {
    report(`${modelLabel}.presetKey: 格式无效`)
  } else {
    const duplicate = presetKeys.get(presetKey)
    if (duplicate) report(`${modelLabel}.presetKey: 与 ${duplicate} 重复（${presetKey}）`)
    else presetKeys.set(presetKey, folderName)
  }

  if (typeof manifest.displayName !== 'string' || manifest.displayName.trim().length === 0) {
    report(`${modelLabel}.displayName: 必须是非空字符串`)
  }

  const renderer = manifest.renderer
  if (renderer !== 'live2d' && renderer !== 'image') {
    report(`${modelLabel}.renderer: 必须是 live2d 或 image`)
  }

  if (!['standard', 'keyboard', 'gamepad'].includes(String(manifest.mode))) {
    report(`${modelLabel}.mode: 必须是 standard、keyboard 或 gamepad`)
  }

  if (manifest.order !== undefined && (typeof manifest.order !== 'number' || !Number.isFinite(manifest.order))) {
    report(`${modelLabel}.order: 必须是有限数字`)
  }

  if (manifest.default !== undefined && typeof manifest.default !== 'boolean') {
    report(`${modelLabel}.default: 必须是布尔值`)
  } else if (manifest.default === true) {
    defaultModels.push(folderName)
  }

  for (const key of ['interactionBounds', 'bubbleBounds']) {
    const bounds = manifest[key]

    if (bounds !== undefined) {
      if (!isRecord(bounds)) {
        report(`${modelLabel}.${key}: 必须是对象`)
        continue
      }

      const { x, y, width, height } = bounds
      const values = [x, y, width, height]
      const validNumbers = values.every(value => typeof value === 'number' && Number.isFinite(value))

      if (
        !validNumbers
        || Number(x) < 0
        || Number(y) < 0
        || Number(width) <= 0
        || Number(height) <= 0
        || Number(x) + Number(width) > 1
        || Number(y) + Number(height) > 1
      ) {
        report(`${modelLabel}.${key}: 必须是位于 0～1 范围内的有效矩形`)
      }
    }
  }

  resolveRelativeFile(modelDirectory, manifest.cover, `${modelLabel}.cover`)

  if (renderer === 'live2d') {
    const entry = resolveRelativeFile(modelDirectory, manifest.entry, `${modelLabel}.entry`)

    if (entry) {
      if (!entry.toLowerCase().endsWith('.model3.json')) {
        report(`${modelLabel}.entry: 必须指向 .model3.json`)
      } else if (typeof presetKey === 'string') {
        validateModel3(entry, presetKey, modelLabel)
      }
    }
  }

  if (renderer === 'image') {
    if (!isRecord(manifest.image)) {
      report(`${modelLabel}.image: 图片模型必须提供 image 对象`)
      return
    }

    const { file, height, src, width } = manifest.image

    if (file !== undefined) resolveRelativeFile(modelDirectory, file, `${modelLabel}.image.file`)
    if (file === undefined && (typeof src !== 'string' || src.length === 0)) {
      report(`${modelLabel}.image: 必须提供 image.file 或 image.src`)
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      report(`${modelLabel}.image.width: 必须是大于 0 的有限数字`)
    }
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
      report(`${modelLabel}.image.height: 必须是大于 0 的有限数字`)
    }
  }
}

function compareStandardTextures() {
  const original = textureSizes.get('standard')
  const variant = textureSizes.get('blue-white-a-standard')

  if (!original || !variant) return

  for (const [name, variantTexture] of variant) {
    const originalTexture = original.get(name)
    if (!originalTexture) continue

    if (variantTexture.width !== originalTexture.width || variantTexture.height !== originalTexture.height) {
      report(
        `纹理尺寸不一致：blue-white-a-standard/${name} 为 ${variantTexture.width}x${variantTexture.height}，`
        + `standard/${name} 为 ${originalTexture.width}x${originalTexture.height}`,
      )
    }
  }
}

if (!existsSync(modelsRoot)) {
  report(`内置模型目录不存在：${modelsRoot}`)
} else {
  const modelDirectories = readdirSync(modelsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))

  if (modelDirectories.length === 0) report(`内置模型目录为空：${modelsRoot}`)

  for (const directory of modelDirectories) {
    validateManifest(join(modelsRoot, directory.name), directory.name)
  }
}

if (defaultModels.length > 1) {
  report(`最多只能有一个默认模型，当前为：${defaultModels.join(', ')}`)
}

compareStandardTextures()

if (errors.length > 0) {
  console.error(`内置模型库校验失败（${errors.length} 项）：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`内置模型库校验通过：${presetKeys.size} 个模型，${pngSizes.size} 个 PNG。`)
}
