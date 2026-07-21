<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core'
import { remove } from '@tauri-apps/plugin-fs'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useElementSize } from '@vueuse/core'
import { Button, Card, Masonry, message, Popconfirm } from 'antdv-next'
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Model } from '@/stores/model'

import { useCatStore } from '@/stores/cat'
import { useModelStore } from '@/stores/model'
import { join } from '@/utils/path'

import BehaviorModal from './components/behavior-modal/index.vue'
import FloatMenu from './components/float-menu/index.vue'
import Upload from './components/upload/index.vue'

const catStore = useCatStore()
const modelStore = useModelStore()
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
  if (modelStore.currentModel?.id === nextModel.id) return

  modelStore.modelReady = false

  modelStore.currentModel = nextModel
}

function getDisplayName(model: Model) {
  return model.displayName ?? model.presetKey ?? model.id
}

function getCoverPath(model: Model) {
  return convertFileSrc(join(model.path, model.cover ?? 'resources/cover.png'))
}

function handleRandomFavorite() {
  if (modelStore.selectRandomFavorite()) return

  message.info(t('pages.preference.model.hints.noFavorites'))
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
        :classes="{
          actions: `[&>li]:(flex justify-center) [&>li>span]:(inline-flex! justify-center text-4!)`,
        }"
        hoverable
        size="small"
        @click="handleToggle(data)"
      >
        <template #cover>
          <img
            :alt="getDisplayName(data)"
            :src="getCoverPath(data)"
          >
        </template>

        <div
          class="truncate text-center text-sm"
          :title="getDisplayName(data)"
        >
          {{ getDisplayName(data) }}
        </div>

        <template #actions>
          <i
            class="i-lucide:circle-check"
            :class="{ 'text-success': data.id === modelStore.currentModel?.id }"
          />

          <i
            class="i-lucide:star"
            :class="{ 'text-warning fill-current': modelStore.isFavorite(data.id) }"
            :title="$t(`pages.preference.model.labels.${modelStore.isFavorite(data.id) ? 'unfavorite' : 'favorite'}`)"
            @click.stop="modelStore.toggleFavorite(data.id)"
          />

          <i
            v-if="catStore.model.behavior && data.renderer !== 'image' && modelStore.currentModel?.id === data.id"
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
