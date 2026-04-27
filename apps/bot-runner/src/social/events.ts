import { z } from "zod";
import type { EventLogger } from "../log.js";

const ActorSchema = z.object({
  username: z.string().min(1),
  agent: z.string().min(1),
  role: z.string().min(1),
  style: z.string().min(1)
});

const InventoryEntrySchema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive()
});

const PositionSchema = z.object({
  x: z.number().finite().nullable(),
  y: z.number().finite().nullable(),
  z: z.number().finite().nullable()
});

export const SocialGreetingEventSchema = ActorSchema.extend({
  message: z.string().trim().min(1).max(160)
});

export const HelpRequestedEventSchema = ActorSchema.extend({
  nearbyPlayers: z.array(z.string().min(1)).max(20),
  message: z.string().trim().min(1).max(160)
});

export const GratitudeExpressedEventSchema = ActorSchema.extend({
  target: z.string().min(1),
  message: z.string().trim().min(1).max(160)
});

export const ShelterProposedEventSchema = ActorSchema.extend({
  anchor: z.enum(["spawn", "base"]),
  message: z.string().trim().min(1).max(160)
});

export const SocialStatusReportEventSchema = ActorSchema.extend({
  health: z.number().finite(),
  food: z.number().finite(),
  position: PositionSchema,
  inventory: z.array(InventoryEntrySchema).max(36),
  message: z.string().trim().min(1).max(220)
});

export const TrustDeltaAppliedEventSchema = ActorSchema.extend({
  target: z.string().min(1),
  delta: z.number().finite(),
  reason: z.enum(["gratitude_expressed", "heard_shelter_proposal"]),
  trustBefore: z.number().min(0).max(1),
  trustAfter: z.number().min(0).max(1)
});

export const SocialEventSchemas = {
  social_greeting: SocialGreetingEventSchema,
  help_requested: HelpRequestedEventSchema,
  gratitude_expressed: GratitudeExpressedEventSchema,
  shelter_proposed: ShelterProposedEventSchema,
  social_status_report: SocialStatusReportEventSchema,
  trust_delta_applied: TrustDeltaAppliedEventSchema
} as const;

export type SocialEventType = keyof typeof SocialEventSchemas;

type SocialEventPayloadMap = {
  social_greeting: z.infer<typeof SocialGreetingEventSchema>;
  help_requested: z.infer<typeof HelpRequestedEventSchema>;
  gratitude_expressed: z.infer<typeof GratitudeExpressedEventSchema>;
  shelter_proposed: z.infer<typeof ShelterProposedEventSchema>;
  social_status_report: z.infer<typeof SocialStatusReportEventSchema>;
  trust_delta_applied: z.infer<typeof TrustDeltaAppliedEventSchema>;
};

export function validateSocialEvent<T extends SocialEventType>(
  type: T,
  payload: SocialEventPayloadMap[T]
): SocialEventPayloadMap[T] {
  return SocialEventSchemas[type].parse(payload as unknown) as SocialEventPayloadMap[T];
}

export function logSocialEvent<T extends SocialEventType>(
  eventLogger: EventLogger,
  type: T,
  payload: SocialEventPayloadMap[T]
): void {
  eventLogger.logEvent(type, validateSocialEvent(type, payload));
}
