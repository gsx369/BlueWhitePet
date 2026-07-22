import type { MilestoneDefinition, ProgressionRules, RewardDefinition } from './types'

export const DEFAULT_REWARD_CATALOG: readonly RewardDefinition[] = [
  {
    id: 'model-blue-white-static',
    kind: 'model',
    targetId: 'blue-white',
    titleKey: 'progression.rewards.blueWhite.title',
    descriptionKey: 'progression.rewards.blueWhite.description',
    rarity: 'uncommon',
  },
  {
    id: 'model-bongocat-standard',
    kind: 'model',
    targetId: 'standard',
    titleKey: 'progression.rewards.standard.title',
    descriptionKey: 'progression.rewards.standard.description',
    rarity: 'common',
  },
  {
    id: 'model-bongocat-keyboard',
    kind: 'model',
    targetId: 'keyboard',
    titleKey: 'progression.rewards.keyboard.title',
    descriptionKey: 'progression.rewards.keyboard.description',
    rarity: 'rare',
  },
  {
    id: 'model-bongocat-gamepad',
    kind: 'model',
    targetId: 'gamepad',
    titleKey: 'progression.rewards.gamepad.title',
    descriptionKey: 'progression.rewards.gamepad.description',
    rarity: 'epic',
  },
]

export const DEFAULT_MILESTONES: readonly MilestoneDefinition[] = [
  { id: 'first-gift', target: 20, rewardId: 'model-blue-white-static' },
  { id: 'steady-paws', target: 100, rewardId: 'model-bongocat-standard' },
  { id: 'keyboard-friend', target: 500, rewardId: 'model-bongocat-keyboard' },
  { id: 'gamepad-friend', target: 1000, rewardId: 'model-bongocat-gamepad' },
]

export const DEFAULT_DROP_POOL = DEFAULT_REWARD_CATALOG.map(reward => reward.id)

export const DEFAULT_PROGRESSION_RULES: ProgressionRules = {
  milestones: DEFAULT_MILESTONES,
  dropPool: DEFAULT_DROP_POOL,
  dropInterval: 50,
  dropChance: 0.35,
  missesBeforeGuaranteedDrop: 2,
  maxCreditsPerSecond: 10,
}

export const LEGACY_OWNED_REWARD_IDS = DEFAULT_REWARD_CATALOG.map(reward => reward.id)
