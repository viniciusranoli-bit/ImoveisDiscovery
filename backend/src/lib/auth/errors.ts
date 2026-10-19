export function authFailureMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  const details = [
    error.message,
    ...(error instanceof AggregateError
      ? error.errors.map((item) => (item instanceof Error ? item.message : String(item)))
      : []),
  ]
    .filter(Boolean)
    .join(" ");

  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|connection timeout|connect ECONN/i.test(details)) {
    return "Banco de dados indisponível. Inicie o PostgreSQL e tente de novo.";
  }

  return error.message?.trim() || fallback;
}
