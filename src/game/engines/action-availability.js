import { getItem } from '../data/items.js';
import { EffectType } from '../data/effect-types.js';
import { SkillActivation } from '../data/skill-effects.js';
import {
  getSkill,
  getSkillLevelDefinition,
  skillActivation,
  skillCost,
} from '../data/skills.js';
import { getStatus } from '../data/statuses.js';
import { playerSkillLevel } from './skill-progression.js';

/**
 * 玩家介面共用的技能／道具可用性判定。
 *
 * 戰鬥引擎仍會在真正執行時再次驗證，避免舊面板或連點繞過規則；
 * Discord 詳情卡與戰鬥按鈕則統一讀取這裡，避免顯示結果不一致。
 */
export function skillActionAvailability(state, skillId) {
  const skill = getSkill(skillId);
  const level = playerSkillLevel(state.player, skillId);

  if (level < 1) return blocked('這個技能不在目前持有的技能中');
  if (state.combatModifiers?.sealedSkillIds?.includes(skillId)) {
    return blocked('這項技能在本場戰鬥遭到封印');
  }
  if (skillActivation(skill) === SkillActivation.PASSIVE) {
    return blocked('被動技能會自動生效');
  }
  const phaseReason = playerActionBlockReason(state);
  if (phaseReason) return blocked(phaseReason);
  const definition = getSkillLevelDefinition(skillId, level);
  const cost = skillCost(skill, level);
  if (state.resources.mana < cost) {
    return blocked(`需要 ${cost} 點法力，目前只有 ${state.resources.mana} 點`);
  }
  if (onlyHealsSelf(definition.effects) && state.player.hp >= state.player.maxHp) {
    return blocked('生命已全滿');
  }
  if (onlyRefreshesExistingStatuses(definition.effects, state.player)) {
    return blocked('相同狀態目前仍在持續中');
  }
  const resourceReason = effectResourceBlockReason(definition.effects, state.resources);
  if (resourceReason) return blocked(resourceReason);

  return { usable: true, reason: null, level, definition, cost };
}

export function itemActionAvailability(state, itemId) {
  const item = getItem(itemId);
  if (item.type !== 'consumable') {
    return blocked('裝備持有時會自動生效');
  }

  const stack = state.player.inventory?.find((entry) => entry.itemId === itemId);
  if (!stack || stack.quantity < 1) return blocked('目前沒有可使用的數量');
  const phaseReason = playerActionBlockReason(state);
  if (phaseReason) return blocked(phaseReason);

  const actionCost = item.actionCost ?? 0;
  if (state.resources.action < actionCost) {
    return blocked(`需要 ${actionCost} 點行動點，目前只有 ${state.resources.action} 點`);
  }
  if (onlyHealsSelf(item.effects) && state.player.hp >= state.player.maxHp) {
    return blocked('生命已全滿');
  }

  return { usable: true, reason: null, quantity: stack.quantity };
}

function playerActionBlockReason(state) {
  if (state.status !== 'active' || state.phase !== 'player-turn') {
    return '目前不是玩家行動階段';
  }
  if (
    state.stunned
    || state.player.activeStatuses?.some((status) => status.statusId === 'stunned')
  ) {
    return '暈眩中無法使用';
  }
  return null;
}

function onlyHealsSelf(effects = []) {
  return effects.length > 0 && effects.every((effect) => (
    effect.type === 'heal' && effect.target === 'self'
  ));
}

function onlyRefreshesExistingStatuses(effects = [], player) {
  const statusEffects = effects.filter((effect) => (
    effect.type === 'apply-status' && effect.target === 'self'
  ));
  if (statusEffects.length === 0 || statusEffects.length !== effects.length) return false;

  return statusEffects.every((effect) => {
    const active = player.activeStatuses
      ?.find((status) => status.statusId === effect.statusId);
    if (!active) return false;
    const status = getStatus(effect.statusId);
    if (status.durationMode === 'battle') return true;
    if (status.durationMode === 'until-consumed') return true;
    if (status.stacking.mode === 'refresh-duration') return true;
    return Number(active.stacks ?? 1) >= status.stacking.maxStacks;
  });
}

function effectResourceBlockReason(effects = [], resources = {}) {
  for (const effect of effects) {
    if (effect.type !== EffectType.DAMAGE_FROM_RESOURCE) continue;
    const minimum = Number(effect.minimumResource ?? 0);
    if (Number(resources[effect.resource] ?? 0) >= minimum) continue;
    const label = { action: '❇️', armor: '🛡️', mana: '✨' }[effect.resource]
      ?? effect.resource;
    return `至少需要 ${minimum} 點${label}`;
  }
  return null;
}

function blocked(reason) {
  return { usable: false, reason };
}
