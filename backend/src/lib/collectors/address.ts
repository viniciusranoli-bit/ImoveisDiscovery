import { z } from "zod";

const streetPattern =
  /((?:rua|r\.|avenida|av\.|alameda|travessa|tv\.|praia|estrada|largo|boulevard|rodovia|viela)\s+.+?)(?=tamanho|quantidade|quartos?|dormit[oó]rios?|banheiros?|vagas?|garagem|cond\.?|iptu|contatar|aluguel|venda|r\$|\d+\s*m[²2]|,|·|\n|$)/i;

const structuredAddressPattern = /"(?:streetAddress|address)"\s*:\s*"([^"]{4,120})"/i;

export function extractPublishedAddress(text: string) {
  const structured = text.match(structuredAddressPattern)?.[1];
  const street = text.match(streetPattern)?.[1];
  const candidate = cleanAddress(structured ?? street ?? "");
  if (!candidate || candidate.length < 6) return undefined;
  if (/^(rua|avenida|av\.|praia|travessa|estrada)$/i.test(candidate)) return undefined;
  return candidate;
}

export function acceptQuotedAddress(sourceText: string, address?: string | null, quote?: string | null) {
  const publishedAddress = cleanAddress(address ?? "");
  const publishedQuote = cleanAddress(quote ?? "");
  if (!publishedAddress || !publishedQuote) return undefined;
  const source = normalizeForComparison(sourceText);
  if (!source.includes(normalizeForComparison(publishedQuote))) return undefined;
  if (!normalizeForComparison(publishedQuote).includes(normalizeForComparison(publishedAddress))) {
    return undefined;
  }
  return extractPublishedAddress(publishedQuote) ?? publishedAddress;
}

const addressResponseSchema = z.object({
  address: z.string().max(160).nullable(),
  quote: z.string().max(300).nullable(),
});

export function parseAddressCompletion(sourceText: string, content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const parsed = addressResponseSchema.parse(JSON.parse(fenced));
  return acceptQuotedAddress(sourceText, parsed.address, parsed.quote);
}

function cleanAddress(value: string) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[|,;:.]+$/g, "")
    .trim()
    .slice(0, 160);
}

function normalizeForComparison(value: string) {
  return cleanAddress(value).toLocaleLowerCase("pt-BR");
}
