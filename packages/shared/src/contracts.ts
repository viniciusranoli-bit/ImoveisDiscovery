import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const searchFiltersSchema = z.object({
  purpose: z.enum(["rent", "sale"]),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().nonnegative().optional(),
  bedroomsMin: z.number().int().nonnegative(),
  parkingMin: z.number().int().nonnegative(),
  propertyTypes: z.array(z.enum(["apartment", "penthouse"])).min(1),
});

export const collectRequestSchema = z.object({
  city: z.literal("Rio de Janeiro"),
  neighborhoods: z.array(z.string()).min(1),
  filters: searchFiltersSchema,
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CollectRequest = z.infer<typeof collectRequestSchema>;
