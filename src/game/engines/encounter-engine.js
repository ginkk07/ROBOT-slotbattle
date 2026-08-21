import { getEncounterTable } from '../data/encounters.js';
import { UNITS } from '../data/units.js';
import { pickWeighted } from './weighted-random.js';

export function drawEncounter(
  encounterTableId,
  { units = Object.values(UNITS), rng = Math.random } = {},
) {
  const table = getEncounterTable(encounterTableId);
  const pool = pickWeighted(table.pools, rng);
  const candidates = filterUnits(units, pool.filter);

  if (candidates.length === 0) {
    throw new RangeError(`遭遇表 ${encounterTableId} 沒有符合條件的單位`);
  }

  return pickWeighted(candidates, rng, (unit) => unit.encounterWeight ?? 1);
}

export function filterUnits(units, filter = {}) {
  const requiredTags = filter.requiredTags ?? [];
  const excludedTags = filter.excludedTags ?? [];

  return units.filter((unit) => (
    requiredTags.every((tag) => unit.tags.includes(tag))
    && excludedTags.every((tag) => !unit.tags.includes(tag))
  ));
}
