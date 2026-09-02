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
    id: 'thorns',
    name: '荊棘',
    rarity: ContentRarity.COMMON,
    description: '戰鬥開始時獲得5層傷害反射；實際受到HP傷害時，對傷害來源造成5點反射傷害。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.BATTLE_START,
      type: ItemEffectType.APPLY_EFFECTS,
      effects: [{
        type: 'apply-status',
        statusId: 'damage-reflection',
        target: 'self',
        chance: 1,
        stacks: 5,
        potency: 1,
      }],
    }],
  }),
  equipment({
    id: 'magic-stone',
    name: '魔石',
    rarity: ContentRarity.COMMON,
    description: '回合開始時獲得1點✨。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_START,
      type: ItemEffectType.GAIN_RESOURCE,
      resource: 'mana',
      amount: 1,
    }],
  }),
  equipment({
    id: 'shuriken',
    name: '手裡劍',
    rarity: ContentRarity.COMMON,
    description: '每次拉霸使本回合手裡劍額外傷害＋1，回合結束時清零。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.INCREASE_EXTRA_DAMAGE_EACH_SPIN,
      amount: 1,
      element: 'physical',
    }],
  }),
  equipment({
    id: 'regeneration-herb',
    name: '再生藥草',
    rarity: ContentRarity.COMMON,
    description: '戰鬥結束時，回復6點生命。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.BATTLE_END,
      type: ItemEffectType.APPLY_EFFECTS,
      effects: [{ type: 'heal', amount: 6, target: 'self' }],
    }],
  }),
  equipment({
    id: 'tinder-bag',
    name: '火種袋',
    rarity: ContentRarity.COMMON,
    description: '戰鬥開始時，使敵人獲得3層燃燒。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.BATTLE_START,
      type: ItemEffectType.APPLY_EFFECTS,
      effects: [{
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 1,
        stacks: 3,
        potency: 1,
      }],
    }],
  }),
  equipment({
    id: 'black-cat-tail',
    name: '黑貓尾巴',
    rarity: ContentRarity.COMMON,
    description: '每次拉霸出現💀時，HP最大值＋2；每次拉霸最多觸發一次。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.INCREASE_MAX_HP,
      requiresSymbolId: SymbolId.UNLUCKY,
      amount: 2,
    }],
  }),
  equipment({
    id: 'insurance-contract',
    name: '保險契約',
    rarity: ContentRarity.COMMON,
    description: '玩家回合結束時，🛡️低於6點則補充至6點。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_END,
      type: ItemEffectType.ENSURE_MINIMUM_RESOURCE,
      resource: 'armor',
      minimum: 6,
    }],
  }),
  equipment({
    id: 'elemental-bottle',
    name: '元素瓶',
    rarity: ContentRarity.COMMON,
    description: '造成額外傷害時，該次額外傷害＋1；沒有額外傷害時不會觸發。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.EXTRA_DAMAGE,
      type: ItemEffectType.BONUS_DAMAGE,
      amount: 1,
    }],
  }),
  equipment({
    id: 'blood-leech',
    name: '血蛭',
    rarity: ContentRarity.COMMON,
    description: '每回合第一次造成拉霸傷害時，恢復3點生命。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN_DAMAGE,
      type: ItemEffectType.HEAL_ON_FIRST_SPIN_DAMAGE,
      amount: 3,
    }],
  }),
  equipment({
    id: 'voodoo-doll',
    name: '巫毒人偶',
    rarity: ContentRarity.COMMON,
    description: '拉霸傷害結算後，每出現1個💀，敵我雙方各獲得1層詛咒。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.APPLY_STATUS_PER_SYMBOL,
      symbolId: SymbolId.UNLUCKY,
      statusId: 'curse',
      targets: ['self', 'enemy'],
      stacksPerSymbol: 1,
    }],
  }),
  equipment({
    id: 'prayer-beads',
    name: '佛珠',
    rarity: ContentRarity.COMMON,
    description: '每次受到詛咒傷害時減少3點，最低為0。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.DAMAGE_TAKEN,
      type: ItemEffectType.REDUCE_DAMAGE_SOURCE,
      damageSource: 'curse',
      amount: 3,
    }],
  }),
  equipment({
    id: 'shock-device',
    name: '電擊裝置',
    rarity: ContentRarity.COMMON,
    description: '每場戰鬥1次，進入暈眩狀態時自動解除。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.STATUS_APPLIED,
      type: ItemEffectType.REMOVE_STATUS_ONCE,
      statusId: 'stunned',
      usesPerBattle: 1,
    }],
  }),
  equipment({
    id: 'first-aid-kit',
    name: '急救包',
    rarity: ContentRarity.COMMON,
    description: '治療效果提升40%，小數四捨五入。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.HEALING_AMOUNT,
      type: ItemEffectType.MULTIPLY_HEALING,
      multiplier: 1.4,
      rounding: 'round',
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
    description: '每次拉霸時出現[牌面🛡️]，就會額外獲得🛡️4點。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.GAIN_RESOURCE,
      requiresSymbolId: SymbolId.DEFENSE,
      resource: 'armor',
      amount: 4,
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
    description: '每次拉霸出現[牌面✨]時，造成4點額外傷害。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.AFTER_SPIN,
      type: ItemEffectType.BONUS_DAMAGE,
      requiresSymbolId: SymbolId.SKILL,
      amount: 4,
      element: 'arcane',
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
    id: 'cursed-snake-scale',
    name: '詛咒蛇麟',
    rarity: ContentRarity.RARE,
    description: '敵人行動結束後保留剩餘✨，但無法獲得🛡️。',
    equipmentEffects: [
      {
        // 只保留同一場戰鬥的跨回合法力；勝利、換敵人與遊戲結束仍會清空。
        trigger: ItemEffectTrigger.TURN_RESOURCES_CLEAR,
        type: ItemEffectType.PRESERVE_RESOURCE,
        resource: 'mana',
      },
      {
        // 所有護甲來源都會經過共用資源入口，因此不必逐一道具寫例外。
        trigger: ItemEffectTrigger.RESOURCE_GAIN,
        type: ItemEffectType.BLOCK_RESOURCE_GAIN,
        resource: 'armor',
      },
    ],
  }),
  equipment({
    id: 'demon-blood',
    name: '惡魔之血',
    rarity: ContentRarity.RARE,
    description: '每次拉霸至少出現1個💀；💀同時視為🍀計算傷害、🛡️與✨，但3個💀仍會暈眩。',
    equipmentEffects: [
      {
        trigger: ItemEffectTrigger.SYMBOL_ROLL,
        type: ItemEffectType.MINIMUM_SYMBOL_COUNT,
        symbolId: SymbolId.UNLUCKY,
        count: 1,
      },
      {
        trigger: ItemEffectTrigger.AFTER_SPIN,
        type: ItemEffectType.TREAT_SYMBOL_AS_LUCKY,
        symbolId: SymbolId.UNLUCKY,
      },
    ],
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
    description: '玩家回合結束時，依剩餘✨對敵人造成等量額外傷害。',
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
    description: '造成拉霸傷害時使燃燒層數＋1，並造成等同於目前燃燒層數的額外傷害。',
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
    description: '如果本回合沒有造成傷害，本場戰鬥❇️上限＋1，最多＋5；造成傷害時清除累積。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.PLAYER_TURN_END,
      type: ItemEffectType.INCREASE_ACTION_LIMIT_IF_NO_DAMAGE,
      amount: 1,
      // 此上限只限制夏賜儀碇的戰鬥內累積，不包含VIP會員等其他加成。
      maxBonus: 5,
      resetOnDamage: true,
    }],
  }),
  equipment({
    id: 'diamond',
    name: '金剛石',
    rarity: ContentRarity.LEGENDARY,
    description: '敵人行動結束後，保留一半剩餘🛡️至下一回合（向下取整）。',
    equipmentEffects: [{
      trigger: ItemEffectTrigger.TURN_RESOURCES_CLEAR,
      type: ItemEffectType.PRESERVE_RESOURCE,
      resource: 'armor',
      ratio: 0.5,
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
    description: '立即獲得🛡️15點。',
    combatEffects: [{
      type: ItemEffectType.GAIN_RESOURCE,
      resource: 'armor',
      amount: 15,
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
    description: '造成8點額外傷害，並附加3層[燃燒狀態]。',
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
