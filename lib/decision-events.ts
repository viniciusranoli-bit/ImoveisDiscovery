import { randomUUID } from "node:crypto";
import type { CollectedListing, ListingPurpose } from "./listings";
import { query } from "./db/client";

export type DecisionEventInput = {
  propertyId?: string | null;
  listingId?: string | null;
  userId?: string | null;
  eventType: string;
  source: "interface" | "ide" | "migration" | "system";
  purpose?: ListingPurpose;
  beforeData?: unknown;
  afterData?: unknown;
  changedFields?: string[];
  reason?: string;
  evidence?: string[];
  learningStatus?: "pending" | "accepted" | "rejected" | "applied";
};

export async function recordDecisionEvent(input: DecisionEventInput) {
  await query(
    `INSERT INTO tb_property_decision_events
      (id, property_id, listing_id, user_id, event_type, source, purpose,
       before_data, after_data, changed_fields, reason, evidence, learning_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13)`,
    [
      randomUUID(),
      input.propertyId ?? null,
      input.listingId ?? null,
      input.userId ?? null,
      input.eventType,
      input.source,
      input.purpose ?? null,
      input.beforeData === undefined ? null : JSON.stringify(input.beforeData),
      input.afterData === undefined ? null : JSON.stringify(input.afterData),
      JSON.stringify(input.changedFields ?? []),
      input.reason ?? null,
      JSON.stringify(input.evidence ?? []),
      input.learningStatus ?? "pending",
    ],
  );
}

export async function readDecisionEvents(options: {
  userId?: string;
  limit?: number;
  learningStatus?: string;
}) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (options.userId) {
    values.push(options.userId);
    conditions.push(`user_id = $${values.length}`);
  }
  if (options.learningStatus) {
    values.push(options.learningStatus);
    conditions.push(`learning_status = $${values.length}`);
  }
  values.push(Math.min(Math.max(options.limit ?? 100, 1), 500));
  const result = await query(
    `SELECT * FROM tb_property_decision_events
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return result.rows;
}

export function listingEventData(listing: CollectedListing) {
  return {
    listingId: listing.id,
    purpose: listing.purpose,
    title: listing.title,
    propertyType: listing.propertyType,
    price: listing.price,
    neighborhood: listing.neighborhood,
    location: listing.location,
    link: listing.link,
  };
}
