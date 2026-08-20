export const SymbolId = Object.freeze({
  ATTACK: 'attack',
  DEFENSE: 'defense',
  SKILL: 'skill',
  LUCKY: 'lucky',
  UNLUCKY: 'unlucky',
});

export const ALL_SYMBOLS = Object.freeze(Object.values(SymbolId));

export const SYMBOL_META = Object.freeze({
  [SymbolId.ATTACK]: Object.freeze({ label: '攻擊', emoji: '⚔️', probability: 0.3 }),
  [SymbolId.DEFENSE]: Object.freeze({ label: '防禦', emoji: '🛡️', probability: 0.3 }),
  [SymbolId.SKILL]: Object.freeze({ label: '技能', emoji: '✨', probability: 0.3 }),
  [SymbolId.LUCKY]: Object.freeze({ label: '幸運', emoji: '🍀', probability: 0.05 }),
  [SymbolId.UNLUCKY]: Object.freeze({ label: '不幸', emoji: '💀', probability: 0.05 }),
});

export function isSymbol(value) {
  return ALL_SYMBOLS.includes(value);
}

export function formatReels(reels) {
  return reels.map((symbol) => SYMBOL_META[symbol].emoji).join(' ｜ ');
}
