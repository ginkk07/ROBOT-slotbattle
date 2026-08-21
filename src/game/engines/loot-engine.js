import { getLootTable } from '../data/loot-tables.js';
import { pickWeighted, randomInteger } from './weighted-random.js';

export function rollLoot(lootTableId, { rng = Math.random } = {}) {
  const table = getLootTable(lootTableId);
  const totals = new Map();

  for (let roll = 0; roll < table.rolls; roll += 1) {
    const entry = pickWeighted(table.entries, rng);
    const quantity = randomInteger(entry.quantity[0], entry.quantity[1], rng);
    totals.set(entry.itemId, (totals.get(entry.itemId) ?? 0) + quantity);
  }

  return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}
