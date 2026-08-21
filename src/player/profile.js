export const PLAYER_SAVE_VERSION = 1;

export function createDefaultProfile(playerId) {
  if (!playerId) throw new TypeError('建立玩家資料需要 playerId');

  return {
    playerId,
    saveVersion: PLAYER_SAVE_VERSION,
    unlockedStartingSkillIds: ['life-recovery'],
    unlockedStartingItemIds: ['healing-potion'],
    startingSkillSlots: 1,
    startingItemSlots: 1,
    lastStartingLoadout: {
      skillIds: ['life-recovery'],
      itemIds: ['healing-potion'],
    },
  };
}
