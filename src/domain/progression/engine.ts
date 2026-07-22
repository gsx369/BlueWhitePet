import type {
  DropCheckResult,
  InteractionEventResult,
  MilestoneClaimResult,
  ProgressionEngineOptions,
  ProgressionInitializationOptions,
  ProgressionInteractionEvent,
  ProgressionMigrationOptions,
  ProgressionRules,
  ProgressionState,
  ProgressionTransition,
  RandomSource,
  RewardGrantResult,
  RewardHistoryEntry,
} from './types'

import {
  DEFAULT_PROGRESSION_RULES,
  LEGACY_OWNED_REWARD_IDS,
} from './catalog'

export const PROGRESSION_SCHEMA_VERSION = 1
export const MAX_REWARD_HISTORY = 20
export const MAX_PROCESSED_REWARD_EVENTS = 2048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonNegativeInteger(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function asPositiveInteger(value: unknown, fallback: number) {
  const parsed = asNonNegativeInteger(value, fallback)

  return parsed > 0 ? parsed : fallback
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return []

  return [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item)))]
}

function normalizeInventory(value: unknown) {
  const inventory: Record<string, number> = {}

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item) {
        inventory[item] = 1
      } else if (isRecord(item) && typeof item.rewardId === 'string' && item.rewardId) {
        inventory[item.rewardId] = Math.max(1, asPositiveInteger(item.count, 1))
      }
    }

    return inventory
  }

  if (!isRecord(value)) return inventory

  for (const [rewardId, count] of Object.entries(value)) {
    const normalizedCount = asNonNegativeInteger(count)

    if (rewardId && normalizedCount > 0) inventory[rewardId] = normalizedCount
  }

  return inventory
}

function normalizeRewardHistory(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap<RewardHistoryEntry>((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.eventId !== 'string'
      || !entry.eventId
      || typeof entry.rewardId !== 'string'
      || !entry.rewardId
      || (entry.source !== 'milestone' && entry.source !== 'drop')
    ) {
      return []
    }

    return [{
      eventId: entry.eventId,
      rewardId: entry.rewardId,
      source: entry.source,
      interaction: asNonNegativeInteger(entry.interaction),
      awardedAt: asNonNegativeInteger(entry.awardedAt),
    }]
  }).slice(0, MAX_REWARD_HISTORY)
}

function nextDropCheckAfter(creditedInteractions: number, rules: ProgressionRules) {
  return (Math.floor(creditedInteractions / rules.dropInterval) + 1) * rules.dropInterval
}

export function createInitialProgressionState(): ProgressionState {
  return {
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    initialized: false,
    initializedAt: 0,
    lifetimeInteractions: 0,
    creditedInteractions: 0,
    claimedMilestones: [],
    inventory: {},
    dropState: {
      nextCheckAt: DEFAULT_PROGRESSION_RULES.dropInterval,
      consecutiveMisses: 0,
      totalChecks: 0,
      successfulDrops: 0,
      exhaustedChecks: 0,
    },
    processedRewardEvents: [],
    rateLimit: {
      secondBucket: -1,
      creditedInBucket: 0,
    },
    rewardHistory: [],
  }
}

export function migrateProgressionState(
  value: unknown,
  options: ProgressionMigrationOptions = {},
): ProgressionState {
  const rules = options.rules ?? DEFAULT_PROGRESSION_RULES
  const raw = isRecord(value) ? value : {}
  const isCurrent = raw.schemaVersion === PROGRESSION_SCHEMA_VERSION
  const legacyLifetime = raw.totalInteractions ?? raw.interactionCount
  const savedLifetimeInteractions = asNonNegativeInteger(
    raw.lifetimeInteractions ?? legacyLifetime,
  )
  const savedCreditedInteractions = asNonNegativeInteger(
    raw.creditedInteractions,
    savedLifetimeInteractions,
  )
  const lifetimeInteractions = Math.max(
    savedLifetimeInteractions,
    savedCreditedInteractions,
  )
  const creditedInteractions = Math.min(lifetimeInteractions, savedCreditedInteractions)
  const dropState = isRecord(raw.dropState) ? raw.dropState : {}
  const rateLimit = isRecord(raw.rateLimit) ? raw.rateLimit : {}
  const legacyHasData = Object.keys(raw).some(key => key !== 'schemaVersion')
  const normalizedNextCheck = asPositiveInteger(
    dropState.nextCheckAt,
    nextDropCheckAfter(creditedInteractions, rules),
  )

  return {
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    initialized: isCurrent
      ? raw.initialized === true
      : raw.initialized === true || legacyHasData,
    initializedAt: asNonNegativeInteger(raw.initializedAt),
    lifetimeInteractions,
    creditedInteractions,
    claimedMilestones: uniqueStrings(raw.claimedMilestones ?? raw.milestones),
    inventory: normalizeInventory(raw.inventory ?? raw.unlockedRewards),
    dropState: {
      nextCheckAt: normalizedNextCheck,
      consecutiveMisses: asNonNegativeInteger(
        dropState.consecutiveMisses ?? raw.failedDropChecks,
      ),
      totalChecks: asNonNegativeInteger(dropState.totalChecks),
      successfulDrops: asNonNegativeInteger(dropState.successfulDrops),
      exhaustedChecks: asNonNegativeInteger(dropState.exhaustedChecks),
    },
    processedRewardEvents: uniqueStrings(
      raw.processedRewardEvents ?? raw.processedEvents,
    ).slice(-MAX_PROCESSED_REWARD_EVENTS),
    rateLimit: {
      secondBucket: typeof rateLimit.secondBucket === 'number'
        && Number.isFinite(rateLimit.secondBucket)
        ? Math.floor(rateLimit.secondBucket)
        : -1,
      creditedInBucket: Math.min(
        rules.maxCreditsPerSecond,
        asNonNegativeInteger(rateLimit.creditedInBucket),
      ),
    },
    rewardHistory: normalizeRewardHistory(raw.rewardHistory ?? raw.recentRewards),
  }
}

function addOwnedRewards(inventory: Record<string, number>, rewardIds: readonly string[]) {
  const nextInventory = { ...inventory }

  for (const rewardId of rewardIds) {
    if (rewardId && !nextInventory[rewardId]) nextInventory[rewardId] = 1
  }

  return nextInventory
}

export function initializeProgressionState(
  value: unknown,
  options: ProgressionInitializationOptions = {},
): ProgressionState {
  const state = migrateProgressionState(value)

  if (state.initialized) return state

  const initialRewardIds = options.legacyProfile
    ? options.legacyOwnedRewardIds ?? LEGACY_OWNED_REWARD_IDS
    : options.initialRewardIds ?? []

  return {
    ...state,
    initialized: true,
    initializedAt: asNonNegativeInteger(options.now),
    inventory: addOwnedRewards(state.inventory, initialRewardIds),
  }
}

function normalizeRandom(random: RandomSource) {
  const value = random()

  if (!Number.isFinite(value)) return 0

  return Math.min(0.999999999999, Math.max(0, value))
}

export function selectUnownedReward(
  pool: readonly string[],
  inventory: Readonly<Record<string, number>>,
  random: RandomSource,
) {
  const candidates = getUnownedRewards(pool, inventory)

  if (candidates.length === 0) return
  if (candidates.length === 1) return candidates[0]

  return candidates[Math.floor(normalizeRandom(random) * candidates.length)]
}

export function getUnownedRewards(
  pool: readonly string[],
  inventory: Readonly<Record<string, number>>,
) {
  return [...new Set(pool)].filter(rewardId => rewardId && !inventory[rewardId])
}

function createEmptyResult(requestedInteractions: number): InteractionEventResult {
  return {
    duplicate: false,
    requestedInteractions,
    acceptedInteractions: 0,
    rejectedInteractions: requestedInteractions,
    milestones: [],
    rewards: [],
    dropChecks: [],
  }
}

function grantReward(
  state: ProgressionState,
  event: ProgressionInteractionEvent,
  rewardId: string,
  source: 'milestone' | 'drop',
  interaction: number,
) {
  if (state.inventory[rewardId]) return

  state.inventory[rewardId] = 1
  const reward: RewardGrantResult = {
    eventId: event.id,
    rewardId,
    source,
    interaction,
    awardedAt: event.occurredAt,
  }

  state.rewardHistory.unshift(reward)
  state.rewardHistory = state.rewardHistory.slice(0, MAX_REWARD_HISTORY)

  return reward
}

function claimReachedMilestones(
  state: ProgressionState,
  event: ProgressionInteractionEvent,
  rules: ProgressionRules,
  claims: MilestoneClaimResult[],
  rewards: RewardGrantResult[],
) {
  const claimed = new Set(state.claimedMilestones)
  const milestones = [...rules.milestones].sort((a, b) => a.target - b.target)

  for (const milestone of milestones) {
    if (milestone.target > state.creditedInteractions || claimed.has(milestone.id)) continue

    const newlyOwned = !state.inventory[milestone.rewardId]

    claimed.add(milestone.id)
    state.claimedMilestones.push(milestone.id)
    claims.push({
      milestoneId: milestone.id,
      target: milestone.target,
      rewardId: milestone.rewardId,
      newlyOwned,
    })

    const reward = grantReward(
      state,
      event,
      milestone.rewardId,
      'milestone',
      milestone.target,
    )

    if (reward) rewards.push(reward)
  }
}

function processDropChecks(
  state: ProgressionState,
  event: ProgressionInteractionEvent,
  rules: ProgressionRules,
  random: RandomSource,
  checks: DropCheckResult[],
  rewards: RewardGrantResult[],
) {
  while (state.dropState.nextCheckAt <= state.creditedInteractions) {
    const interaction = state.dropState.nextCheckAt

    state.dropState.nextCheckAt += rules.dropInterval
    state.dropState.totalChecks += 1

    const unownedRewards = getUnownedRewards(rules.dropPool, state.inventory)

    if (unownedRewards.length === 0) {
      state.dropState.exhaustedChecks += 1
      checks.push({ interaction, status: 'pool-exhausted', guaranteed: false })
      continue
    }

    const guaranteed = state.dropState.consecutiveMisses >= rules.missesBeforeGuaranteedDrop
    const succeeded = guaranteed || normalizeRandom(random) < rules.dropChance

    if (!succeeded) {
      state.dropState.consecutiveMisses += 1
      checks.push({ interaction, status: 'miss', guaranteed: false })
      continue
    }

    const rewardId = selectUnownedReward(unownedRewards, state.inventory, random)

    if (!rewardId) continue

    state.dropState.consecutiveMisses = 0
    state.dropState.successfulDrops += 1
    const reward = grantReward(state, event, rewardId, 'drop', interaction)

    if (reward) rewards.push(reward)
    checks.push({ interaction, status: 'reward', guaranteed, rewardId })
  }
}

function validateRules(rules: ProgressionRules) {
  if (
    !Number.isInteger(rules.dropInterval)
    || rules.dropInterval <= 0
    || !Number.isFinite(rules.dropChance)
    || rules.dropChance < 0
    || rules.dropChance > 1
    || !Number.isInteger(rules.missesBeforeGuaranteedDrop)
    || rules.missesBeforeGuaranteedDrop < 0
    || !Number.isInteger(rules.maxCreditsPerSecond)
    || rules.maxCreditsPerSecond <= 0
  ) {
    throw new Error('Invalid progression rules')
  }
}

export function applyInteractionEvent(
  current: ProgressionState,
  event: ProgressionInteractionEvent,
  options: ProgressionEngineOptions = {},
): ProgressionTransition {
  const rules = options.rules ?? DEFAULT_PROGRESSION_RULES
  const random = options.random ?? Math.random

  validateRules(rules)

  if (!event.id.trim()) throw new Error('Progression event id is required')
  if (!Number.isFinite(event.occurredAt) || event.occurredAt < 0) {
    throw new Error('Progression event time is invalid')
  }

  const requestedInteractions = event.interactions ?? 1

  if (!Number.isInteger(requestedInteractions) || requestedInteractions <= 0) {
    throw new Error('Progression interaction count is invalid')
  }

  const initialized = initializeProgressionState(current, { now: event.occurredAt })

  if (initialized.processedRewardEvents.includes(event.id)) {
    return {
      state: initialized,
      result: {
        ...createEmptyResult(requestedInteractions),
        duplicate: true,
      },
      changed: !current.initialized,
    }
  }

  const state = migrateProgressionState(initialized, { rules })
  const result = createEmptyResult(requestedInteractions)
  const secondBucket = Math.floor(event.occurredAt / 1000)
  let remainingCredits = 0

  if (secondBucket > state.rateLimit.secondBucket) {
    state.rateLimit.secondBucket = secondBucket
    state.rateLimit.creditedInBucket = 0
    remainingCredits = rules.maxCreditsPerSecond
  } else if (secondBucket === state.rateLimit.secondBucket) {
    remainingCredits = Math.max(
      0,
      rules.maxCreditsPerSecond - state.rateLimit.creditedInBucket,
    )
  }

  const acceptedInteractions = Math.min(requestedInteractions, remainingCredits)

  state.processedRewardEvents.push(event.id)
  if (state.processedRewardEvents.length > MAX_PROCESSED_REWARD_EVENTS) {
    state.processedRewardEvents.splice(
      0,
      state.processedRewardEvents.length - MAX_PROCESSED_REWARD_EVENTS,
    )
  }
  state.rateLimit.creditedInBucket += acceptedInteractions
  state.lifetimeInteractions += acceptedInteractions
  state.creditedInteractions += acceptedInteractions

  result.acceptedInteractions = acceptedInteractions
  result.rejectedInteractions = requestedInteractions - acceptedInteractions

  if (acceptedInteractions > 0) {
    claimReachedMilestones(state, event, rules, result.milestones, result.rewards)
    processDropChecks(state, event, rules, random, result.dropChecks, result.rewards)
  }

  return { state, result, changed: true }
}
