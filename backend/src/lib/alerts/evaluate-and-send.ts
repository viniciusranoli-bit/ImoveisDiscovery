import {
  alertIdempotencyKey,
  buildAlertMessage,
  listingMatchesAlertRule,
} from "./alert-rule-engine";
import { EvolutionWhatsAppChannel } from "./evolution-whatsapp";
import { readUserWhatsAppPhone } from "../auth/users";
import {
  hasRecentDelivery,
  readActiveWhatsAppAlertRules,
  readRunAlertCandidates,
  recordWhatsAppDelivery,
} from "../db/whatsapp-alert-repository";
import type { WhatsAppAlertRule } from "./alert-rule-engine";

async function resolveRuleNotifyPhones(rule: WhatsAppAlertRule) {
  if (rule.createdBy) {
    const ownerPhone = await readUserWhatsAppPhone(rule.createdBy);
    if (ownerPhone) return [ownerPhone];
  }
  return rule.config.notifyPhonesE164;
}

export async function evaluateAlertsForRun(
  runId: string,
  options: { requireAnalysis: boolean } = { requireAnalysis: false },
) {
  const rules = await readActiveWhatsAppAlertRules();
  if (!rules.length) return { evaluated: 0, sent: 0, failed: 0, skipped: 0 };

  const candidates = await readRunAlertCandidates(runId);
  const channel = new EvolutionWhatsAppChannel();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const rule of rules) {
    const notifyPhones = await resolveRuleNotifyPhones(rule);
    if (!notifyPhones.length) continue;
    for (const candidate of candidates) {
      const matches = listingMatchesAlertRule({
        listing: candidate.listing,
        analysis: candidate.analysis,
        rule: rule.config,
        requireAnalysis: options.requireAnalysis,
      });
      if (!matches) continue;

      const idempotencyKey = alertIdempotencyKey(rule.id, candidate.propertyId);
      if (await hasRecentDelivery(idempotencyKey, rule.config.cooldownMinutes)) {
        skipped += 1;
        continue;
      }

      const text = buildAlertMessage(candidate.listing, candidate.analysis);
      for (const phone of notifyPhones) {
        try {
          const result = await channel.send({ to: phone, text });
          await recordWhatsAppDelivery({
            ruleId: rule.id,
            propertyId: candidate.propertyId,
            listingLink: candidate.listing.link,
            idempotencyKey,
            status: "sent",
            providerMessageId: result.providerMessageId,
          });
          sent += 1;
          break;
        } catch (error) {
          await recordWhatsAppDelivery({
            ruleId: rule.id,
            propertyId: candidate.propertyId,
            listingLink: candidate.listing.link,
            idempotencyKey,
            status: "failed",
            error: error instanceof Error ? error.message : "Falha no envio.",
          });
          failed += 1;
        }
      }
    }
  }

  return { evaluated: candidates.length, sent, failed, skipped };
}
