import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { createPinia, setActivePinia } from 'pinia'

import type {
  ProgressionRules,
  ProgressionState,
  RandomSource,
} from '../src/domain/progression/index.ts'

import {
  applyInteractionEvent,
  createInitialProgressionState,
  DEFAULT_PROGRESSION_RULES,
  DEFAULT_REWARD_CATALOG,
  initializeProgressionState,
  LEGACY_OWNED_REWARD_IDS,
  MAX_PROCESSED_REWARD_EVENTS,
  migrateProgressionState,
  PROGRESSION_SCHEMA_VERSION,
} from '../src/domain/progression/index.ts'
import { useCatStore } from '../src/stores/cat.ts'
import { useProgressionStore } from '../src/stores/progression.ts'

interface TestCase {
  name: string
  run: () => void | Promise<void>
}

function initializedState(options: Parameters<typeof initializeProgressionState>[1] = {}) {
  return initializeProgressionState(createInitialProgressionState(), { now: 1, ...options })
}

function rules(overrides: Partial<ProgressionRules> = {}): ProgressionRules {
  return {
    ...DEFAULT_PROGRESSION_RULES,
    milestones: [],
    dropPool: [],
    ...overrides,
  }
}

function transition(
  state: ProgressionState,
  id: string,
  occurredAt: number,
  interactions: number,
  customRules = DEFAULT_PROGRESSION_RULES,
  random: RandomSource = () => 0.99,
) {
  return applyInteractionEvent(
    state,
    { id, occurredAt, interactions },
    { rules: customRules, random },
  )
}

const tests: TestCase[] = [
  {
    name: 'keeps progression rewards aligned with built-in model manifests',
    run: async () => {
      const modelsPath = resolve(cwd(), 'src-tauri/assets/models')
      const entries = await readdir(modelsPath, { withFileTypes: true })
      const manifestRewards: Array<{ id: string, targetId: string, rarity: string }> = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const manifest = JSON.parse(
          await readFile(resolve(modelsPath, entry.name, 'pet-model.json'), 'utf8'),
        ) as Record<string, unknown>

        if (manifest.default === true) assert.equal(manifest.rewardId, undefined)
        if (typeof manifest.rewardId !== 'string') continue

        manifestRewards.push({
          id: manifest.rewardId,
          targetId: String(manifest.presetKey),
          rarity: String(manifest.rarity),
        })
      }

      const catalogRewards = DEFAULT_REWARD_CATALOG.map(reward => ({
        id: reward.id,
        targetId: reward.targetId,
        rarity: reward.rarity,
      }))

      assert.deepEqual(
        manifestRewards.sort((a, b) => a.id.localeCompare(b.id)),
        catalogRewards.sort((a, b) => a.id.localeCompare(b.id)),
      )
    },
  },
  {
    name: 'credits at most ten interactions per second',
    run: () => {
      let state = initializedState()
      const first = transition(state, 'rate-1', 100, 12)

      state = first.state
      assert.equal(first.result.acceptedInteractions, 10)
      assert.equal(first.result.rejectedInteractions, 2)

      const sameSecond = transition(state, 'rate-2', 900, 3)

      state = sameSecond.state
      assert.equal(sameSecond.result.acceptedInteractions, 0)
      assert.equal(state.lifetimeInteractions, 10)

      const nextSecond = transition(state, 'rate-3', 1000, 20)

      assert.equal(nextSecond.result.acceptedInteractions, 10)
      assert.equal(nextSecond.state.lifetimeInteractions, 20)
      assert.equal(nextSecond.state.creditedInteractions, 20)
    },
  },
  {
    name: 'claims fixed milestones exactly once',
    run: () => {
      let state = initializedState()

      state = transition(state, 'milestone-1', 0, 10).state
      const reached = transition(state, 'milestone-2', 1000, 10)

      state = reached.state
      assert.deepEqual(reached.result.milestones, [{
        milestoneId: 'first-gift',
        target: 20,
        rewardId: 'model-blue-white-static',
        newlyOwned: true,
      }])
      assert.equal(state.inventory['model-blue-white-static'], 1)
      assert.deepEqual(state.claimedMilestones, ['first-gift'])

      const later = transition(state, 'milestone-3', 2000, 10)

      assert.equal(later.result.milestones.length, 0)
      assert.equal(later.state.inventory['model-blue-white-static'], 1)
    },
  },
  {
    name: 'guarantees the third drop check after two misses',
    run: () => {
      const pityRules = rules({
        dropPool: ['reward-a'],
        maxCreditsPerSecond: 50,
      })
      const values = [0.9, 0.9]
      let randomCalls = 0
      const random = () => {
        const value = values[randomCalls] ?? 0.9

        randomCalls += 1

        return value
      }
      let state = initializedState()
      const first = transition(state, 'pity-1', 0, 50, pityRules, random)

      state = first.state
      assert.equal(first.result.dropChecks[0]?.status, 'miss')
      assert.equal(state.dropState.consecutiveMisses, 1)

      const second = transition(state, 'pity-2', 1000, 50, pityRules, random)

      state = second.state
      assert.equal(second.result.dropChecks[0]?.status, 'miss')
      assert.equal(state.dropState.consecutiveMisses, 2)

      const third = transition(state, 'pity-3', 2000, 50, pityRules, random)

      assert.deepEqual(third.result.dropChecks, [{
        interaction: 150,
        status: 'reward',
        guaranteed: true,
        rewardId: 'reward-a',
      }])
      assert.equal(third.state.inventory['reward-a'], 1)
      assert.equal(third.state.dropState.consecutiveMisses, 0)
      assert.equal(randomCalls, 2, 'a guaranteed single-item drop should not consume RNG')
    },
  },
  {
    name: 'ignores a duplicate interaction event',
    run: () => {
      const duplicateRules = rules()
      const first = transition(initializedState(), 'same-event', 0, 7, duplicateRules)
      const snapshot = structuredClone(first.state)
      const duplicate = transition(first.state, 'same-event', 0, 7, duplicateRules)

      assert.equal(duplicate.result.duplicate, true)
      assert.equal(duplicate.result.acceptedInteractions, 0)
      assert.equal(duplicate.changed, false)
      assert.deepEqual(duplicate.state, snapshot)
    },
  },
  {
    name: 'bounds the recent event idempotency window',
    run: () => {
      const eventIds = Array.from(
        { length: MAX_PROCESSED_REWARD_EVENTS + 2 },
        (_, index) => `bounded-${index}`,
      )
      const migrated = migrateProgressionState({
        ...initializedState(),
        processedRewardEvents: eventIds,
      })

      assert.equal(migrated.processedRewardEvents.length, MAX_PROCESSED_REWARD_EVENTS)
      assert.equal(migrated.processedRewardEvents[0], 'bounded-2')

      const duplicate = transition(
        migrated,
        eventIds.at(-1)!,
        0,
        1,
        rules(),
      )

      assert.equal(duplicate.result.duplicate, true)
      assert.equal(duplicate.changed, false)

      const appended = transition(migrated, 'bounded-new', 0, 1, rules())

      assert.equal(appended.state.processedRewardEvents.length, MAX_PROCESSED_REWARD_EVENTS)
      assert.equal(appended.state.processedRewardEvents.at(-1), 'bounded-new')
      assert.equal(appended.state.processedRewardEvents.includes('bounded-2'), false)
    },
  },
  {
    name: 'skips drops safely when the unique reward pool is exhausted',
    run: () => {
      const exhaustedRules = rules({
        dropPool: ['only-reward'],
        maxCreditsPerSecond: 50,
      })
      let randomCalled = false
      const state = initializedState({ initialRewardIds: ['only-reward'] })
      const result = transition(state, 'exhausted', 0, 50, exhaustedRules, () => {
        randomCalled = true

        return 0
      })

      assert.deepEqual(result.result.dropChecks, [{
        interaction: 50,
        status: 'pool-exhausted',
        guaranteed: false,
      }])
      assert.equal(result.state.dropState.exhaustedChecks, 1)
      assert.equal(result.state.dropState.consecutiveMisses, 0)
      assert.equal(result.result.rewards.length, 0)
      assert.equal(randomCalled, false)
    },
  },
  {
    name: 'prefers an unowned reward over an owned pool entry',
    run: () => {
      const uniqueRules = rules({
        dropPool: ['owned', 'new'],
        dropChance: 1,
        maxCreditsPerSecond: 50,
      })
      const state = initializedState({ initialRewardIds: ['owned'] })
      const result = transition(state, 'unowned', 0, 50, uniqueRules, () => 0)

      assert.equal(result.result.rewards[0]?.rewardId, 'new')
      assert.equal(result.state.inventory.new, 1)
      assert.equal(result.state.inventory.owned, 1)
    },
  },
  {
    name: 'migrates legacy local progression data',
    run: () => {
      const migrated = migrateProgressionState({
        schemaVersion: 0,
        totalInteractions: 75,
        unlockedRewards: ['legacy-reward'],
        failedDropChecks: 2,
        milestones: ['legacy-milestone', 'legacy-milestone'],
        processedEvents: ['legacy-event'],
      })

      assert.equal(migrated.schemaVersion, PROGRESSION_SCHEMA_VERSION)
      assert.equal(migrated.initialized, true)
      assert.equal(migrated.lifetimeInteractions, 75)
      assert.equal(migrated.creditedInteractions, 75)
      assert.equal(migrated.dropState.nextCheckAt, 100)
      assert.equal(migrated.dropState.consecutiveMisses, 2)
      assert.deepEqual(migrated.claimedMilestones, ['legacy-milestone'])
      assert.equal(migrated.inventory['legacy-reward'], 1)
      assert.deepEqual(migrated.processedRewardEvents, ['legacy-event'])
    },
  },
  {
    name: 'distinguishes fresh profiles from upgraded profiles',
    run: () => {
      const fresh = initializedState({ legacyProfile: false })
      const upgraded = initializedState({ legacyProfile: true })

      assert.deepEqual(fresh.inventory, {})
      assert.deepEqual(Object.keys(upgraded.inventory).sort(), [...LEGACY_OWNED_REWARD_IDS].sort())
      assert.equal(DEFAULT_REWARD_CATALOG.length, 4)

      const secondInitialization = initializeProgressionState(upgraded, { legacyProfile: false })

      assert.deepEqual(secondInitialization.inventory, upgraded.inventory)
    },
  },
  {
    name: 'resetting progression replaces nested collection state',
    run: () => {
      setActivePinia(createPinia())
      const progression = useProgressionStore()

      progression.initialize({ legacyProfile: true, now: 1 })
      progression.claimedMilestones = ['legacy-milestone']
      progression.rewardHistory = [{
        eventId: 'legacy-event',
        rewardId: 'model-blue-white-static',
        source: 'milestone',
        interaction: 20,
        awardedAt: 1,
      }]

      assert.equal(Object.keys(progression.inventory).length, 4)

      progression.resetProgression(2)

      assert.deepEqual(progression.inventory, {})
      assert.deepEqual(progression.claimedMilestones, [])
      assert.deepEqual(progression.rewardHistory, [])
      assert.equal(progression.initialized, true)
      assert.equal(progression.initializedAt, 2)
    },
  },
  {
    name: 'resetting session statistics does not reset permanent progression',
    run: () => {
      setActivePinia(createPinia())
      const cat = useCatStore()
      const progression = useProgressionStore()

      progression.initialize({ now: 1 })
      progression.recordValidInteraction('store-1', 0, 10, () => 0.99)
      progression.recordValidInteraction('store-2', 1000, 10, () => 0.99)
      cat.stats.inputCount = 30
      cat.stats.interactionCount = 20

      const permanentSnapshot = JSON.stringify(progression.$state)

      cat.resetStats()

      assert.equal(cat.stats.inputCount, 0)
      assert.equal(cat.stats.interactionCount, 0)
      assert.equal(JSON.stringify(progression.$state), permanentSnapshot)
      assert.equal(progression.lifetimeInteractions, 20)
      assert.equal(progression.isOwned('model-blue-white-static'), true)
    },
  },
]

let passed = 0

for (const test of tests) {
  try {
    await test.run()
    passed += 1
    console.log(`PASS ${test.name}`)
  } catch (error) {
    console.error(`FAIL ${test.name}`)
    throw error
  }
}

console.log(`Progression tests passed: ${passed}/${tests.length}`)
