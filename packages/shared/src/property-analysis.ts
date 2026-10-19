import { z } from "zod";

export const propertyFeatureAnalysisSchema = z.object({
  slabRights: z.enum([
    "document_claimed",
    "mentioned_unverified",
    "not_mentioned",
    "ambiguous",
  ]),
  balconyBarbecue: z.enum(["explicit", "not_mentioned", "ambiguous"]),
  evidence: z
    .array(
      z.object({
        feature: z.enum(["slab_rights", "balcony_barbecue"]),
        quote: z.string().max(500),
      }),
    )
    .max(6),
  summary: z.string().max(600),
});

export type PropertyFeatureAnalysis = z.infer<typeof propertyFeatureAnalysisSchema>;

export type SavedPropertyAnalysis = PropertyFeatureAnalysis & {
  listingId: string;
  runId: string;
  analyzedAt: string;
  model: string;
  descriptionSource: string;
};

export function parsePropertyFeatureAnalysis(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  return propertyFeatureAnalysisSchema.parse(JSON.parse(fenced));
}
