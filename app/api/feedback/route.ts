import { NextResponse } from "next/server";
import { z } from "zod";
import { appendFeedback } from "@/lib/storage";

const feedbackSchema = z.object({
  link: z.url(),
  action: z.enum([
    "Gostei",
    "Não gostei",
    "Muito caro",
    "Muito longe",
    "Quero visitar",
    "Não mostrar mais",
    "Não abre o link",
    "Priorizar cobertura",
    "Descartar cobertura",
    "Revisar cobertura",
  ]),
  note: z.string().max(500).optional(),
});

const learning: Record<z.infer<typeof feedbackSchema>["action"], string> = {
  Gostei: "Feedback positivo explícito; usar apenas os motivos informados para calibrar a preferência.",
  "Não gostei": "Feedback negativo explícito; não generalizar sem motivo declarado.",
  "Muito caro": "Preço percebido como alto; considerar o comentário antes de alterar o teto.",
  "Muito longe": "Distância percebida como inadequada; considerar o comentário para identificar o trajeto.",
  "Quero visitar": "Marcar como candidato ativo; não agendar sem autorização adicional.",
  "Não mostrar mais": "Excluir este anúncio das pesquisas futuras.",
  "Não abre o link": "Excluir este anúncio das pesquisas futuras porque o link não está acessível.",
  "Priorizar cobertura": "Preferência explícita por coberturas com características semelhantes; considerar o comentário para determinar quais.",
  "Descartar cobertura": "Rejeição explícita da cobertura; não generalizar sem motivo declarado.",
  "Revisar cobertura": "Cobertura mantida para avaliação futura, sem alterar critérios obrigatórios.",
};

export async function POST(request: Request) {
  const parsed = feedbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Feedback inválido." }, { status: 400 });
  }
  await appendFeedback({ ...parsed.data, learning: learning[parsed.data.action] });
  return NextResponse.json({ ok: true });
}
