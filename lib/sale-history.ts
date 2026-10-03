export type SaleHistoryFilter =
  | "all"
  | "slab_rights"
  | "balcony_barbecue"
  | "both"
  | "ambiguous";

export type SaleHistoryItem = {
  category: "both" | "slab_rights" | "balcony_barbecue" | "none" | "ambiguous";
  propertyType?: "apartment" | "penthouse";
  penthouseDisposition?: "saved" | "dismissed" | null;
  dismissed?: boolean;
};

export const saleHistoryFilters: Array<{ id: SaleHistoryFilter; label: string }> = [
  { id: "all", label: "Todos com interesse" },
  { id: "both", label: "Laje e churrasqueira" },
  { id: "slab_rights", label: "Com laje" },
  { id: "balcony_barbecue", label: "Com churrasqueira" },
  { id: "ambiguous", label: "Esperando análise" },
];

function isDismissed(item: SaleHistoryItem) {
  return (
    item.dismissed === true ||
    (item.propertyType === "penthouse" && item.penthouseDisposition === "dismissed")
  );
}

function matchesFilter(item: SaleHistoryItem, filter: SaleHistoryFilter) {
  if (filter === "all") return item.category !== "none";
  if (filter === "ambiguous") return item.category === "ambiguous";
  return item.category === filter;
}

export function saleHistorySections<T extends SaleHistoryItem>(
  items: T[],
  filter: SaleHistoryFilter,
) {
  const active = items.filter((item) => !isDismissed(item));
  const withInterest = active.filter((item) => item.category !== "none");
  const withoutFeatures = active.filter((item) => item.category === "none");
  const filteredInterest = withInterest.filter((item) => matchesFilter(item, filter));

  return [
    {
      id: "interest",
      label: "Com laje e/ou churrasqueira ou precisando de análise",
      items: filteredInterest,
    },
    {
      id: "none",
      label: "Sem laje e churrasqueira",
      items: withoutFeatures,
    },
  ].filter((group) => group.items.length > 0);
}
