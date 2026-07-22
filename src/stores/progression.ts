import { defineStore } from 'pinia'

import type {
  ProgressionEngineOptions,
  ProgressionInitializationOptions,
  ProgressionInteractionEvent,
  ProgressionState,
  RandomSource,
} from '@/domain/progression'

import {
  applyInteractionEvent,
  createInitialProgressionState,
  DEFAULT_PROGRESSION_RULES,
  DEFAULT_REWARD_CATALOG,
  initializeProgressionState,
} from '@/domain/progression'

function replaceProgressionState(state: ProgressionState, nextState: ProgressionState) {
  Object.assign(state, nextState)
}

export const useProgressionStore = defineStore('progression', {
  state: createInitialProgressionState,
  getters: {
    rewardCatalog: () => DEFAULT_REWARD_CATALOG,
    nextMilestone: (state) => {
      const claimed = new Set(state.claimedMilestones)

      return DEFAULT_PROGRESSION_RULES.milestones
        .find(milestone => !claimed.has(milestone.id))
    },
    interactionsUntilDrop: state => Math.max(
      0,
      state.dropState.nextCheckAt - state.creditedInteractions,
    ),
    pity: state => ({
      current: state.dropState.consecutiveMisses,
      threshold: DEFAULT_PROGRESSION_RULES.missesBeforeGuaranteedDrop,
    }),
    lastReward: state => state.rewardHistory[0],
  },
  actions: {
    initialize(options: ProgressionInitializationOptions = {}) {
      const nextState = initializeProgressionState(this.$state, {
        ...options,
        now: options.now ?? Date.now(),
      })

      this.$patch(state => replaceProgressionState(state, nextState))

      return nextState
    },
    recordInteractionEvent(
      event: ProgressionInteractionEvent,
      options: ProgressionEngineOptions = {},
    ) {
      const transition = applyInteractionEvent(this.$state, event, options)

      if (transition.changed) {
        this.$patch(state => replaceProgressionState(state, transition.state))
      }

      return transition.result
    },
    recordValidInteraction(
      eventId: string,
      occurredAt = Date.now(),
      interactions = 1,
      random: RandomSource = Math.random,
    ) {
      return this.recordInteractionEvent({
        id: eventId,
        occurredAt,
        interactions,
      }, { random })
    },
    isOwned(rewardId: string) {
      return (this.inventory[rewardId] ?? 0) > 0
    },
    getRewardDefinition(rewardId: string) {
      return DEFAULT_REWARD_CATALOG.find(reward => reward.id === rewardId)
    },
    resetProgression(now = Date.now()) {
      const nextState = initializeProgressionState(
        createInitialProgressionState(),
        { now },
      )

      this.$patch(state => replaceProgressionState(state, nextState))

      return nextState
    },
  },
})
