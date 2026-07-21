import type { ExpressionInfo, MotionInfo } from 'easy-live2d'

import { convertFileSrc } from '@tauri-apps/api/core'
import { resolveResource } from '@tauri-apps/api/path'
import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { warn } from '@tauri-apps/plugin-log'
import { filter, find } from 'es-toolkit/compat'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

import { join } from '@/utils/path'

export type ModelMode = 'standard' | 'keyboard' | 'gamepad'
export type ModelRenderer = 'live2d' | 'image'
export type ModelPresetKey = string

export interface ImageModel {
  src: string
  width: number
  height: number
}

export interface ModelBounds {
  x: number
  y: number
  width: number
  height: number
}

interface ManifestImageModel {
  file?: string
  src?: string
  width: number
  height: number
}

interface ModelManifest {
  schemaVersion: 1
  presetKey: string
  displayName: string
  renderer: ModelRenderer
  mode: ModelMode
  entry?: string
  cover: string
  order: number
  default: boolean
  image?: ManifestImageModel
  interactionBounds?: ModelBounds
  bubbleBounds?: ModelBounds
}

export interface Model {
  id: string
  path: string
  mode: ModelMode
  isPreset: boolean
  presetKey?: ModelPresetKey
  displayName?: string
  renderer?: ModelRenderer
  entry?: string
  cover?: string
  order?: number
  default?: boolean
  image?: ImageModel
  interactionBounds?: ModelBounds
  bubbleBounds?: ModelBounds
}

const modelModes = new Set<ModelMode>(['standard', 'keyboard', 'gamepad'])
const modelRenderers = new Set<ModelRenderer>(['live2d', 'image'])
const presetKeyPattern = /^[a-z0-9][a-z0-9-]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeRelativePath(path: string) {
  if (!path || path.startsWith('/') || path.startsWith('\\')) return false
  if (/^[a-z]:[\\/]/i.test(path)) return false

  return !path.split(/[\\/]/).includes('..')
}

function resolveModelReferencePath(root: string, entry: string, reference: string) {
  if (!reference || reference.startsWith('/') || reference.startsWith('\\') || /^[a-z]:[\\/]/i.test(reference)) {
    throw new Error(`Invalid model asset path: ${reference}`)
  }

  const segments = entry.split(/[\\/]/).slice(0, -1)

  for (const segment of reference.split(/[\\/]/)) {
    if (!segment || segment === '.') continue

    if (segment === '..') {
      if (segments.length === 0) throw new Error(`Model asset escapes its package: ${reference}`)

      segments.pop()
    } else {
      segments.push(segment)
    }
  }

  return join(root, ...segments)
}

function collectModelReferences(value: unknown) {
  if (!isRecord(value) || !isRecord(value.FileReferences)) {
    throw new Error('Invalid Live2D model entry')
  }

  const references = value.FileReferences
  const files: string[] = []
  const addFile = (file: unknown, label: string) => {
    if (typeof file !== 'string' || !file) throw new Error(`Invalid Live2D reference: ${label}`)

    files.push(file)
  }

  addFile(references.Moc, 'Moc')

  if (!Array.isArray(references.Textures) || references.Textures.length === 0) {
    throw new Error('Live2D textures are required')
  }

  references.Textures.forEach((file, index) => addFile(file, `Textures[${index}]`))

  for (const key of ['DisplayInfo', 'Physics', 'Pose', 'UserData']) {
    if (references[key] !== undefined) addFile(references[key], key)
  }

  if (references.Expressions !== undefined) {
    if (!Array.isArray(references.Expressions)) throw new Error('Invalid Live2D expressions')

    references.Expressions.forEach((expression, index) => {
      if (!isRecord(expression)) throw new Error(`Invalid Live2D expression: ${index}`)

      addFile(expression.File, `Expressions[${index}].File`)
    })
  }

  if (references.Motions !== undefined) {
    if (!isRecord(references.Motions)) throw new Error('Invalid Live2D motions')

    for (const [group, motions] of Object.entries(references.Motions)) {
      if (!Array.isArray(motions)) throw new Error(`Invalid Live2D motion group: ${group}`)

      motions.forEach((motion, index) => {
        if (!isRecord(motion)) throw new Error(`Invalid Live2D motion: ${group}[${index}]`)

        addFile(motion.File, `Motions.${group}[${index}].File`)
        if (motion.Sound !== undefined) addFile(motion.Sound, `Motions.${group}[${index}].Sound`)
      })
    }
  }

  return files
}

function parseModelBounds(value: unknown, label: string): ModelBounds | undefined {
  if (value === undefined) return
  if (!isRecord(value)) throw new Error(`Invalid model ${label} bounds`)

  const { x, y, width, height } = value

  if (
    typeof x !== 'number'
    || typeof y !== 'number'
    || typeof width !== 'number'
    || typeof height !== 'number'
    || ![x, y, width, height].every(Number.isFinite)
    || x < 0
    || y < 0
    || width <= 0
    || height <= 0
    || x + width > 1
    || y + height > 1
  ) {
    throw new Error(`Model ${label} bounds must stay within normalized coordinates`)
  }

  return { x, y, width, height }
}

function parseManifest(value: unknown): ModelManifest {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported model manifest')
  }

  const {
    presetKey,
    displayName,
    renderer,
    mode,
    entry,
    cover = 'resources/cover.png',
    order = 1000,
    default: isDefault = false,
    image,
    interactionBounds,
    bubbleBounds,
  } = value

  if (typeof presetKey !== 'string' || !presetKeyPattern.test(presetKey)) {
    throw new Error('Invalid model preset key')
  }

  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw new Error('Invalid model display name')
  }

  if (typeof renderer !== 'string' || !modelRenderers.has(renderer as ModelRenderer)) {
    throw new Error('Invalid model renderer')
  }

  if (typeof mode !== 'string' || !modelModes.has(mode as ModelMode)) {
    throw new Error('Invalid model mode')
  }

  if (typeof cover !== 'string' || !isSafeRelativePath(cover)) {
    throw new Error('Invalid model cover path')
  }

  if (typeof order !== 'number' || !Number.isFinite(order)) {
    throw new TypeError('Invalid model order')
  }

  if (typeof isDefault !== 'boolean') {
    throw new TypeError('Invalid model default flag')
  }

  if (entry !== undefined && (typeof entry !== 'string' || !isSafeRelativePath(entry))) {
    throw new Error('Invalid model entry path')
  }

  if (renderer === 'live2d' && typeof entry !== 'string') {
    throw new Error('Live2D model entry is required')
  }

  if (renderer === 'live2d' && !entry?.toLowerCase().endsWith('.model3.json')) {
    throw new Error('Live2D model entry must point to .model3.json')
  }

  let manifestImage: ManifestImageModel | undefined

  if (renderer === 'image') {
    if (!isRecord(image)) throw new Error('Image model settings are required')

    const { file, src, width, height } = image

    if (file !== undefined && (typeof file !== 'string' || !isSafeRelativePath(file))) {
      throw new Error('Invalid image model file')
    }

    if (src !== undefined && typeof src !== 'string') {
      throw new Error('Invalid image model source')
    }

    if (!file && !src) throw new Error('Image model source is required')
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      throw new Error('Invalid image model width')
    }
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
      throw new Error('Invalid image model height')
    }

    manifestImage = { file, src, width, height }
  }

  return {
    schemaVersion: 1,
    presetKey,
    displayName: displayName.trim(),
    renderer: renderer as ModelRenderer,
    mode: mode as ModelMode,
    entry,
    cover,
    order,
    default: isDefault,
    image: manifestImage,
    interactionBounds: parseModelBounds(interactionBounds, 'interaction'),
    bubbleBounds: parseModelBounds(bubbleBounds, 'bubble'),
  }
}

async function readManifest(path: string) {
  const manifestPath = join(path, 'pet-model.json')

  if (!await exists(manifestPath)) return

  const manifest = parseManifest(JSON.parse(await readTextFile(manifestPath)))
  const requiredFiles = [manifest.cover, manifest.entry, manifest.image?.file]
    .filter((file): file is string => Boolean(file))

  for (const file of requiredFiles) {
    if (!await exists(join(path, file))) {
      throw new Error(`Missing model asset: ${file}`)
    }
  }

  if (manifest.renderer === 'live2d' && manifest.entry) {
    const modelJson = JSON.parse(await readTextFile(join(path, manifest.entry)))
    const references = collectModelReferences(modelJson)

    for (const reference of references) {
      const referencePath = resolveModelReferencePath(path, manifest.entry, reference)

      if (!await exists(referencePath)) {
        throw new Error(`Missing Live2D model asset: ${reference}`)
      }
    }
  }

  return manifest
}

function resolveManifestImage(path: string, image?: ManifestImageModel): ImageModel | undefined {
  if (!image) return

  const src = image.file ? convertFileSrc(join(path, image.file)) : image.src

  if (!src) return

  return {
    src,
    width: image.width,
    height: image.height,
  }
}

async function inferLegacyMode(path: string, folderName?: string): Promise<ModelMode> {
  if (folderName && modelModes.has(folderName as ModelMode)) {
    return folderName as ModelMode
  }

  const files = await readDir(join(path, 'resources', 'right-keys')).catch(() => [])

  if (files.length === 0) return 'standard'

  return files.some(file => file.name.split('.')[0] === 'East') ? 'gamepad' : 'keyboard'
}

async function discoverPresetModels(modelsPath: string): Promise<Model[]> {
  const entries = (await readDir(modelsPath))
    .filter(entry => entry.isDirectory)
    .sort((a, b) => a.name.localeCompare(b.name))
  const models: Model[] = []
  const presetKeys = new Set<string>()

  for (const entry of entries) {
    const path = join(modelsPath, entry.name)

    try {
      const manifest = await readManifest(path)

      if (manifest) {
        if (presetKeys.has(manifest.presetKey)) {
          void warn(`Duplicate built-in model presetKey ignored: ${manifest.presetKey}`)
          continue
        }

        presetKeys.add(manifest.presetKey)
        models.push({
          id: `preset-${manifest.presetKey}`,
          path,
          mode: manifest.mode,
          isPreset: true,
          presetKey: manifest.presetKey,
          displayName: manifest.displayName,
          renderer: manifest.renderer,
          entry: manifest.entry,
          cover: manifest.cover,
          order: manifest.order,
          default: manifest.default,
          image: resolveManifestImage(path, manifest.image),
          interactionBounds: manifest.interactionBounds,
          bubbleBounds: manifest.bubbleBounds,
        })

        continue
      }

      if (presetKeys.has(entry.name)) continue

      presetKeys.add(entry.name)
      models.push({
        id: `preset-${entry.name}`,
        path,
        mode: await inferLegacyMode(path, entry.name),
        isPreset: true,
        presetKey: entry.name,
        displayName: entry.name,
        renderer: 'live2d',
        cover: 'resources/cover.png',
        order: 1000,
      })
    } catch (error) {
      // An invalid built-in package is ignored so one bad manifest cannot
      // prevent the rest of the model library from loading.
      void warn(`Invalid built-in model package ignored (${entry.name}): ${String(error)}`)
    }
  }

  return models.sort((a, b) => {
    const orderDelta = (a.order ?? 1000) - (b.order ?? 1000)

    return orderDelta || (a.displayName ?? '').localeCompare(b.displayName ?? '')
  })
}

function matchesLegacyPreset(discovered: Model, saved: Model) {
  if (saved.presetKey === discovered.presetKey) return true
  if (saved.presetKey) return false

  if (discovered.presetKey === 'blue-white') {
    return saved.mode === 'standard' && saved.renderer === 'image'
  }

  if (!modelModes.has(discovered.presetKey as ModelMode)) return false

  return saved.mode === discovered.mode && (saved.renderer ?? 'live2d') === 'live2d'
}

async function normalizeCustomModel(model: Model): Promise<Model> {
  const manifest = await readManifest(model.path)

  if (!manifest) {
    const files = await readDir(model.path)

    if (!files.some(file => file.name.endsWith('.model3.json'))) {
      throw new Error('Legacy custom model is missing a .model3.json entry')
    }

    return {
      ...model,
      mode: await inferLegacyMode(model.path),
      isPreset: false,
      presetKey: undefined,
      displayName: `自定义模型 ${model.id.slice(0, 6)}`,
      renderer: 'live2d',
      entry: undefined,
      cover: 'resources/cover.png',
      order: undefined,
      default: false,
      image: undefined,
      interactionBounds: undefined,
      bubbleBounds: undefined,
    }
  }

  return {
    ...model,
    mode: manifest.mode,
    isPreset: false,
    presetKey: undefined,
    displayName: manifest.displayName,
    renderer: manifest.renderer,
    entry: manifest.entry,
    cover: manifest.cover,
    order: manifest.order,
    default: false,
    image: resolveManifestImage(model.path, manifest.image),
    interactionBounds: manifest.interactionBounds,
    bubbleBounds: manifest.bubbleBounds,
  }
}

export const useModelStore = defineStore('model', () => {
  const modelReady = ref(true)
  const models = ref<Model[]>([])
  const currentModel = ref<Model>()
  const favoriteModelIds = ref<string[]>([])
  const supportKeys = reactive<Record<string, string>>({})
  const pressedKeys = reactive<Record<string, string>>({})
  const currentMotions = ref<Array<[string, MotionInfo[]]>>([])
  const currentExpressions = ref<ExpressionInfo[]>([])
  const shortcuts = reactive<Record<string, string>>({})

  const init = async () => {
    const modelsPath = await resolveResource('assets/models')
    const savedModels = models.value
    const savedPresets = filter(savedModels, { isPreset: true })
    const savedCustomModels = filter(savedModels, { isPreset: false })
    const savedCurrentModel = currentModel.value
    const discoveredPresets = await discoverPresetModels(modelsPath)

    const presetModels = discoveredPresets.map((model) => {
      const matched = find(savedPresets, saved => matchesLegacyPreset(model, saved))

      return {
        ...model,
        id: matched?.id ?? model.id,
      }
    })
    const customModels = (await Promise.all(savedCustomModels.map(async (model) => {
      if (!await exists(model.path)) return

      try {
        return await normalizeCustomModel(model)
      } catch (error) {
        void warn(`Invalid custom model removed from library (${model.id}): ${String(error)}`)
      }
    }))).filter((model): model is Model => Boolean(model))
    const nextModels = [...presetModels, ...customModels]

    const migrateLegacyStaticCurrent = Boolean(
      savedCurrentModel?.isPreset
      && !savedCurrentModel.presetKey
      && savedCurrentModel.mode === 'standard'
      && savedCurrentModel.renderer === 'image',
    )
    let matched = migrateLegacyStaticCurrent
      ? undefined
      : find(nextModels, { id: savedCurrentModel?.id })

    if (!matched && savedCurrentModel?.isPreset && !migrateLegacyStaticCurrent) {
      matched = find(presetModels, model => matchesLegacyPreset(model, savedCurrentModel))
    }

    currentModel.value = matched
      ?? find(presetModels, { default: true })
      ?? presetModels[0]
      ?? customModels[0]

    models.value = nextModels

    const availableModelIds = new Set(nextModels.map(model => model.id))

    favoriteModelIds.value = [...new Set(
      favoriteModelIds.value.filter(id => availableModelIds.has(id)),
    )]
  }

  const addCustomModel = async (model: Model) => {
    if (!await exists(model.path)) throw new Error('Custom model directory does not exist')

    const normalized = await normalizeCustomModel(model)

    models.value.push(normalized)

    return normalized
  }

  const isFavorite = (modelId: string) => favoriteModelIds.value.includes(modelId)

  const toggleFavorite = (modelId: string) => {
    if (!models.value.some(model => model.id === modelId)) return false

    if (isFavorite(modelId)) {
      favoriteModelIds.value = favoriteModelIds.value.filter(id => id !== modelId)

      return false
    }

    favoriteModelIds.value = [...favoriteModelIds.value, modelId]

    return true
  }

  const selectRandomFavorite = () => {
    const favorites = models.value.filter(model => isFavorite(model.id))

    if (favorites.length === 0) return

    const candidates = favorites.length > 1
      ? favorites.filter(model => model.id !== currentModel.value?.id)
      : favorites
    const nextModel = candidates[Math.floor(Math.random() * candidates.length)]

    if (!nextModel) return

    if (nextModel.id !== currentModel.value?.id) {
      modelReady.value = false
      currentModel.value = nextModel
    }

    return nextModel
  }

  return {
    modelReady,
    models,
    currentModel,
    favoriteModelIds,
    supportKeys,
    pressedKeys,
    currentMotions,
    currentExpressions,
    shortcuts,
    init,
    addCustomModel,
    isFavorite,
    toggleFavorite,
    selectRandomFavorite,
  }
}, {
  tauri: {
    filterKeys: ['supportKeys', 'pressedKeys'],
  },
})
