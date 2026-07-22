<script setup lang="ts">
import { emit } from '@tauri-apps/api/event'
import { Button, Divider, Flex, InputNumber, Popconfirm, Slider, SpaceAddon, SpaceCompact, Switch } from 'antdv-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ProListItem from '@/components/pro-list-item/index.vue'
import ProList from '@/components/pro-list/index.vue'
import { LISTEN_KEY } from '@/constants'
import { positionMainWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { useProgressionStore } from '@/stores/progression'
import { isWindows } from '@/utils/platform'

const catStore = useCatStore()
const progressionStore = useProgressionStore()
const { locale, t } = useI18n()

const allRewardsOwned = computed(() => {
  return progressionStore.rewardCatalog.every(reward => progressionStore.isOwned(reward.id))
})

const ownedRewardCount = computed(() => {
  return progressionStore.rewardCatalog.filter(reward => progressionStore.isOwned(reward.id)).length
})

const nextMilestoneReward = computed(() => {
  const rewardId = progressionStore.nextMilestone?.rewardId

  return rewardId ? progressionStore.getRewardDefinition(rewardId) : undefined
})

const nextMilestoneDescription = computed(() => {
  const milestone = progressionStore.nextMilestone

  if (!milestone) return t('pages.preference.cat.growth.status.allMilestonesClaimed')

  return t('pages.preference.cat.growth.status.milestoneAt', {
    count: formatNumber(milestone.target),
  })
})

const nextMilestoneStatus = computed(() => {
  const milestone = progressionStore.nextMilestone

  if (!milestone) return t('pages.preference.cat.growth.status.allMilestonesClaimed')

  const remaining = Math.max(0, milestone.target - progressionStore.creditedInteractions)

  if (remaining === 0) return t('pages.preference.cat.growth.status.readyNextInteraction')

  return t('pages.preference.cat.growth.status.interactionsRemaining', {
    count: formatNumber(remaining),
  })
})

const nextDropStatus = computed(() => {
  if (allRewardsOwned.value) return t('pages.preference.cat.growth.status.allRewardsOwned')
  if (progressionStore.interactionsUntilDrop === 0) {
    return t('pages.preference.cat.growth.status.readyNextInteraction')
  }

  return t('pages.preference.cat.growth.status.randomCheckIn', {
    count: formatNumber(progressionStore.interactionsUntilDrop),
  })
})

const pityStatus = computed(() => {
  if (allRewardsOwned.value) return t('pages.preference.cat.growth.status.allRewardsOwned')

  const { current, threshold } = progressionStore.pity

  if (current >= threshold) return t('pages.preference.cat.growth.status.pityGuaranteed')

  return t('pages.preference.cat.growth.status.pityProgress', {
    current: formatNumber(current),
    target: formatNumber(threshold),
  })
})

const recentRewardHistory = computed(() => progressionStore.rewardHistory.slice(0, 5))

function formatNumber(value: number) {
  return value.toLocaleString(locale.value)
}

function formatRewardDate(value: number) {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function getRewardTitle(rewardId: string) {
  const reward = progressionStore.getRewardDefinition(rewardId)

  return reward ? t(reward.titleKey) : rewardId
}

function resetProgression() {
  progressionStore.resetProgression()
}

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

  <ProList :title="$t('pages.preference.cat.growth.labels.interactionFeedback')">
    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.interactionHUD')"
      :title="$t('pages.preference.cat.growth.labels.interactionHUD')"
    >
      <Switch v-model:checked="catStore.feedback.hudEnabled" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.dialogueBubbles')"
      :title="$t('pages.preference.cat.growth.labels.dialogueBubbles')"
    >
      <Switch v-model:checked="catStore.feedback.dialogueEnabled" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.rewardNotifications')"
      :title="$t('pages.preference.cat.growth.labels.rewardNotifications')"
    >
      <Switch v-model:checked="catStore.feedback.rewardNotifications" />
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

  <ProList :title="$t('pages.preference.cat.growth.labels.growthAndCollection')">
    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.growthSummary')"
      :title="$t('pages.preference.cat.growth.labels.lifetimeInteractions')"
    >
      <span class="font-medium tabular-nums">
        {{ formatNumber(progressionStore.creditedInteractions) }}
      </span>
    </ProListItem>

    <ProListItem
      :description="nextMilestoneDescription"
      :title="$t('pages.preference.cat.growth.labels.nextMilestone')"
    >
      <Flex
        align="end"
        class="text-right"
        gap="small"
        vertical
      >
        <span
          v-if="nextMilestoneReward"
          class="font-medium"
        >
          {{ $t(nextMilestoneReward.titleKey) }}
        </span>
        <span class="text-3 color-text-tertiary">
          {{ nextMilestoneStatus }}
        </span>
      </Flex>
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.growth.labels.nextRandomCheck')">
      <span class="text-right text-3.5">
        {{ nextDropStatus }}
      </span>
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.growth.labels.pityStatus')">
      <span class="text-right text-3.5">
        {{ pityStatus }}
      </span>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.collectionRewards')"
      :title="$t('pages.preference.cat.growth.labels.collectionRewards')"
      vertical
    >
      <Flex
        align="center"
        justify="space-between"
      >
        <span class="text-3 color-text-tertiary">
          {{ $t('pages.preference.cat.growth.labels.collected') }}
        </span>
        <span class="font-medium tabular-nums">
          {{ ownedRewardCount }} / {{ progressionStore.rewardCatalog.length }}
        </span>
      </Flex>

      <div
        v-if="progressionStore.rewardCatalog.length"
        class="grid grid-cols-1 gap-2 lg:grid-cols-2"
      >
        <div
          v-for="reward in progressionStore.rewardCatalog"
          :key="reward.id"
          class="b-1 b-solid p-3 bg-container b-border-sec rounded-md"
        >
          <Flex
            align="start"
            gap="small"
            justify="space-between"
          >
            <div class="min-w-0">
              <div class="font-medium">
                {{ $t(reward.titleKey) }}
              </div>
              <div class="mt-1 text-3 color-text-tertiary">
                {{ $t(reward.descriptionKey) }}
              </div>
            </div>

            <Flex
              align="end"
              class="shrink-0"
              gap="small"
              vertical
            >
              <span class="b-1 b-solid px-2 py-0.5 text-3 color-text-tertiary b-border-sec rounded-full">
                {{ $t(`pages.preference.cat.growth.rarities.${reward.rarity}`) }}
              </span>
              <span
                class="b-1 b-solid px-2 py-0.5 text-3 rounded-full"
                :class="progressionStore.isOwned(reward.id)
                  ? 'b-success color-success'
                  : 'b-border-sec color-text-tertiary'"
              >
                {{ $t(`pages.preference.cat.growth.status.${progressionStore.isOwned(reward.id) ? 'owned' : 'locked'}`) }}
              </span>
            </Flex>
          </Flex>
        </div>
      </div>

      <div
        v-else
        class="py-4 text-center text-3 color-text-tertiary"
      >
        {{ $t('pages.preference.cat.growth.status.noRewards') }}
      </div>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.dropHistory')"
      :title="$t('pages.preference.cat.growth.labels.dropHistory')"
      vertical
    >
      <Flex
        v-if="recentRewardHistory.length"
        gap="small"
        vertical
      >
        <Flex
          v-for="entry in recentRewardHistory"
          :key="`${entry.eventId}-${entry.rewardId}-${entry.awardedAt}`"
          align="center"
          class="b-1 b-solid p-3 bg-container b-border-sec rounded-md"
          gap="small"
          justify="space-between"
        >
          <div class="min-w-0">
            <div class="truncate font-medium">
              {{ getRewardTitle(entry.rewardId) }}
            </div>
            <div class="mt-1 text-3 color-text-tertiary">
              {{ $t(`pages.preference.cat.growth.sources.${entry.source}`) }}
              ·
              {{ $t('pages.main.growth.interactionUnit', { count: formatNumber(entry.interaction) }) }}
            </div>
          </div>
          <span class="shrink-0 text-right text-3 color-text-tertiary">
            {{ formatRewardDate(entry.awardedAt) }}
          </span>
        </Flex>
      </Flex>

      <div
        v-else
        class="py-4 text-center text-3 color-text-tertiary"
      >
        {{ $t('pages.preference.cat.growth.status.noDropHistory') }}
      </div>
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.resetGrowth')"
      :title="$t('pages.preference.cat.growth.buttons.resetGrowth')"
    >
      <Popconfirm
        :description="$t('pages.preference.cat.growth.hints.resetGrowth')"
        :ok-text="$t('pages.preference.cat.growth.buttons.confirmResetGrowth')"
        placement="topRight"
        :title="$t('pages.preference.cat.growth.buttons.resetGrowth')"
        @confirm="resetProgression"
      >
        <Button danger>
          {{ $t('pages.preference.cat.growth.buttons.resetGrowth') }}
        </Button>
      </Popconfirm>
    </ProListItem>
  </ProList>

  <ProList :title="$t('pages.preference.cat.labels.localStats')">
    <ProListItem :title="$t('pages.preference.cat.labels.inputCount')">
      {{ catStore.stats.inputCount.toLocaleString() }}
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.labels.interactionCount')">
      {{ catStore.stats.interactionCount.toLocaleString() }}
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.growth.hints.resetStats')"
      :title="$t('pages.preference.cat.buttons.resetStats')"
    >
      <Button @click="resetStats">
        {{ $t('pages.preference.cat.buttons.resetStats') }}
      </Button>
    </ProListItem>
  </ProList>
</template>
