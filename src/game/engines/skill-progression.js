import { PLAYER_PROGRESSION_RULES } from '../data/player-progression.js';
import { getSkill, getSkillMaxLevel } from '../data/skills.js';

export function normalizePlayerSkills(player) {
  const next = structuredClone(player);
  next.skillIds = [...new Set(next.skillIds ?? [])]
    .filter((skillId) => {
      getSkill(skillId);
      return true;
    });
  next.skillLevels = Object.fromEntries(next.skillIds.map((skillId) => [
    skillId,
    normalizeLevel(skillId, next.skillLevels?.[skillId]),
  ]));
  return next;
}

export function playerSkillLevel(player, skillId) {
  if (!player.skillIds?.includes(skillId)) return 0;
  return normalizeLevel(skillId, player.skillLevels?.[skillId]);
}

export function skillRewardEligibility(player, skillId) {
  const currentLevel = playerSkillLevel(player, skillId);
  if (currentLevel > 0) {
    const maximum = skillMaximum(skillId);
    if (currentLevel >= maximum) return null;
    return { acquisition: 'level-up', currentLevel, targetLevel: currentLevel + 1 };
  }
  if ((player.skillIds?.length ?? 0) >= PLAYER_PROGRESSION_RULES.maxHeldSkills) {
    return null;
  }
  return { acquisition: 'learn', currentLevel: 0, targetLevel: 1 };
}

export function grantSkillReward(player, skillId) {
  const eligibility = skillRewardEligibility(player, skillId);
  if (!eligibility) throw new Error('這個技能目前無法取得或升級');
  const next = normalizePlayerSkills(player);
  if (eligibility.acquisition === 'learn') next.skillIds.push(skillId);
  next.skillLevels[skillId] = eligibility.targetLevel;
  return {
    player: normalizePlayerSkills(next),
    ...eligibility,
  };
}

export function forgetSkill(player, skillId) {
  const next = normalizePlayerSkills(player);
  if (!next.skillIds.includes(skillId)) return next;
  next.skillIds = next.skillIds.filter((id) => id !== skillId);
  delete next.skillLevels[skillId];
  return next;
}

export function skillMaximum(skillId) {
  return getSkillMaxLevel(skillId, PLAYER_PROGRESSION_RULES.maxSkillLevel);
}

function normalizeLevel(skillId, value) {
  const maximum = skillMaximum(skillId);
  const level = Number(value ?? 1);
  if (!Number.isInteger(level) || level < 1) return 1;
  return Math.min(level, maximum);
}
