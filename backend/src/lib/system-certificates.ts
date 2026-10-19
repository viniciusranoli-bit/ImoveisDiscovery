import { getCACertificates, setDefaultCACertificates } from "node:tls";

let applied = false;

/** Faz o fetch do processo confiar nas CAs instaladas no sistema, não só nas empacotadas pelo Node. */
export function ensureSystemCertificates() {
  if (applied) return;
  const certificates = getCACertificates("system");
  if (certificates.length === 0) return;
  setDefaultCACertificates(certificates);
  applied = true;
}
