import { z } from 'zod';
import { ageOn, isValidDateKey } from '../shared/nutrition.js';

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const dateKey = z.string().refine(isValidDateKey, 'invalid_date');
const finite = z.number().finite();
const nonNeg = (max: number) => finite.min(0).max(max);

// ---------- Auth ----------
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(8).max(200),
  displayName: trimmed(1, 60),
  household: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('create'), name: trimmed(1, 80) }),
    z.object({
      mode: z.literal('join'),
      inviteCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z2-9]{8}$/),
    }),
  ]),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});

// ---------- Profile ----------
export const profileSchema = z
  .object({
    sex: z.enum(['male', 'female']),
    birth_date: dateKey,
    height_cm: finite.min(100).max(250),
    weight_kg: finite.min(25).max(350),
    activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
    goal_rate_kg_week: finite.min(-1).max(1),
    protein_g_per_kg: finite.min(0.8).max(3),
    fat_pct: z.number().int().min(15).max(45),
    targets_mode: z.enum(['auto', 'manual']),
    manual_kcal: z.number().int().min(800).max(6000).nullish(),
    manual_protein_g: nonNeg(600).nullish(),
    manual_carbs_g: nonNeg(1000).nullish(),
    manual_fat_g: nonNeg(400).nullish(),
  })
  .superRefine((p, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    if (isValidDateKey(p.birth_date)) {
      const age = ageOn(p.birth_date, today);
      if (age < 13 || age > 100) ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'age_out_of_range' });
    }
    if (p.targets_mode === 'manual') {
      for (const k of ['manual_kcal', 'manual_protein_g', 'manual_carbs_g', 'manual_fat_g'] as const) {
        if (p[k] == null) ctx.addIssue({ code: 'custom', path: [k], message: 'required_for_manual' });
      }
    }
  });

// ---------- Foods ----------
export const foodSchema = z
  .object({
    name: trimmed(1, 120),
    brand: optionalText(80),
    basis: z.enum(['per_100g', 'per_100ml', 'per_serving']),
    serving_label: optionalText(40),
    kcal: nonNeg(5000),
    protein_g: nonNeg(1000),
    carbs_g: nonNeg(1000),
    fat_g: nonNeg(1000),
    fiber_g: nonNeg(1000).nullish().transform((v) => v ?? null),
    sugar_g: nonNeg(1000).nullish().transform((v) => v ?? null),
    sodium_mg: nonNeg(100000).nullish().transform((v) => v ?? null),
    food_state: z.enum(['as_sold', 'raw', 'cooked']).default('as_sold'),
    source: z.enum(['label', 'manual']),
    source_note: optionalText(300),
    barcode: z
      .string()
      .trim()
      .regex(/^[0-9]{6,14}$/)
      .nullish()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
    servings: z
      .array(z.object({ label: trimmed(1, 40), amount: finite.gt(0).max(5000) }))
      .max(10)
      .default([]),
  })
  .superRefine((f, ctx) => {
    if (f.basis === 'per_serving') {
      if (!f.serving_label) ctx.addIssue({ code: 'custom', path: ['serving_label'], message: 'required_for_per_serving' });
      if (f.servings.length) ctx.addIssue({ code: 'custom', path: ['servings'], message: 'not_allowed_for_per_serving' });
    } else {
      if (f.kcal > 900) ctx.addIssue({ code: 'custom', path: ['kcal'], message: 'exceeds_per_100_maximum' });
      if (f.protein_g + f.carbs_g + f.fat_g > 100.5) {
        ctx.addIssue({ code: 'custom', path: ['protein_g'], message: 'macros_exceed_100g' });
      }
    }
    if (f.basis !== 'per_serving' && f.fiber_g != null && f.fiber_g > 100) {
      ctx.addIssue({ code: 'custom', path: ['fiber_g'], message: 'exceeds_per_100_maximum' });
    }
    if (f.sugar_g != null && f.sugar_g > f.carbs_g + 0.5) {
      ctx.addIssue({ code: 'custom', path: ['sugar_g'], message: 'sugar_exceeds_carbs' });
    }
  });

// ---------- Food log ----------
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

const foodEntry = z.object({
  type: z.literal('food'),
  date: dateKey,
  meal,
  food_id: z.uuid(),
  quantity: finite.gt(0).max(100000),
  unit: z.enum(['g', 'ml', 'serving']),
  serving_id: z.uuid().nullish(),
});

const quickEntry = z.object({
  type: z.literal('quick'),
  date: dateKey,
  meal,
  name: optionalText(120),
  kcal: finite.gt(0).max(10000),
  protein_g: nonNeg(1000),
  carbs_g: nonNeg(2000),
  fat_g: nonNeg(1000),
});

export const logCreateSchema = z.discriminatedUnion('type', [foodEntry, quickEntry]);

export const logUpdateSchema = z.object({
  meal: meal.optional(),
  // food entries
  quantity: finite.gt(0).max(100000).optional(),
  unit: z.enum(['g', 'ml', 'serving']).optional(),
  serving_id: z.uuid().nullish(),
  // quick entries
  name: optionalText(120).optional(),
  kcal: nonNeg(10000).optional(),
  protein_g: nonNeg(1000).optional(),
  carbs_g: nonNeg(2000).optional(),
  fat_g: nonNeg(1000).optional(),
});

export const uuidParam = z.uuid();
