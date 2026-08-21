import { ACHIEVEMENTS } from '../game/data/achievements.js';

export function settleRunProfile(
  profile,
  endSummary,
  { achievements = Object.values(ACHIEVEMENTS) } = {},
) {
  if (!endSummary?.runId) throw new TypeError('結算成就需要遊戲結算資料');
  const next = structuredClone(profile);
  next.achievementIds ??= [];
  next.settledRunIds ??= [];
  next.lifetimeStats ??= { runsEnded: 0, unitsDefeated: 0 };

  if (next.settledRunIds.includes(endSummary.runId)) {
    return {
      profile: next,
      changed: false,
      newAchievementIds: [],
      newUnlockSkillIds: [],
      newUnlockItemIds: [],
    };
  }

  next.lifetimeStats.runsEnded += 1;
  next.lifetimeStats.unitsDefeated += endSummary.defeatedUnitCount;
  const newAchievements = achievements.filter((achievement) => (
    !next.achievementIds.includes(achievement.id)
    && achievementCompleted(achievement, endSummary, next.lifetimeStats)
  ));
  const newAchievementIds = newAchievements.map((achievement) => achievement.id);
  const newUnlockSkillIds = unique(newAchievements.flatMap((achievement) => (
    achievement.unlockSkillIds ?? []
  ))).filter((id) => !next.unlockedStartingSkillIds.includes(id));
  const newUnlockItemIds = unique(newAchievements.flatMap((achievement) => (
    achievement.unlockItemIds ?? []
  ))).filter((id) => !next.unlockedStartingItemIds.includes(id));

  next.achievementIds.push(...newAchievementIds);
  next.unlockedStartingSkillIds.push(...newUnlockSkillIds);
  next.unlockedStartingItemIds.push(...newUnlockItemIds);
  next.settledRunIds = [...next.settledRunIds, endSummary.runId].slice(-50);

  return {
    profile: next,
    changed: true,
    newAchievementIds,
    newUnlockSkillIds,
    newUnlockItemIds,
  };
}

function achievementCompleted(achievement, summary, lifetimeStats) {
  const condition = achievement.condition;
  if (!condition) return false;
  if (condition.type === 'run-defeated-units') {
    return summary.defeatedUnitCount >= condition.minimum;
  }
  if (condition.type === 'run-defeated-rank') {
    return Number(summary.defeatedByRank?.[condition.rank] ?? 0) >= condition.minimum;
  }
  if (condition.type === 'lifetime-defeated-units') {
    return lifetimeStats.unitsDefeated >= condition.minimum;
  }
  if (condition.type === 'runs-ended') {
    return lifetimeStats.runsEnded >= condition.minimum;
  }
  return false;
}

function unique(values) {
  return [...new Set(values)];
}
