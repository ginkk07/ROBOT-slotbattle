/**
 * 建立以 id 為索引的唯讀資料庫，並在啟動時提早攔截重複或缺少 id 的資料。
 */
export function createCatalog(definitions, catalogName) {
  if (!Array.isArray(definitions)) {
    throw new TypeError(`${catalogName} 必須是陣列`);
  }

  const entries = definitions.map((definition) => {
    if (!definition || typeof definition.id !== 'string' || !definition.id) {
      throw new TypeError(`${catalogName} 中每筆資料都必須有 id`);
    }

    return [definition.id, deepFreeze(structuredClone(definition))];
  });

  if (new Set(entries.map(([id]) => id)).size !== entries.length) {
    throw new Error(`${catalogName} 中存在重複 id`);
  }

  return Object.freeze(Object.fromEntries(entries));
}

export function requireDefinition(catalog, id, catalogName) {
  const definition = catalog[id];
  if (!definition) {
    throw new RangeError(`${catalogName} 找不到 id：${id}`);
  }

  return definition;
}

export function listDefinitions(catalog) {
  return Object.freeze(Object.values(catalog));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
