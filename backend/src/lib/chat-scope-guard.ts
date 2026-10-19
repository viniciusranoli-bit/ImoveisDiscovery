const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(receita|bolo|macarrão|churrasco\s+de\s+carne)\b/i,
  /\b(python|javascript|typescript|react|sql injection|programa(r|ção))\b/i,
  /\b(bitcoin|criptomoeda|ação\s+na\s+bolsa|investir\s+em)\b/i,
  /\b(futebol|flamengo|vasco|política|eleição|presidente)\b/i,
  /\b(quem\s+inventou|capital\s+da\s+frança|história\s+do\s+brasil)\b/i,
  /\b(poema|música|letra\s+de|filme\s+sobre)\b/i,
];

const ON_TOPIC_PATTERNS: RegExp[] = [
  /\b(im[óo]vel|im[óo]veis|apartamento|cobertura|an[úu]ncio|aluguel|compra|venda)\b/i,
  /\b(laje|churrasqueira|varanda|terraço|vaga|garagem|quarto|condom[íi]nio|iptu)\b/i,
  /\b(botafogo|metr[ôo]|bairro|localiza[çc][ãa]o|prioridade|filtro|busca|radar)\b/i,
  /\b(quinto\s*andar|zap|viva\s*real|imovelweb|loft)\b/i,
  /\b(favorito|descart|penthouse|eleg[íi]vel|teto\s+de\s+preço)\b/i,
];

export const CHAT_OFF_TOPIC_REPLY =
  "Só posso ajudar com imóveis deste radar: critérios de busca, filtros, prioridades, anúncios já coletados e uso do painel. Reformule sua pergunta nesse contexto.";

export function isObviouslyOffTopicUserMessage(message: string) {
  const text = message.trim();
  if (!text) return false;
  const onTopic = onTopicPatternsMatch(text);
  if (onTopic) return false;
  return OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
}

function onTopicPatternsMatch(text: string) {
  return ON_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
}

export function finalizeChatAssistantScope(
  parsed: { inScope?: boolean; reply: string },
  userMessage: string,
): { inScope: boolean; reply: string; refused: boolean } {
  if (isObviouslyOffTopicUserMessage(userMessage)) {
    return { inScope: false, reply: CHAT_OFF_TOPIC_REPLY, refused: true };
  }
  if (parsed.inScope === false) {
    return { inScope: false, reply: CHAT_OFF_TOPIC_REPLY, refused: true };
  }
  return { inScope: true, reply: parsed.reply, refused: false };
}
