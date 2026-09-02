import { createCatalog, requireDefinition } from './catalog.js';

export const ENCOUNTER_TABLES = createCatalog([
  {
    id: 'ruins-normal-encounter',
    pools: [
      {
        weight: 100,
        filter: {
          requiredTags: ['enemy', 'ruins'],
          excludedTags: ['elite', 'boss'],
        },
      },
    ],
  },
  {
    id: 'ruins-elite-encounter',
    pools: [
      {
        weight: 100,
        filter: {
          requiredTags: ['enemy', 'elite', 'ruins'],
          excludedTags: ['event-only'],
        },
      },
    ],
  },
  {
    id: 'ruins-boss-encounter',
    pools: [
      {
        weight: 100,
        filter: { requiredTags: ['enemy', 'boss', 'ruins'] },
      },
    ],
  },
], '遭遇表');

export function getEncounterTable(encounterTableId) {
  return requireDefinition(ENCOUNTER_TABLES, encounterTableId, '遭遇表');
}
