export type RewardKind = 'model' | 'skin' | 'motion' | 'expression'

export type RewardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface RewardDefinition {
  id: string
  kind: RewardKind
  targetId: string
  titleKey: string
  descriptionKey: string
  rarity: RewardRarity
}

export interface MilestoneDefinition {
  id: string
  target: number
  rewardId: string
}

export interface ProgressionRules {
  milestones: readonly MilestoneDefinition[]
  dropPool: readonly string[]
  dropInterval: number
  dropChance: number
  missesBeforeGuaranteedDrop: number
  maxCreditsPerSecond: number
}

export interface ProgressionDropState {
  nextCheckAt: number
  consecutiveMisses: number
  totalChecks: number
  successfulDrops: number
  exhaustedChecks: number
}

export interface ProgressionRateLimitState {
  secondBucket: number
  creditedInBucket: number
}

export type RewardSource = 'milestone' | 'drop'

export interface RewardHistoryEntry {
  eventId: string
  rewardId: string
  source: RewardSource
  interaction: number
  awardedAt: number
}

export interface ProgressionState {
  schemaVersion: number
  initialized: boolean
  initializedAt: number
  lifetimeInteractions: number
  creditedInteractions: number
  claimedMilestones: string[]
  inventory: Record<string, number>
  dropState: ProgressionDropState
  processedRewardEvents: string[]
  rateLimit: ProgressionRateLimitState
  rewardHistory: RewardHistoryEntry[]
}

export interface ProgressionInteractionEvent {
  id: string
  occurredAt: number
  interactions?: number
}

export type RandomSource = () => number

export interface MilestoneClaimResult {
  milestoneId: string
  target: number
  rewardId: string
  newlyOwned: boolean
}

export interface RewardGrantResult extends RewardHistoryEntry {}

export type DropCheckStatus = 'miss' | 'reward' | 'pool-exhausted'

export interface DropCheckResult {
  interaction: number
  status: DropCheckStatus
  guaranteed: boolean
  rewardId?: string
}

export interface InteractionEventResult {
  duplicate: boolean
  requestedInteractions: number
  acceptedInteractions: number
  rejectedInteractions: number
  milestones: MilestoneClaimResult[]
  rewards: RewardGrantResult[]
  dropChecks: DropCheckResult[]
}

export interface ProgressionTransition {
  state: ProgressionState
  result: InteractionEventResult
  changed: boolean
}

export interface ProgressionEngineOptions {
  random?: RandomSource
  rules?: ProgressionRules
}

export interface ProgressionInitializationOptions {
  legacyProfile?: boolean
  initialRewardIds?: readonly string[]
  legacyOwnedRewardIds?: readonly string[]
  now?: number
}

export interface ProgressionMigrationOptions {
  rules?: ProgressionRules
}
