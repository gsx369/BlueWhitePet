<script setup lang="ts">
import { emit } from '@tauri-apps/api/event'
import { Button, Divider, Flex, InputNumber, Slider, SpaceAddon, SpaceCompact, Switch } from 'antdv-next'

import ProListItem from '@/components/pro-list-item/index.vue'
import ProList from '@/components/pro-list/index.vue'
import { LISTEN_KEY } from '@/constants'
import { positionMainWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { isWindows } from '@/utils/platform'

const catStore = useCatStore()

function resetStats() {
  catStore.resetStats()
  void emit(LISTEN_KEY.RESET_PET_STATS)
}
</script>

<template>
  <ProList :title="$t('pages.preference.cat.labels.modelSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.mirrorMode')"
      :title="$t('pages.preference.cat.labels.mirrorMode')"
    >
      <Switch v-model:checked="catStore.model.mirror" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.mouseMirror')"
      :title="$t('pages.preference.cat.labels.mouseMirror')"
    >
      <Switch v-model:checked="catStore.model.mouseMirror" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.ignoreMouse')"
      :title="$t('pages.preference.cat.labels.ignoreMouse')"
    >
      <Switch v-model:checked="catStore.model.ignoreMouse" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.motionSound')"
      :title="$t('pages.preference.cat.labels.motionSound')"
    >
      <Switch v-model:checked="catStore.model.motionSound" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.behavior')"
      :title="$t('pages.preference.cat.labels.behavior')"
    >
      <Switch v-model:checked="catStore.model.behavior" />
    </ProListItem>

    <ProListItem
      v-if="isWindows"
      :description="$t('pages.preference.cat.hints.autoReleaseDelay')"
      :title="$t('pages.preference.cat.labels.autoReleaseDelay')"
    >
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.model.autoReleaseDelay"
          class="w-20"
        />

        <SpaceAddon>s</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.maxFPS')"
      :title="$t('pages.preference.cat.labels.maxFPS')"
    >
      <InputNumber
        v-model:value="catStore.model.maxFPS"
        class="w-20"
        :min="0"
      />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.idleRendering')"
      :title="$t('pages.preference.cat.labels.idleRendering')"
    >
      <Switch v-model:checked="catStore.performance.idleEnabled" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.idleAfter')"
      :title="$t('pages.preference.cat.labels.idleAfter')"
    >
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.performance.idleAfter"
          class="w-20"
          :max="3600"
          :min="5"
        />

        <SpaceAddon>s</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.idleFPS')"
      :title="$t('pages.preference.cat.labels.idleFPS')"
    >
      <InputNumber
        v-model:value="catStore.performance.idleFPS"
        class="w-20"
        :max="240"
        :min="1"
      />
    </ProListItem>
  </ProList>

  <ProList :title="$t('pages.preference.cat.labels.windowSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.passThrough')"
      :title="$t('pages.preference.cat.labels.passThrough')"
    >
      <Switch v-model:checked="catStore.window.passThrough" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.gameMode')"
      :title="$t('pages.preference.cat.labels.gameMode')"
    >
      <Switch v-model:checked="catStore.window.gameMode" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.alwaysOnTop')"
      :title="$t('pages.preference.cat.labels.alwaysOnTop')"
    >
      <Switch v-model:checked="catStore.window.alwaysOnTop" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.hideOnHover')"
      :title="$t('pages.preference.cat.labels.hideOnHover')"
    >
      <Flex align="center">
        <Switch v-model:checked="catStore.window.hideOnHover" />

        <Flex
          align="center"
          class="overflow-hidden transition-all"
          :class="[catStore.window.hideOnHover ? 'w-28 opacity-100' : 'w-0 opacity-0']"
        >
          <Divider type="vertical" />

          <SpaceCompact>
            <InputNumber
              v-model:value="catStore.window.hideOnHoverDelay"
              class="w-16"
              :min="0"
            />

            <SpaceAddon>s</SpaceAddon>
          </SpaceCompact>
        </Flex>
      </Flex>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.keepInScreen')"
      :title="$t('pages.preference.cat.labels.keepInScreen')"
    >
      <Switch v-model:checked="catStore.window.keepInScreen" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.windowPosition')"
      :title="$t('pages.preference.cat.labels.windowPosition')"
      vertical
    >
      <Flex
        gap="small"
        wrap="wrap"
      >
        <Button
          size="small"
          @click="positionMainWindow('top-left')"
        >
          {{ $t('pages.preference.cat.buttons.topLeft') }}
        </Button>
        <Button
          size="small"
          @click="positionMainWindow('top-right')"
        >
          {{ $t('pages.preference.cat.buttons.topRight') }}
        </Button>
        <Button
          size="small"
          @click="positionMainWindow('bottom-left')"
        >
          {{ $t('pages.preference.cat.buttons.bottomLeft') }}
        </Button>
        <Button
          size="small"
          @click="positionMainWindow('bottom-right')"
        >
          {{ $t('pages.preference.cat.buttons.bottomRight') }}
        </Button>
        <Button
          size="small"
          @click="positionMainWindow('center')"
        >
          {{ $t('pages.preference.cat.buttons.center') }}
        </Button>
        <Button
          size="small"
          @click="positionMainWindow('next-monitor')"
        >
          {{ $t('pages.preference.cat.buttons.nextMonitor') }}
        </Button>
      </Flex>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.windowSize')"
      :title="$t('pages.preference.cat.labels.windowSize')"
    >
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.window.scale"
          class="w-20"
          :max="500"
          :min="1"
        />

        <SpaceAddon>%</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.labels.windowRadius')">
      <SpaceCompact>
        <InputNumber
          v-model:value="catStore.window.radius"
          class="w-20"
          :min="0"
        />

        <SpaceAddon>%</SpaceAddon>
      </SpaceCompact>
    </ProListItem>

    <ProListItem
      :title="$t('pages.preference.cat.labels.opacity')"
      vertical
    >
      <Slider
        v-model:value="catStore.window.opacity"
        class="m-0!"
        :max="100"
        :min="10"
        :tooltip="{
          formatter(value) {
            return `${value}%`
          },
        }"
      />
    </ProListItem>
  </ProList>

  <ProList :title="$t('pages.preference.cat.labels.localStats')">
    <ProListItem :title="$t('pages.preference.cat.labels.inputCount')">
      {{ catStore.stats.inputCount.toLocaleString() }}
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.labels.interactionCount')">
      {{ catStore.stats.interactionCount.toLocaleString() }}
    </ProListItem>

    <ProListItem>
      <Button @click="resetStats">
        {{ $t('pages.preference.cat.buttons.resetStats') }}
      </Button>
    </ProListItem>
  </ProList>
</template>
