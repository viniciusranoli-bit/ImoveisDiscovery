export const rentCeiling = 12_000;

export function rentHistoryBands<T extends { rentAmount?: number }>(items: T[]) {
  const withinCeiling: T[] = [];
  const aboveCeiling: T[] = [];
  const unknown: T[] = [];
  for (const item of items) {
    if (item.rentAmount === undefined || !Number.isFinite(item.rentAmount)) unknown.push(item);
    else if (item.rentAmount <= rentCeiling) withinCeiling.push(item);
    else aboveCeiling.push(item);
  }
  return [
    { id: "within", label: "Até R$ 12.000", items: withinCeiling },
    { id: "above", label: "Acima de R$ 12.000", items: aboveCeiling },
    { id: "unknown", label: "Aluguel não informado", items: unknown },
  ].filter((group) => group.items.length > 0);
}
