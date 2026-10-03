import { query } from "@/lib/db/client";

export type PreferenceProfile = {
  positiveSignals: string[];
  negativeSignals: string[];
  factualCorrections: string[];
  confidence: "low" | "medium" | "high";
};

export async function readPreferenceProfile(userId?: string | null): Promise<PreferenceProfile> {
  if (!userId) {
    return { positiveSignals: [], negativeSignals: [], factualCorrections: [], confidence: "low" };
  }
  const result = await query<{
    event_type: string;
    reason: string | null;
    after_data: Record<string, unknown> | null;
    learning_status: string;
  }>(
    `SELECT event_type, reason, after_data, learning_status
       FROM tb_property_decision_events
      WHERE user_id = $1
        AND learning_status IN ('pending', 'accepted', 'applied')
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId],
  );
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  const factualCorrections: string[] = [];
  for (const event of result.rows) {
    const text = event.reason ?? event.event_type;
    if (
      ["favorite_added", "feedback_gostei", "feedback_quero_visitar", "feedback_priorizar_cobertura"].includes(
        event.event_type,
      )
    ) {
      positiveSignals.push(text);
    } else if (
      event.event_type === "property_dismissed" ||
      event.event_type.startsWith("feedback_")
    ) {
      negativeSignals.push(text);
    } else if (
      event.event_type.endsWith("_corrected") ||
      event.event_type === "classification_changed"
    ) {
      factualCorrections.push(text);
    }
  }
  const total = positiveSignals.length + negativeSignals.length + factualCorrections.length;
  return {
    positiveSignals: [...new Set(positiveSignals)].slice(0, 8),
    negativeSignals: [...new Set(negativeSignals)].slice(0, 8),
    factualCorrections: [...new Set(factualCorrections)].slice(0, 8),
    confidence: total >= 10 ? "high" : total >= 3 ? "medium" : "low",
  };
}

export function preferencePrompt(profile: PreferenceProfile) {
  return `CONTEXTO DE PREFERÊNCIAS (não substitui regras obrigatórias):
- Sinais positivos: ${profile.positiveSignals.join("; ") || "nenhum"}
- Sinais negativos: ${profile.negativeSignals.join("; ") || "nenhum"}
- Correções factuais: ${profile.factualCorrections.join("; ") || "nenhuma"}
- Confiança do perfil: ${profile.confidence}
Use esse contexto apenas para priorizar e esclarecer; nunca invente dados nem remova requisitos obrigatórios.`;
}
