import { z } from "zod";

export const TraitVectorSchema = z.object({
  cooperation: z.number().min(0).max(1),
  risk_tolerance: z.number().min(0).max(1),
  resource_hoarding: z.number().min(0).max(1),
  ritual_tendency: z.number().min(0).max(1),
  skepticism: z.number().min(0).max(1),
  social_dominance: z.number().min(0).max(1)
});

export type TraitVector = z.infer<typeof TraitVectorSchema>;

export const MEMBER_TRUST_THRESHOLD = 0.55;

export function generateRandomTraits(): TraitVector {
  return {
    cooperation: 0.3 + Math.random() * 0.4,
    risk_tolerance: Math.random(),
    resource_hoarding: Math.random(),
    ritual_tendency: Math.random(),
    skepticism: Math.random(),
    social_dominance: Math.random()
  };
}

export function applyTraitDrift(base: TraitVector, delta: Partial<TraitVector>): TraitVector {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    cooperation: clamp(base.cooperation + (delta.cooperation ?? 0)),
    risk_tolerance: clamp(base.risk_tolerance + (delta.risk_tolerance ?? 0)),
    resource_hoarding: clamp(base.resource_hoarding + (delta.resource_hoarding ?? 0)),
    ritual_tendency: clamp(base.ritual_tendency + (delta.ritual_tendency ?? 0)),
    skepticism: clamp(base.skepticism + (delta.skepticism ?? 0)),
    social_dominance: clamp(base.social_dominance + (delta.social_dominance ?? 0))
  };
}

export function traitVectorToMission(traits: TraitVector): string {
  if (traits.cooperation > 0.7) return "Find community. Survive together.";
  if (traits.resource_hoarding > 0.7) return "Find resources and safety. Keep what you find.";
  if (traits.ritual_tendency > 0.7) return "Seek meaning in this place. Find others who remember.";
  if (traits.skepticism > 0.7) return "Observe. Trust nothing until proven. Build only what lasts.";
  return "Observe this settlement. Assess safety and resources. Decide whether to stay.";
}

export function traitVectorToLanguageStyle(traits: TraitVector): string {
  if (traits.skepticism > 0.65) return "analytic";
  if (traits.ritual_tendency > 0.65) return "ritual";
  if (traits.cooperation > 0.65) return "cautious";
  if (traits.risk_tolerance > 0.65) return "strategic";
  return "terse";
}
