import { describe, expect, it } from 'vitest';
import {
  ageOn,
  basisFactor,
  bmrMifflinStJeor,
  computeTargets,
  entryNutrients,
  isValidDateKey,
  labelEnergyMismatch,
  parseNumber,
  QuantityError,
  sumNutrients,
} from '../src/shared/nutrition.js';

describe('dates and age', () => {
  it('validates calendar dates', () => {
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2023-02-29')).toBe(false);
    expect(isValidDateKey('2024-13-01')).toBe(false);
    expect(isValidDateKey('24-01-01')).toBe(false);
  });
  it('counts whole years, birthday inclusive', () => {
    expect(ageOn('1997-03-15', '2026-03-14')).toBe(28);
    expect(ageOn('1997-03-15', '2026-03-15')).toBe(29);
    expect(ageOn('2000-02-29', '2025-02-28')).toBe(24);
  });
});

describe('Mifflin–St Jeor', () => {
  it('matches hand-computed values', () => {
    // 10*85 + 6.25*178 - 5*28 + 5 = 850 + 1112.5 - 140 + 5
    expect(bmrMifflinStJeor({ sex: 'male', weight_kg: 85, height_cm: 178, age: 28 })).toBeCloseTo(1827.5, 6);
    // 10*62 + 6.25*165 - 5*30 - 161 = 620 + 1031.25 - 150 - 161
    expect(bmrMifflinStJeor({ sex: 'female', weight_kg: 62, height_cm: 165, age: 30 })).toBeCloseTo(1340.25, 6);
  });
});

describe('targets', () => {
  const base = {
    sex: 'male', birth_date: '1997-03-15', height_cm: 178, weight_kg: 85, activity_level: 'moderate',
    goal_rate_kg_week: -0.5, protein_g_per_kg: 2, fat_pct: 25, targets_mode: 'auto',
  } as const;

  it('computes auto targets', () => {
    const t = computeTargets(base, '2025-11-06');
    expect(t.age).toBe(28);
    expect(t.tdee).toBeCloseTo(1827.5 * 1.55, 6);
    // 2832.625 - 550 = 2282.625 → nearest 10
    expect(t.kcal).toBe(2280);
    expect(t.protein_g).toBe(170);
    expect(t.fat_g).toBe(63); // 2280 * .25 / 9 = 63.33
    expect(t.carbs_g).toBe(258); // (2280 - 680 - 567) / 4 = 258.25
    expect(t.warnings).toEqual([]);
  });

  it('warns when the target falls below the safe floor', () => {
    const t = computeTargets({ ...base, sex: 'female', weight_kg: 50, height_cm: 155, activity_level: 'sedentary', goal_rate_kg_week: -1 }, '2025-11-06');
    expect(t.kcal).toBeLessThan(1200);
    expect(t.warnings).toContain('below_min_kcal');
  });

  it('warns when protein and fat leave no room for carbs', () => {
    const t = computeTargets({ ...base, protein_g_per_kg: 3, fat_pct: 45, weight_kg: 120, activity_level: 'sedentary', goal_rate_kg_week: -1 }, '2025-11-06');
    expect(t.carbs_g).toBe(0);
    expect(t.warnings).toContain('carbs_exhausted');
  });

  it('uses manual targets as given and flags inconsistent macros', () => {
    const t = computeTargets({ ...base, targets_mode: 'manual', manual_kcal: 2000, manual_protein_g: 150, manual_carbs_g: 200, manual_fat_g: 67 }, '2025-11-06');
    expect([t.kcal, t.protein_g, t.carbs_g, t.fat_g]).toEqual([2000, 150, 200, 67]);
    expect(t.warnings).toEqual([]);
    const bad = computeTargets({ ...base, targets_mode: 'manual', manual_kcal: 2000, manual_protein_g: 50, manual_carbs_g: 50, manual_fat_g: 10 }, '2025-11-06');
    expect(bad.warnings).toContain('manual_macros_mismatch');
  });
});

describe('quantities', () => {
  const per100g = { basis: 'per_100g', kcal: 59, protein_g: 10.3, carbs_g: 3.6, fat_g: 0.4, fiber_g: null } as const;

  it('scales grams', () => {
    const n = entryNutrients(per100g, 170, 'g');
    expect(n.kcal).toBeCloseTo(100.3, 6);
    expect(n.protein_g).toBeCloseTo(17.51, 6);
    expect(n.fiber_g).toBeNull();
  });
  it('scales named servings via their gram amount', () => {
    expect(entryNutrients(per100g, 2, 'serving', 170).kcal).toBeCloseTo(200.6, 6);
  });
  it('scales per-serving foods by count', () => {
    const bar = { basis: 'per_serving', kcal: 210, protein_g: 20, carbs_g: 22, fat_g: 7, fiber_g: 3 } as const;
    expect(entryNutrients(bar, 1.5, 'serving').kcal).toBeCloseTo(315, 6);
    expect(entryNutrients(bar, 1.5, 'serving').fiber_g).toBeCloseTo(4.5, 6);
  });
  it('rejects impossible unit combinations and amounts', () => {
    expect(() => basisFactor('per_100g', 100, 'ml')).toThrow(QuantityError);
    expect(() => basisFactor('per_100ml', 100, 'g')).toThrow(QuantityError);
    expect(() => basisFactor('per_serving', 100, 'g')).toThrow(QuantityError);
    expect(() => basisFactor('per_100g', 1, 'serving')).toThrow(QuantityError);
    expect(() => basisFactor('per_100g', 0, 'g')).toThrow(QuantityError);
    expect(() => basisFactor('per_100g', Number.NaN, 'g')).toThrow(QuantityError);
  });
  it('sums totals, keeping fibre null when unknown', () => {
    const s = sumNutrients([
      { kcal: 100, protein_g: 10, carbs_g: 5, fat_g: 2, fiber_g: null },
      { kcal: 50.5, protein_g: 1, carbs_g: 10, fat_g: 0.5, fiber_g: 2 },
    ]);
    expect(s).toEqual({ kcal: 150.5, protein_g: 11, carbs_g: 15, fat_g: 2.5, fiber_g: 2 });
  });
});

describe('label energy check', () => {
  it('accepts normal label rounding and flags large gaps', () => {
    expect(labelEnergyMismatch({ kcal: 59, protein_g: 10.3, carbs_g: 3.6, fat_g: 0.4, fiber_g: null }).differs).toBe(false);
    expect(labelEnergyMismatch({ kcal: 400, protein_g: 10, carbs_g: 10, fat_g: 1, fiber_g: null }).differs).toBe(true);
  });
});

describe('parseNumber', () => {
  it.each([
    ['150', 150],
    ['١٥٠', 150],
    ['۱۵۰', 150],
    ['2.5', 2.5],
    ['٢٫٥', 2.5],
    ['2,5', 2.5],
    ['1,200', 1200],
    ['١٬٢٠٠', 1200],
    ['12,345.5', 12345.5],
    [' 85 ', 85],
  ])('%s → %d', (input, out) => expect(parseNumber(input)).toBe(out));
  it.each(['', 'abc', '1.2.3', '1,2,3', '--1'])('rejects %s', (input) => expect(parseNumber(input)).toBeNaN());
});
