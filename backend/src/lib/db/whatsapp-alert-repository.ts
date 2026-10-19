import { randomUUID } from "node:crypto";
import { query } from "./client";
import {
  normalizeAlertRuleConfig,
  type WhatsAppAlertRule,
  type WhatsAppAlertRuleConfig,
} from "../alerts/alert-rule-engine";
import type { CollectedListing } from "../listings";
import type { PropertyFeatureAnalysis } from "../property-analysis";

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  config: WhatsAppAlertRuleConfig;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRule(row: RuleRow): WhatsAppAlertRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    config: normalizeAlertRuleConfig({ ...row.config, name: row.name }),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listWhatsAppAlertRules(scope?: { userId?: string; admin?: boolean }) {
  const admin = scope?.admin ?? false;
  const userId = scope?.userId;
  const result = await query<RuleRow>(
    admin || !userId
      ? `SELECT * FROM tb_whatsapp_alert_rules ORDER BY updated_at DESC`
      : `SELECT * FROM tb_whatsapp_alert_rules WHERE created_by = $1 ORDER BY updated_at DESC`,
    admin || !userId ? [] : [userId],
  );
  return result.rows.map(mapRule);
}

export async function readWhatsAppAlertRuleById(id: string) {
  const result = await query<RuleRow>(`SELECT * FROM tb_whatsapp_alert_rules WHERE id = $1`, [id]);
  return result.rows[0] ? mapRule(result.rows[0]) : undefined;
}

export async function assertWhatsAppRuleAccess(ruleId: string, userId: string, admin: boolean) {
  const rule = await readWhatsAppAlertRuleById(ruleId);
  if (!rule) throw new Error("Regra não encontrada.");
  if (!admin && rule.createdBy !== userId) {
    throw new Error("Esta regra pertence a outro usuário.");
  }
  return rule;
}

export async function readActiveWhatsAppAlertRules() {
  const result = await query<RuleRow>(
    `SELECT * FROM tb_whatsapp_alert_rules WHERE enabled = true ORDER BY updated_at DESC`,
  );
  return result.rows.map(mapRule);
}

export async function createWhatsAppAlertRule(input: {
  config: Partial<WhatsAppAlertRuleConfig>;
  createdBy?: string | null;
}) {
  const config = normalizeAlertRuleConfig(input.config);
  const id = randomUUID();
  await query(
    `
      INSERT INTO tb_whatsapp_alert_rules (id, name, enabled, config, created_by)
      VALUES ($1, $2, true, $3::jsonb, $4)
    `,
    [id, config.name, JSON.stringify(config), input.createdBy ?? null],
  );
  const created = await query<RuleRow>(`SELECT * FROM tb_whatsapp_alert_rules WHERE id = $1`, [id]);
  return mapRule(created.rows[0]!);
}

export async function updateWhatsAppAlertRule(input: {
  id: string;
  enabled?: boolean;
  config?: Partial<WhatsAppAlertRuleConfig>;
}) {
  const current = await query<RuleRow>(`SELECT * FROM tb_whatsapp_alert_rules WHERE id = $1`, [
    input.id,
  ]);
  if (!current.rows[0]) throw new Error("Regra não encontrada.");
  const row = current.rows[0];
  const config = input.config
    ? normalizeAlertRuleConfig({ ...row.config, ...input.config, name: input.config.name ?? row.name })
    : normalizeAlertRuleConfig({ ...row.config, name: row.name });
  await query(
    `
      UPDATE tb_whatsapp_alert_rules
      SET name = $2,
          enabled = COALESCE($3, enabled),
          config = $4::jsonb,
          updated_at = now()
      WHERE id = $1
    `,
    [input.id, config.name, input.enabled ?? null, JSON.stringify(config)],
  );
  const updated = await query<RuleRow>(`SELECT * FROM tb_whatsapp_alert_rules WHERE id = $1`, [
    input.id,
  ]);
  return mapRule(updated.rows[0]!);
}

export async function deleteWhatsAppAlertRule(id: string) {
  await query(`DELETE FROM tb_whatsapp_alert_rules WHERE id = $1`, [id]);
}

export async function readRecentWhatsAppDeliveries(
  limit = 50,
  scope?: { userId?: string; admin?: boolean },
) {
  const admin = scope?.admin ?? false;
  const userId = scope?.userId;
  const result = await query<{
    id: string;
    rule_id: string;
    rule_name: string;
    property_id: string | null;
    listing_link: string | null;
    status: string;
    error: string | null;
    sent_at: Date;
  }>(
    `
      SELECT
        delivery.id,
        delivery.rule_id,
        rule.name AS rule_name,
        delivery.property_id,
        delivery.listing_link,
        delivery.status,
        delivery.error,
        delivery.sent_at
      FROM tb_whatsapp_alert_deliveries delivery
      JOIN tb_whatsapp_alert_rules rule ON rule.id = delivery.rule_id
      WHERE ($2::boolean = true OR rule.created_by = $3)
      ORDER BY delivery.sent_at DESC
      LIMIT $1
    `,
    [Math.min(Math.max(limit, 1), 200), admin || !userId, userId ?? null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    propertyId: row.property_id,
    listingLink: row.listing_link,
    status: row.status,
    error: row.error,
    sentAt: row.sent_at.toISOString(),
  }));
}

export async function hasRecentDelivery(idempotencyKey: string, cooldownMinutes: number) {
  if (cooldownMinutes <= 0) {
    const exists = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM tb_whatsapp_alert_deliveries WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return Number(exists.rows[0]?.count ?? 0) > 0;
  }
  const recent = await query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM tb_whatsapp_alert_deliveries
      WHERE idempotency_key = $1
        AND sent_at > now() - ($2::text || ' minutes')::interval
    `,
    [idempotencyKey, String(cooldownMinutes)],
  );
  return Number(recent.rows[0]?.count ?? 0) > 0;
}

export async function recordWhatsAppDelivery(input: {
  ruleId: string;
  propertyId: string | null;
  listingLink: string;
  idempotencyKey: string;
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string;
  error?: string;
}) {
  await query(
    `
      INSERT INTO tb_whatsapp_alert_deliveries (
        id, rule_id, property_id, listing_link, idempotency_key,
        status, provider_message_id, error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (idempotency_key) DO UPDATE SET
        status = EXCLUDED.status,
        provider_message_id = COALESCE(EXCLUDED.provider_message_id, tb_whatsapp_alert_deliveries.provider_message_id),
        error = EXCLUDED.error,
        sent_at = now()
    `,
    [
      randomUUID(),
      input.ruleId,
      input.propertyId,
      input.listingLink,
      input.idempotencyKey,
      input.status,
      input.providerMessageId ?? null,
      input.error ?? null,
    ],
  );
}

export async function readRunAlertCandidates(runId: string) {
  const result = await query<{
    property_id: string;
    listing_snapshot: CollectedListing;
    analysis_result: PropertyFeatureAnalysis | null;
  }>(
    `
      SELECT
        sr.property_id,
        sr.listing_snapshot,
        latest.result AS analysis_result
      FROM tb_search_results sr
      LEFT JOIN LATERAL (
        SELECT pa.result
        FROM tb_property_analyses pa
        WHERE pa.property_id = sr.property_id
          AND pa.analysis_kind = 'features'
          AND pa.purpose = 'sale'
        ORDER BY pa.analyzed_at DESC
        LIMIT 1
      ) latest ON true
      WHERE sr.search_run_id = $1
        AND sr.eligible_for_research = true
    `,
    [runId],
  );
  return result.rows.map((row) => ({
    propertyId: row.property_id,
    listing: row.listing_snapshot,
    analysis: row.analysis_result,
  }));
}
