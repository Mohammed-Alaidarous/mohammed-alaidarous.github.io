import { useState } from 'react';
import type { Food } from '../../shared/api-types';
import { labelEnergyMismatch, parseNumber, type Basis, type FoodState } from '../../shared/nutrition';
import { api, errorMessage, fieldErrors } from '../api';
import { Field, Icon, ICONS, NumberInput, Segmented, useToast } from '../components/ui';
import { n0, STATE_LABEL } from '../format';

const s = (v: number | null | undefined) => (v == null ? '' : String(v));
const opt = (v: string) => (v.trim() === '' ? null : parseNumber(v));

export function FoodForm({ food, initialName = '', onSaved, onDeleted }: {
  food?: Food | null;
  initialName?: string;
  onSaved: (f: Food) => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(food?.name ?? initialName);
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [basis, setBasis] = useState<Basis>(food?.basis ?? 'per_100g');
  const [servingLabel, setServingLabel] = useState(food?.serving_label ?? '');
  const [kcal, setKcal] = useState(s(food?.kcal));
  const [p, setP] = useState(s(food?.protein_g));
  const [c, setC] = useState(s(food?.carbs_g));
  const [f, setF] = useState(s(food?.fat_g));
  const [fiber, setFiber] = useState(s(food?.fiber_g));
  const [sugar, setSugar] = useState(s(food?.sugar_g));
  const [sodium, setSodium] = useState(s(food?.sodium_mg));
  const [state, setState] = useState<FoodState>(food?.food_state ?? 'as_sold');
  const [source, setSource] = useState<'label' | 'manual'>(food?.source === 'manual' ? 'manual' : 'label');
  const [note, setNote] = useState(food?.source_note ?? '');
  const [barcode, setBarcode] = useState(food?.barcode ?? '');
  const [servings, setServings] = useState<{ label: string; amount: string }[]>(
    food?.servings.map((x) => ({ label: x.label, amount: String(x.amount) })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const unit = basis === 'per_100ml' ? 'مل' : 'غ';
  const nums = { kcal: parseNumber(kcal), p: parseNumber(p), c: parseNumber(c), f: parseNumber(f) };
  const complete = [nums.kcal, nums.p, nums.c, nums.f].every((x) => Number.isFinite(x) && x >= 0);
  const mismatch = complete ? labelEnergyMismatch({ kcal: nums.kcal, protein_g: nums.p, carbs_g: nums.c, fat_g: nums.f, fiber_g: null }) : null;

  async function save() {
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = 'اكتب اسم الطعام.';
    for (const [k, v] of [['kcal', nums.kcal], ['protein_g', nums.p], ['carbs_g', nums.c], ['fat_g', nums.f]] as const) {
      if (!(Number.isFinite(v) && v >= 0)) local[k] = 'اكتب الرقم كما في الملصق (0 إذا لا يوجد).';
    }
    if (basis === 'per_serving' && !servingLabel.trim()) local.serving_label = 'اكتب اسم الحصة (مثل: حبة، علبة).';
    const sv = servings.filter((x) => x.label.trim() || x.amount.trim());
    sv.forEach((x, i) => {
      if (!x.label.trim() || !(parseNumber(x.amount) > 0)) local[`servings.${i}`] = 'اكتب الاسم والكمية.';
    });
    setErrors(local);
    if (Object.keys(local).length) return;

    const body = {
      name, brand, basis, serving_label: basis === 'per_serving' ? servingLabel : null,
      kcal: nums.kcal, protein_g: nums.p, carbs_g: nums.c, fat_g: nums.f,
      fiber_g: opt(fiber), sugar_g: opt(sugar), sodium_mg: opt(sodium),
      food_state: state, source, source_note: note, barcode: barcode.trim() || null,
      servings: basis === 'per_serving' ? [] : sv.map((x) => ({ label: x.label, amount: parseNumber(x.amount) })),
    };
    setBusy(true);
    try {
      const saved = food ? await api.put<Food>(`/foods/${food.id}`, body) : await api.post<Food>('/foods', body);
      toast(food ? 'تم تحديث الطعام' : 'تم حفظ الطعام');
      onSaved(saved);
    } catch (e) {
      setErrors(fieldErrors(e));
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!food || !confirm(`حذف «${food.name}» من قائمة الأطعمة؟ السجلات السابقة لن تتغير.`)) return;
    try {
      await api.del(`/foods/${food.id}`);
      toast('تم الحذف');
      onDeleted?.();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <div className="form">
      <p className="notice info">اكتب القيم كما هي في الملصق الغذائي للمنتج. التطبيق لا يقدّر أي قيمة بنفسه.</p>
      <Field label="اسم الطعام" error={errors.name}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="مثلاً: زبادي يوناني" aria-invalid={!!errors.name || undefined} />
      </Field>
      <Field label="العلامة التجارية (اختياري)">
        <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
      </Field>
      <div className="field">
        <span>القيم في الملصق مكتوبة</span>
        <Segmented<Basis> label="أساس القيم" value={basis} onChange={setBasis} options={[['per_100g', 'لكل 100 غ'], ['per_100ml', 'لكل 100 مل'], ['per_serving', 'لكل حصة']]} />
      </div>
      {basis === 'per_serving' ? (
        <Field label="اسم الحصة" error={errors.serving_label}>
          <input className="input" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} maxLength={40} placeholder="حبة، علبة، ظرف" />
        </Field>
      ) : null}
      <div className="grid2">
        <Field label="السعرات (kcal)" error={errors.kcal} className="span-all"><NumberInput value={kcal} onChange={setKcal} invalid={!!errors.kcal} /></Field>
        <Field label="بروتين (غ)" error={errors.protein_g}><NumberInput value={p} onChange={setP} invalid={!!errors.protein_g} /></Field>
        <Field label="كارب (غ)" error={errors.carbs_g}><NumberInput value={c} onChange={setC} invalid={!!errors.carbs_g} /></Field>
        <Field label="دهون (غ)" error={errors.fat_g}><NumberInput value={f} onChange={setF} invalid={!!errors.fat_g} /></Field>
        <Field label="ألياف (غ، اختياري)" error={errors.fiber_g}><NumberInput value={fiber} onChange={setFiber} /></Field>
      </div>
      {mismatch?.differs ? (
        <p className="notice caution">
          السعرات المكتوبة ({n0(nums.kcal)}) بعيدة عن المحسوبة من الماكروز ({n0(mismatch.expected)}). تأكد من الملصق — قد يكون صحيحاً إذا فيه ألياف أو كحوليات سكرية.
        </p>
      ) : null}

      <details className="more" open={!!food && (food.servings.length > 0 || !!food.barcode || food.food_state !== 'as_sold')}>
        <summary>تفاصيل إضافية</summary>
        <div className="form">
          {basis !== 'per_serving' ? (
            <div className="field">
              <span>حصص جاهزة (اختياري) — مثل: بيضة = 50 {unit}</span>
              {servings.map((x, i) => (
                <div key={i} className="grid2" style={{ gridTemplateColumns: '1fr 1fr 44px' }}>
                  <input className="input" value={x.label} placeholder="الاسم" aria-label="اسم الحصة" onChange={(e) => setServings(servings.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  <NumberInput value={x.amount} placeholder={unit} aria-label={`الكمية بال${unit === 'غ' ? 'غرام' : 'مل'}`} invalid={!!errors[`servings.${i}`]} onChange={(v) => setServings(servings.map((y, j) => (j === i ? { ...y, amount: v } : y)))} />
                  <button type="button" className="icon-btn" aria-label="حذف الحصة" onClick={() => setServings(servings.filter((_, j) => j !== i))}><Icon d={ICONS.close} /></button>
                </div>
              ))}
              {servings.length < 10 ? (
                <button type="button" className="btn small" onClick={() => setServings([...servings, { label: '', amount: '' }])}><Icon d={ICONS.plus} /> إضافة حصة</button>
              ) : null}
            </div>
          ) : null}
          <div className="grid2">
            <Field label="سكر (غ)" error={errors.sugar_g}><NumberInput value={sugar} onChange={setSugar} /></Field>
            <Field label="صوديوم (ملغ)"><NumberInput value={sodium} onChange={setSodium} /></Field>
          </div>
          <div className="field">
            <span>حالة الطعام في هذه القيم</span>
            <Segmented<FoodState> label="حالة الطعام" value={state} onChange={setState} options={(['as_sold', 'raw', 'cooked'] as const).map((k) => [k, STATE_LABEL[k]])} />
          </div>
          <div className="field">
            <span>مصدر القيم</span>
            <Segmented label="المصدر" value={source} onChange={setSource} options={[['label', 'الملصق الغذائي'], ['manual', 'مصدر آخر']]} />
          </div>
          <Field label={source === 'manual' ? 'اذكر المصدر' : 'ملاحظة (اختياري)'}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
          <Field label="الباركود (اختياري)">
            <input className="input ltr" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={14} dir="ltr" />
          </Field>
        </div>
      </details>

      <div className="btn-row">
        {food ? <button type="button" className="btn danger" onClick={archive}>حذف</button> : null}
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? '...' : 'حفظ'}</button>
      </div>
    </div>
  );
}
