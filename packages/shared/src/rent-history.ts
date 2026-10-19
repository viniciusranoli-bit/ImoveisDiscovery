export const rentCeiling = 12_000;

export type RentHistoryFilter = "all" | "within" | "above" | "unknown";

export const rentHistoryFilters: Array<{ id: RentHistoryFilter; label: string }> = [
  { id: "all", label: "Todos os valores" },
  { id: "within", label: "Até R$ 12.000" },
  { id: "above", label: "Acima de R$ 12.000" },
  { id: "unknown", label: "Valor não informado" },
];

export function rentHistoryBands<T extends { rentAmount?: number; dismissed?: boolean }>(
  items: T[],
  filter: RentHistoryFilter = "all",
) {
  const active = items.filter((item) => !item.dismissed);
  const withinCeiling: T[] = [];
  const aboveCeiling: T[] = [];
  const unknown: T[] = [];
  for (const item of active) {
    if (item.rentAmount === undefined || !Number.isFinite(item.rentAmount)) unknown.push(item);
    else if (item.rentAmount <= rentCeiling) withinCeiling.push(item);
    else aboveCeiling.push(item);
  }
  const groups = [
    { id: "within", label: "Até R$ 12.000", items: withinCeiling },
    { id: "above", label: "Acima de R$ 12.000", items: aboveCeiling },
    { id: "unknown", label: "Aluguel não informado", items: unknown },
  ];
  return groups.filter((group) => (filter === "all" || group.id === filter) && group.items.length > 0);
}
