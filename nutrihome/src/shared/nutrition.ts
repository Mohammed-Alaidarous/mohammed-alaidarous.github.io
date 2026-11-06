/**
 * Nutrition maths shared by the server (source of truth when saving) and the web app (live previews).
 * All functions are pure. Values are kept at full precision; round only for display.
 */

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Basis = 'per_100g' | 'per_100ml' | 'per_serving';
export type Unit = 'g' | 'ml' | 'serving';
export type FoodState = 'as_sold' | 'raw' | 'cooked';
export type FoodSource = 'label' | 'manual' | 'usda' | 'open_food_facts';

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Standard physical-activity multipliers applied to BMR. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Approximate energy content of 1 kg of body-weight change (widely used planning estimate). */
export const KCAL_PER_KG_BODYWEIGHT = 7700;

/** Atwater general factors (kcal per gram). */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Conservative floors below which the app warns that a target is very aggressive. */
export const MIN_SAFE_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export interface Nutrients {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
}

export interface ProfileInput {
  sex: Sex;
  birth_date: string; // YYYY-MM-DD
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal_rate_kg_week: number;
  protein_g_per_kg: number;
  fat_pct: number;
  targets_mode: 'auto' | 'manual';
  manual_kcal?: number | null;
  manual_protein_g?: number | null;
  manual_carbs_g?: number | null;
  manual_fat_g?: number | null;
}

export type TargetWarning = 'below_min_kcal' | 'carbs_exhausted' | 'manual_macros_mismatch';

export interface Targets {
  mode: 'auto' | 'manual';
  age: number;
  bmr: number;
  tdee: number;
  goal_delta_kcal: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  warnings: TargetWarning[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateKey(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Whole years between birth date and `on` (both YYYY-MM-DD). */
export function ageOn(birthDate: string, on: string): number {
  if (!isValidDateKey(birthDate) || !isValidDateKey(on)) throw new Error('invalid date');
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** Mifflin–St Jeor resting energy expenditure (kcal/day). */
export function bmrMifflinStJeor(p: { sex: Sex; weight_kg: number; height_cm: number; age: number }): number {
  return 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

export function macroEnergy(protein_g: number, carbs_g: number, fat_g: number): number {
  return protein_g * ATWATER.protein + carbs_g * ATWATER.carbs + fat_g * ATWATER.fat;
}

export function computeTargets(p: ProfileInput, onDate: string): Targets {
  const age = ageOn(p.birth_date, onDate);
  const bmr = bmrMifflinStJeor({ sex: p.sex, weight_kg: p.weight_kg, height_cm: p.height_cm, age });
  const tdee = bmr * ACTIVITY_FACTORS[p.activity_level];
  const goalDelta = (p.goal_rate_kg_week * KCAL_PER_KG_BODYWEIGHT) / 7;
  const warnings: TargetWarning[] = [];

  if (p.targets_mode === 'manual') {
    const kcal = p.manual_kcal ?? 0;
    const pr = p.manual_protein_g ?? 0;
    const c = p.manual_carbs_g ?? 0;
    const f = p.manual_fat_g ?? 0;
    const fromMacros = macroEnergy(pr, c, f);
    if (kcal > 0 && Math.abs(fromMacros - kcal) > Math.max(50, kcal * 0.05)) warnings.push('manual_macros_mismatch');
    if (kcal < MIN_SAFE_KCAL[p.sex]) warnings.push('below_min_kcal');
    return { mode: 'manual', age, bmr, tdee, goal_delta_kcal: kcal - tdee, kcal, protein_g: pr, carbs_g: c, fat_g: f, warnings };
  }

  const kcal = Math.round((tdee + goalDelta) / 10) * 10;
  const protein_g = Math.round(p.protein_g_per_kg * p.weight_kg);
  const fat_g = Math.round((kcal * p.fat_pct) / 100 / ATWATER.fat);
  const remaining = kcal - protein_g * ATWATER.protein - fat_g * ATWATER.fat;
  const carbs_g = Math.max(0, Math.round(remaining / ATWATER.carbs));
  if (remaining <= 0) warnings.push('carbs_exhausted');
  if (kcal < MIN_SAFE_KCAL[p.sex]) warnings.push('below_min_kcal');
  return { mode: 'auto', age, bmr, tdee, goal_delta_kcal: kcal - tdee, kcal, protein_g, carbs_g, fat_g, warnings };
}

// ---------- Food quantities ----------

export interface FoodBasis {
  basis: Basis;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
}

export class QuantityError extends Error {}

/** Units a food can be logged in. Named servings are always allowed for per-100 foods. */
export function allowedUnits(basis: Basis): Unit[] {
  if (basis === 'per_100g') return ['g', 'serving'];
  if (basis === 'per_100ml') return ['ml', 'serving'];
  return ['serving'];
}

/**
 * Multiplier from the food's stated basis to the logged amount.
 * - per_100g + g          → grams / 100
 * - per_100ml + ml        → ml / 100
 * - per_100g/ml + serving → quantity × serving amount (g or ml) / 100
 * - per_serving + serving → quantity
 */
export function basisFactor(basis: Basis, quantity: number, unit: Unit, servingAmount?: number | null): number {
  if (!(Number.isFinite(quantity) && quantity > 0)) throw new QuantityError('quantity must be positive');
  if (!allowedUnits(basis).includes(unit)) throw new QuantityError(`unit ${unit} not allowed for ${basis}`);
  if (basis === 'per_serving') return quantity;
  if (unit === 'serving') {
    if (!(servingAmount && servingAmount > 0)) throw new QuantityError('serving amount required');
    return (quantity * servingAmount) / 100;
  }
  return quantity / 100;
}

export function scaleNutrients(food: FoodBasis, factor: number): Nutrients {
  return {
    kcal: food.kcal * factor,
    protein_g: food.protein_g * factor,
    carbs_g: food.carbs_g * factor,
    fat_g: food.fat_g * factor,
    fiber_g: food.fiber_g == null ? null : food.fiber_g * factor,
  };
}

export function entryNutrients(food: FoodBasis, quantity: number, unit: Unit, servingAmount?: number | null): Nutrients {
  return scaleNutrients(food, basisFactor(food.basis, quantity, unit, servingAmount));
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null };
  for (const n of list) {
    out.kcal += n.kcal;
    out.protein_g += n.protein_g;
    out.carbs_g += n.carbs_g;
    out.fat_g += n.fat_g;
    if (n.fiber_g != null) out.fiber_g = (out.fiber_g ?? 0) + n.fiber_g;
  }
  return out;
}

/**
 * Checks a label's stated energy against Atwater factors. Labels round values and some energy
 * comes from fibre, polyols or alcohol, so this only flags large gaps for the user to re-check.
 */
export function labelEnergyMismatch(food: Omit<FoodBasis, 'basis'>): { expected: number; differs: boolean } {
  const expected = macroEnergy(food.protein_g, food.carbs_g, food.fat_g);
  const gap = Math.abs(expected - food.kcal);
  return { expected, differs: gap > Math.max(20, food.kcal * 0.2) };
}

export function round(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round((x + Number.EPSILON) * f) / f;
}

/**
 * Parses user-typed numbers: Western, Arabic-Indic and Persian digits; '.' or '٫' decimals;
 * thousands separators (',' '٬') only when they form proper groups, e.g. "1,200" → 1200.
 * A lone comma is treated as a decimal separator ("1,5" → 1.5).
 */
export function parseNumber(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim();
  if (!s) return NaN;
  s = s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/\s/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}
