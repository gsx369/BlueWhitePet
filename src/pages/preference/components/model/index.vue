<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core'
import { remove } from '@tauri-apps/plugin-fs'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useElementSize } from '@vueuse/core'
import { Button, Card, Masonry, message, Popconfirm } from 'antdv-next'
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Model } from '@/stores/model'

import { DEFAULT_MILESTONES } from '@/domain/progression'
import { useCatStore } from '@/stores/cat'
import { useModelStore } from '@/stores/model'
import { useProgressionStore } from '@/stores/progression'
import { join } from '@/utils/path'

import BehaviorModal from './components/behavior-modal/index.vue'
import FloatMenu from './components/float-menu/index.vue'
import Upload from './components/upload/index.vue'

const catStore = useCatStore()
const modelStore = useModelStore()
const progressionStore = useProgressionStore()
const firstCardRef = useTemplateRef('firstCard')
const { height } = useElementSize(firstCardRef)
const { t } = useI18n()
const openBehaviorModal = ref(false)

const masonryItems = computed(() => {
  const items = modelStore.models.map((item) => {
    return {
      key: item.id,
      data: item,
    }
  })

  return [{ key: 'upload', data: null }, ...items]
})

function handleToggle(nextModel: Model) {
  if (!isModelUnlocked(nextModel)) {
    message.info(getUnlockHint(nextModel))
    return
  }

  if (modelStore.currentModel?.id === nextModel.id) return

  modelStore.modelReady = false

  modelStore.currentModel = nextModel
}

function isModelUnlocked(model: Model) {
  return !model.rewardId || progressionStore.isOwned(model.rewardId)
}

function getUnlockHint(model: Model) {
  const milestone = DEFAULT_MILESTONES.find(item => item.rewardId === model.rewardId)

  return milestone
    ? t('pages.preference.model.hints.unlockByInteraction', { count: milestone.target })
    : t('pages.preference.model.hints.lockedModel')
}

function getDisplayName(model: Model) {
  return model.displayName ?? model.presetKey ?? model.id
}

function getCoverPath(model: Model) {
  return convertFileSrc(join(model.path, model.cover ?? 'resources/cover.png'))
}

function handleRandomFavorite() {
  const favorites = modelStore.models.filter((model) => {
    return modelStore.isFavorite(model.id) && isModelUnlocked(model)
  })

  if (favorites.length > 0) {
    const candidates = favorites.length > 1
      ? favorites.filter(model => model.id !== modelStore.currentModel?.id)
      : favorites
    const nextModel = candidates[Math.floor(Math.random() * candidates.length)]

    if (nextModel && nextModel.id !== modelStore.currentModel?.id) {
      modelStore.modelReady = false
      modelStore.currentModel = nextModel
    }

    return
  }

  message.info(t('pages.preference.model.hints.noFavorites'))
}

function handleToggleFavorite(model: Model) {
  if (!isModelUnlocked(model)) {
    message.info(getUnlockHint(model))
    return
  }

  modelStore.toggleFavorite(model.id)
}

async function handleDelete(item: Model) {
  const { id, path } = item

  try {
    await remove(path, { recursive: true })

    message.success(t('pages.preference.model.hints.deleteSuccess'))
  } catch (error) {
    message.error(String(error))
  } finally {
    modelStore.models = modelStore.models.filter(item => item.id !== id)
    modelStore.favoriteModelIds = modelStore.favoriteModelIds.filter(modelId => modelId !== id)

    if (id === modelStore.currentModel?.id) {
      modelStore.currentModel = modelStore.models[0]
    }
  }
}
</script>

<template>
  <div class="mb-4 flex justify-end">
    <Button @click="handleRandomFavorite">
      <i class="i-lucide:shuffle mr-1" />
      {{ $t('pages.preference.model.labels.randomFavorite') }}
    </Button>
  </div>

  <Masonry
    :columns="{ xs: 3, lg: 4, xxl: 6 }"
    :gutter="16"
    :items="masonryItems"
  >
    <template #itemRender="{ data, index }">
      <template v-if="!data">
        <Upload :style="{ height: `${height}px` }" />
      </template>

      <Card
        v-else
        :ref="index === 1 ? 'firstCard' : void 0"
        :class="{ 'model-card--locked': !isModelUnlocked(data) }"
        :classes="{
          actions: `[&>li]:(flex justify-center) [&>li>span]:(inline-flex! justify-center text-4!)`,
        }"
        hoverable
        size="small"
        @click="handleToggle(data)"
      >
        <template #cover>
          <div class="model-cover">
            <img
              :alt="getDisplayName(data)"
              :src="getCoverPath(data)"
            >

            <div
              v-if="!isModelUnlocked(data)"
              class="model-cover__lock"
              :title="getUnlockHint(data)"
            >
              <i class="i-lucide:lock-keyhole" />
              <span>{{ $t('pages.preference.model.labels.locked') }}</span>
            </div>
          </div>
        </template>

        <div
          class="truncate text-center text-sm"
          :title="getDisplayName(data)"
        >
          {{ getDisplayName(data) }}
        </div>

        <template #actions>
          <i
            :class="[
              isModelUnlocked(data) ? 'i-lucide:circle-check' : 'i-lucide:lock-keyhole',
              { 'text-success': data.id === modelStore.currentModel?.id },
            ]"
            :title="!isModelUnlocked(data) ? getUnlockHint(data) : undefined"
          />

          <i
            v-if="isModelUnlocked(data)"
            class="i-lucide:star"
            :class="{ 'text-warning fill-current': modelStore.isFavorite(data.id) }"
            :title="$t(`pages.preference.model.labels.${modelStore.isFavorite(data.id) ? 'unfavorite' : 'favorite'}`)"
            @click.stop="handleToggleFavorite(data)"
          />

          <i
            v-else
            class="i-lucide:star-off opacity-40"
            :title="getUnlockHint(data)"
            @click.stop="handleToggleFavorite(data)"
          />

          <i
            v-if="catStore.model.behavior && isModelUnlocked(data) && data.renderer !== 'image' && modelStore.currentModel?.id === data.id"
            class="i-lucide:smile"
            @click.stop="openBehaviorModal = true"
          />

          <i
            class="i-lucide:folder-open"
            @click.stop="revealItemInDir(data.path)"
          />

          <template v-if="!data.isPreset">
            <Popconfirm
              :description="$t('pages.preference.model.hints.deleteModel')"
              placement="topRight"
              :title="$t('pages.preference.model.labels.deleteModel')"
              @confirm="handleDelete(data)"
            >
              <i
                class="i-lucide:trash-2"
                @click.stop
              />
            </Popconfirm>
          </template>
        </template>
      </Card>
    </template>
  </Masonry>

  <FloatMenu />

  <BehaviorModal
    v-if="catStore.model.behavior"
    v-model="openBehaviorModal"
  />
</template>

<style scoped lang="scss">
.model-card--locked {
  cursor: default;
}

.model-cover {
  position: relative;
  overflow: hidden;

  > img {
    display: block;
    width: 100%;
  }

  &__lock {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    background: rgb(29 39 54 / 55%);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    text-shadow: 0 1px 3px rgb(0 0 0 / 45%);
  }
}
</style>
