import type { ActivityLevel, Basis, FoodSource, FoodState, Meal } from '../shared/nutrition';

export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'الفطور', lunch: 'الغداء', dinner: 'العشاء', snack: 'سناك' };

export const ACTIVITY_OPTIONS: [ActivityLevel, string][] = [
  ['sedentary', 'قليل الحركة — عمل مكتبي بدون تمارين'],
  ['light', 'نشاط خفيف — تمرين 1–3 أيام بالأسبوع'],
  ['moderate', 'نشاط متوسط — تمرين 3–5 أيام بالأسبوع'],
  ['active', 'نشاط عالٍ — تمرين 6–7 أيام بالأسبوع'],
  ['very_active', 'نشاط عالٍ جداً — تمرين مكثف أو عمل بدني'],
];

export const GOAL_OPTIONS: [number, string][] = [
  [-0.75, 'خسارة 0.75 كجم بالأسبوع'],
  [-0.5, 'خسارة 0.5 كجم بالأسبوع'],
  [-0.25, 'خسارة 0.25 كجم بالأسبوع'],
  [0, 'المحافظة على الوزن'],
  [0.25, 'زيادة 0.25 كجم بالأسبوع'],
  [0.5, 'زيادة 0.5 كجم بالأسبوع'],
];

export const BASIS_LABEL: Record<Basis, string> = { per_100g: 'لكل 100 غ', per_100ml: 'لكل 100 مل', per_serving: 'لكل حصة' };
export const STATE_LABEL: Record<FoodState, string> = { as_sold: 'كما يُباع', raw: 'نيء', cooked: 'مطبوخ' };
export const SOURCE_LABEL: Record<FoodSource, string> = {
  label: 'من الملصق الغذائي',
  manual: 'إدخال يدوي',
  usda: 'USDA',
  open_food_facts: 'Open Food Facts',
};

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
/** Whole numbers with grouping, e.g. 2,280. */
export const n0 = (x: number) => nf0.format(Math.round(x) === 0 ? 0 : x);
/** Grams: one decimal under 10 g, whole numbers above. */
export const grams = (x: number) => (x > 0 && x < 10 ? nf1.format(x) : n0(x));
export const qty = (x: number) => String(Math.round(x * 100) / 100);

// Dates — the diary uses the device's local calendar day.
const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (k: string) => {
  const [y, m, d] = k.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
export const todayKey = () => keyOf(new Date());
export const addDays = (k: string, n: number) => {
  const d = dateOf(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const LOCALE = 'ar-u-ca-gregory-nu-latn';
const fmtLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDM = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });
export function dayTitle(k: string): { main: string; sub: string } {
  const t = todayKey();
  const rel = k === t ? 'اليوم' : k === addDays(t, -1) ? 'أمس' : k === addDays(t, 1) ? 'غداً' : null;
  const d = dateOf(k);
  return rel ? { main: rel, sub: fmtLong.format(d) } : { main: fmtWeekday.format(d), sub: fmtDM.format(d) };
}
