/** Valor em tb_users.search_quota para buscas manuais ilimitadas. */
export const UNLIMITED_SEARCH_QUOTA = -1;

export const SEARCH_QUOTA_CHOICES = [10, 100, UNLIMITED_SEARCH_QUOTA] as const;

export type SearchQuotaChoice = (typeof SEARCH_QUOTA_CHOICES)[number];

export function normalizeAdminSearchQuota(value: number): SearchQuotaChoice {
  if (value === UNLIMITED_SEARCH_QUOTA) return UNLIMITED_SEARCH_QUOTA;
  if (value === 10 || value === 100) return value;
  throw new Error("A cota de buscas deve ser 10, 100 ou ilimitada.");
}

export function isUnlimitedSearchQuota(searchQuota: number) {
  return searchQuota < 0;
}

export function formatSearchQuota(searchQuota: number) {
  return isUnlimitedSearchQuota(searchQuota) ? "Ilimitada" : String(searchQuota);
}

export function formatSearchQuotaUsage(searchesUsed: number, searchQuota: number) {
  if (isUnlimitedSearchQuota(searchQuota)) {
    return `${searchesUsed} · ilimitada`;
  }
  return `${searchesUsed}/${searchQuota}`;
}

export function userRoleLabel(role: "user" | "admin") {
  return role === "admin" ? "Administrador" : "Comum";
}
