import { createCatalog, requireDefinition } from './catalog.js';
import { contentTypeEmoji } from './content-types.js';
import { ItemEffectTrigger, ItemEffectType } from './item-effects.js';
import { ContentRarity } from './rarities.js';
import { SymbolId } from '../symbols.js';

const EQUIPMENT_EMOJI = contentTypeEmoji('equipment');
const CONSUMABLE_EMOJI = contentTypeEmoji('consumable');

/**
 * 裝備只記錄「何時觸發」與「產生什麼效果」。戰鬥引擎依這些欄位
 * 統一結算，因此新增同類道具時不需要再用道具 ID 撰寫分支。
 */
function equipment({ id, name, rarity, description, equipmentEffects }) {
  return {
    id,
    name,
    emoji: EQUIPMENT_EMOJI,
    type: 'equipment',
    rarity,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    stackable: false,
    description,
    equipmentEffects,
  };
}

function consumable({
  id,
  name,
  rarity,
  description,
  effects = [],
  combatEffects = [],
  maxStack = 99,
}) {
  return {
    id,
    name,
    emoji: CONSUMABLE_EMOJI,
    type: 'consumable',
    rarity,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    stackable: true,
    maxStack,
    actionCost: 0,
    description,
    effects,
    combatEffects,
  };
}

export const ITEMS = createCatalog([
  equipment({
    id: 'sword',
    name: '劍',
    rarity: ContentRarity.COMMON,
    description: '戰鬥開始時獲得「攻擊力＋1」狀態，持續3回合。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.BATTLE_START,
      type: ItemEffectType.APPLY_EFFECTS,
      effects: [{
        type: 'apply-status',
        statusId: 'attack-up',
        target: 'self',
        chance: 1,
        duration: 3,
        potency: 1,
      }],
    }],
  }),
  equipment({
    id: 'lucky-clover',
    name: '幸運草',
    rarity: ContentRarity.COMMON,
    description: '[牌面🍀]出現的機率提升為10%。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.SYMBOL_ROLL,
      type: ItemEffectType.SET_SYMBOL_CHANCE,
      symbolId: SymbolId.LUCKY,
      chance: 0.1,
    }],
  }),
  equipment({
    id: 'croissant',
    name: '可頌麵包',
    rarity: ContentRarity.COMMON,
    description: '回合開始時回復生命1點。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_START,
      type: ItemEffectType.APPLY_EFFECTS,
      effects: [{ type: 'heal', amount: 1, target: 'self' }],
    }],
  }),
  equipment({
    id: 'red-oni-mask',
    name: '紅鬼面具',
    rarity: ContentRarity.COMMON,
    description: '菁英魔物的遭遇機率最低提升為20%。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.ENCOUNTER_ROLL,
      type: ItemEffectType.MINIMUM_ELITE_CHANCE,
      chance: 0.2,
    }],
  }),
  equipment({
    id: 'iron-shield',
    name: '鐵盾',
    rarity: ContentRarity.COMMON,
    description: '回合開始時獲得🛡️5點。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_START,
      type: ItemEffectType.GAIN_RESOURCE,
      resource: 'armor',
      amount: 5,
    }],
  }),
  equipment({
    id: 'shuriken',
    name: '手裡劍',
    rarity: ContentRarity.COMMON,
    description: '造成拉霸攻擊傷害時，額外傷害＋1。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.SPIN_DAMAGE,
      type: ItemEffectType.BONUS_DAMAGE,
      amount: 1,
    }],
  }),
  equipment({
    id: 'gamblers-left-hand',
    name: '賭徒左手',
    rarity: ContentRarity.COMMON,
    description: '投入拉霸的❇️等於目前❇️上限時，本次造成的拉霸傷害×2。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.SPIN_DAMAGE,
      type: ItemEffectType.MULTIPLY_DAMAGE,
      wagerEqualsActionLimit: true,
      multiplier: 2,
    }],
  }),

  equipment({
    id: 'rune-cube',
    name: '符文魔方',
    rarity: ContentRarity.RARE,
    description: '每次拉霸時出現[牌面🛡️]，就會額外獲得🛡️5點。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.GAIN_RESOURCE,
      requiresSymbolId: SymbolId.DEFENSE,
      resource: 'armor',
      amount: 5,
    }],
  }),
  equipment({
    id: 'lucky-coin',
    name: '幸運幣',
    rarity: ContentRarity.RARE,
    description: '回合中投入❇️5點時，有77%機率補充❇️1點。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.REFUND_RESOURCE,
      wager: 5,
      chance: 0.77,
      resource: 'action',
      amount: 1,
    }],
  }),
  equipment({
    id: 'star-staff',
    name: '星星法杖',
    rarity: ContentRarity.RARE,
    description: '每次拉霸時出現[牌面✨]，就會額外造成4點傷害。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.BONUS_DAMAGE,
      requiresSymbolId: SymbolId.SKILL,
      amount: 4,
    }],
  }),
  equipment({
    id: 'bounty-poster',
    name: '懸賞令',
    rarity: ContentRarity.RARE,
    description: '與BOSS或菁英魔物戰鬥時，第1回合獲得🛡️20點、攻擊力＋3。',
    equipmentEffects: [
      {
        trigger: ItemEffectTrigger.BATTLE_START,
        type: ItemEffectType.GAIN_RESOURCE,
        enemyRanks: ['elite', 'boss'],
        resource: 'armor',
        amount: 20,
      },
      {
        trigger: ItemEffectTrigger.BATTLE_START,
        type: ItemEffectType.APPLY_EFFECTS,
        enemyRanks: ['elite', 'boss'],
        effects: [{
          type: 'apply-status',
          statusId: 'bounty-attack-up',
          target: 'self',
          chance: 1,
          duration: 1,
          potency: 1,
        }],
      },
    ],
  }),
  equipment({
    id: 'singing-bowl',
    name: '頌缽',
    rarity: ContentRarity.RARE,
    description: '回復生命時✨＋1。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.HEAL,
      type: ItemEffectType.GAIN_RESOURCE_ON_HEAL,
      resource: 'mana',
      amount: 1,
    }],
  }),
  equipment({
    id: 'peace-charm',
    name: '平安符',
    rarity: ContentRarity.RARE,
    description: '受到傷害時，如果護甲抵擋後的傷害小於5，將傷害降低為1。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.DAMAGE_TAKEN,
      type: ItemEffectType.REDUCE_SMALL_DAMAGE,
      below: 5,
      to: 1,
    }],
  }),
  equipment({
    id: 'lucky-carrot',
    name: '幸運蘿蔔',
    rarity: ContentRarity.RARE,
    description: '拉霸出現[牌面🍀]時，每張[牌面🍀]會提升已出現的[牌面⚔️🛡️✨]獎勵階級。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.PROMOTE_WITH_LUCKY,
    }],
  }),

  equipment({
    id: 'vip-membership',
    name: 'VIP會員',
    rarity: ContentRarity.LEGENDARY,
    description: '每回合❇️上限＋1。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.BATTLE_START,
      type: ItemEffectType.INCREASE_ACTION_LIMIT,
      amount: 1,
    }],
  }),
  equipment({
    id: 'star-sea-compass',
    name: '星海羅盤',
    rarity: ContentRarity.LEGENDARY,
    description: '玩家回合結束時，對敵方造成等同於剩餘✨的傷害。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_END,
      type: ItemEffectType.DAMAGE_FROM_RESOURCE,
      resource: 'mana',
      element: 'arcane',
    }],
  }),
  equipment({
    id: 'flame-sword',
    name: '燃焰之劍',
    rarity: ContentRarity.LEGENDARY,
    description: '造成拉霸傷害時使燃燒層數＋1，並造成等同於目前燃燒層數的傷害。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.APPLY_BURN_AND_DAMAGE,
      statusId: 'burning',
      element: 'fire',
      stacks: 1,
    }],
  }),
  equipment({
    id: 'summer-gift-anchor',
    name: '夏賜儀碇',
    rarity: ContentRarity.LEGENDARY,
    description: '如果回合中沒有造成傷害，本場戰鬥❇️上限＋1；每個符合條件的回合都可累積。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_END,
      type: ItemEffectType.INCREASE_ACTION_LIMIT_IF_NO_DAMAGE,
      amount: 1,
    }],
  }),

  consumable({
    id: 'healing-potion',
    name: '生命藥水',
    rarity: ContentRarity.COMMON,
    description: '恢復10點生命。',
    effects: [{ type: 'heal', amount: 10, target: 'self' }],
  }),
  consumable({
    id: 'whetstone',
    name: '磨刀石',
    rarity: ContentRarity.COMMON,
    description: '下一次拉霸時，[牌面⚔️]出現機率提升為50%；拉霸後立即失效。',
    combatEffects: [{
      type: ItemEffectType.SET_SYMBOL_CHANCE,
      symbolId: SymbolId.ATTACK,
      chance: 0.5,
      duration: 'next-spin',
    }],
  }),
  consumable({
    id: 'hardening-potion',
    name: '堅硬藥劑',
    rarity: ContentRarity.COMMON,
    description: '立即獲得🛡️20點。',
    combatEffects: [{
      type: ItemEffectType.GAIN_RESOURCE,
      resource: 'armor',
      amount: 20,
    }],
  }),
  consumable({
    id: 'magic-mushroom',
    name: '魔菇',
    rarity: ContentRarity.COMMON,
    description: '立即獲得✨5點。',
    combatEffects: [{
      type: ItemEffectType.GAIN_RESOURCE,
      resource: 'mana',
      amount: 5,
    }],
  }),
  consumable({
    id: 'fire-bomb',
    name: '火焰炸彈',
    rarity: ContentRarity.RARE,
    maxStack: 20,
    description: '造成8點傷害，並附加3層[燃燒狀態]。',
    effects: [
      { type: 'damage', element: 'fire', amount: 8, target: 'enemy' },
      {
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 1,
        stacks: 3,
        potency: 1,
      },
    ],
  }),
], '道具庫');

export function getItem(itemId) {
  return requireDefinition(ITEMS, itemId, '道具庫');
}
