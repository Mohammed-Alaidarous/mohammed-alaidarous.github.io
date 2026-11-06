import { useEffect, useMemo, useState } from 'react';
import type { Food, FoodSnapshot, LogEntry } from '../../shared/api-types';
import { allowedUnits, entryNutrients, macroEnergy, parseNumber, type Meal, type Unit } from '../../shared/nutrition';
import { api, errorMessage } from '../api';
import { Field, Icon, ICONS, Macros, NumberInput, Segmented, Sheet, useToast } from '../components/ui';
import { BASIS_LABEL, grams, MEAL_LABEL, n0, qty } from '../format';
import { FoodForm } from './FoodForm';

/** What the amount step works with: a live food or the snapshot stored on an entry. */
interface Target {
  name: string;
  foodId: string | null;
  snap: FoodSnapshot;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'amount'; target: Target }
  | { kind: 'quick' }
  | { kind: 'newFood'; name: string };

export type SheetRequest =
  | { mode: 'add'; meal: Meal; date: string }
  | { mode: 'edit'; entry: LogEntry };

const snapOf = (f: Food): FoodSnapshot => ({
  basis: f.basis, kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fiber_g: f.fiber_g,
  serving_label: f.serving_label, servings: f.servings, food_state: f.food_state, source: f.source,
});

const MEAL_OPTIONS = (Object.keys(MEAL_LABEL) as Meal[]).map((m) => [m, MEAL_LABEL[m]] as [Meal, string]);

export function AddEntrySheet({ req, onClose, onChanged }: { req: SheetRequest | null; onClose: () => void; onChanged: () => void }) {
  const [stack, setStack] = useState<Step[]>([]);
  const [meal, setMeal] = useState<Meal>('breakfast');

  useEffect(() => {
    if (!req) return;
    if (req.mode === 'add') {
      setMeal(req.meal);
      setStack([{ kind: 'pick' }]);
    } else {
      setMeal(req.entry.meal);
      const e = req.entry;
      setStack([e.entry_type === 'quick' || !e.food_snapshot ? { kind: 'quick' } : { kind: 'amount', target: { name: e.name, foodId: e.food_id, snap: e.food_snapshot } }]);
    }
  }, [req]);

  const step = stack[stack.length - 1];
  const push = (s: Step) => setStack([...stack, s]);
  const back = stack.length > 1 ? () => setStack(stack.slice(0, -1)) : undefined;
  const editing = req?.mode === 'edit' ? req.entry : null;
  const date = req?.mode === 'add' ? req.date : editing?.log_date ?? '';

  const title = !step ? '' : step.kind === 'pick' ? `إضافة إلى ${MEAL_LABEL[meal]}` : step.kind === 'quick' ? (editing ? 'تعديل' : 'إضافة سريعة') : step.kind === 'newFood' ? 'طعام جديد' : editing ? 'تعديل الكمية' : 'الكمية';

  const done = () => {
    onChanged();
    onClose();
  };

  return (
    <Sheet open={!!req && !!step} title={title} onClose={onClose} onBack={back} tall={step?.kind === 'pick'} split={step?.kind === 'pick'}>
      {step?.kind === 'pick' ? (
        <PickStep
          onPick={(f) => push({ kind: 'amount', target: { name: f.brand ? `${f.name} — ${f.brand}` : f.name, foodId: f.id, snap: snapOf(f) } })}
          onQuick={() => push({ kind: 'quick' })}
          onNew={(name) => push({ kind: 'newFood', name })}
        />
      ) : null}
      {step?.kind === 'newFood' ? (
        <FoodForm
          initialName={step.name}
          onSaved={(f) => setStack([...stack.slice(0, -1), { kind: 'amount', target: { name: f.brand ? `${f.name} — ${f.brand}` : f.name, foodId: f.id, snap: snapOf(f) } }])}
        />
      ) : null}
      {step?.kind === 'amount' ? <AmountStep key={step.target.foodId ?? 'snap'} target={step.target} meal={meal} setMeal={setMeal} date={date} entry={editing} onDone={done} /> : null}
      {step?.kind === 'quick' ? <QuickStep meal={meal} setMeal={setMeal} date={date} entry={editing} onDone={done} /> : null}
    </Sheet>
  );
}

function PickStep({ onPick, onQuick, onNew }: { onPick: (f: Food) => void; onQuick: () => void; onNew: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ foods: Food[] }>(`/foods?q=${encodeURIComponent(q.trim())}`);
        if (live) {
          setFoods(r.foods);
          setError('');
        }
      } catch (e) {
        if (live) setError(errorMessage(e));
      }
    }, q ? 180 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في أطعمة البيت…" aria-label="ابحث عن طعام" enterKeyHint="search" />
      <div className="grid2">
        <button type="button" className="btn small" onClick={onQuick}><Icon d={ICONS.bolt} /> إضافة سريعة</button>
        <button type="button" className="btn small" onClick={() => onNew(q.trim())}><Icon d={ICONS.plus} /> طعام جديد</button>
      </div>
      <div className="scroll">
        {error ? <p className="notice warn">{error}</p> : null}
        {foods === null ? <p className="hint">جارِ التحميل…</p> : null}
        {foods && foods.length === 0 ? (
          <div className="empty">
            <p>{q ? `لا يوجد «${q}» في أطعمة البيت.` : 'لا توجد أطعمة بعد. أضف أول طعام من ملصقه الغذائي.'}</p>
            <button type="button" className="btn primary" onClick={() => onNew(q.trim())}><Icon d={ICONS.plus} /> إضافة طعام</button>
          </div>
        ) : null}
        {foods && foods.length ? <FoodList foods={foods} onPick={onPick} /> : null}
      </div>
    </>
  );
}

export function FoodList({ foods, onPick, onEdit }: { foods: Food[]; onPick: (f: Food) => void; onEdit?: (f: Food) => void }) {
  return (
    <ul className="flist">
      {foods.map((f) => (
        <li key={f.id}>
          <button type="button" className="fitem" onClick={() => onPick(f)}>
            <span className="fi-main">
              <span className="fi-name">
                {f.name}
                {f.brand ? <span className="muted"> — {f.brand}</span> : null}
                {f.food_state !== 'as_sold' ? <span className="badge">{f.food_state === 'raw' ? 'نيء' : 'مطبوخ'}</span> : null}
              </span>
              <span className="fi-sub">
                <span>{f.basis === 'per_serving' ? `لكل ${f.serving_label}` : BASIS_LABEL[f.basis]}</span>
                <Macros p={f.protein_g} c={f.carbs_g} f={f.fat_g} />
              </span>
            </span>
            <span className="fi-kcal">{n0(f.kcal)} <small>سعرة</small></span>
          </button>
          {onEdit ? (
            <button type="button" className="icon-btn" aria-label={`تعديل ${f.name}`} onClick={() => onEdit(f)}>
              <Icon d={ICONS.edit} />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AmountStep({ target, meal, setMeal, date, entry, onDone }: {
  target: Target;
  meal: Meal;
  setMeal: (m: Meal) => void;
  date: string;
  entry: LogEntry | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const { snap } = target;
  const units = allowedUnits(snap.basis).filter((u) => u !== 'serving' || snap.basis === 'per_serving' || snap.servings.length > 0);
  const initialServing = entry?.unit === 'serving' ? snap.servings.find((s) => s.label === entry.serving_label && s.amount === entry.serving_amount) : snap.servings[0];
  const [unit, setUnit] = useState<Unit>(entry?.unit ?? (snap.basis === 'per_serving' ? 'serving' : snap.servings.length ? 'serving' : units[0]!));
  const [servingId, setServingId] = useState<string | undefined>(initialServing?.id);
  const [amount, setAmount] = useState(entry?.quantity != null ? qty(entry.quantity) : unit === 'serving' ? '1' : '100');
  const [busy, setBusy] = useState(false);

  const q = parseNumber(amount);
  const serving = snap.servings.find((s) => s.id === servingId);
  const n = useMemo(() => {
    try {
      return entryNutrients(snap, q, unit, serving?.amount);
    } catch {
      return null;
    }
  }, [snap, q, unit, serving]);

  // Options: grams/ml plus each named serving (per-100 foods), or the single serving (per-serving foods).
  const baseUnit = snap.basis === 'per_100ml' ? 'ml' : 'g';
  const unitOptions: [string, string][] =
    snap.basis === 'per_serving'
      ? [['serving', snap.serving_label ?? 'حصة']]
      : [[baseUnit, baseUnit === 'ml' ? 'مل' : 'غ'], ...snap.servings.map((s) => [`s:${s.id}`, s.label] as [string, string])];
  const unitValue = unit === 'serving' && snap.basis !== 'per_serving' ? `s:${servingId}` : unit;
  const chips = unit === 'serving' ? [0.5, 1, 1.5, 2, 3] : baseUnit === 'ml' ? [100, 200, 250, 330, 500] : [25, 50, 100, 150, 200, 250];

  function chooseUnit(v: string) {
    const prevGrams = unit === 'serving' ? (serving ? q * serving.amount : NaN) : q;
    if (v.startsWith('s:')) {
      const s = snap.servings.find((x) => x.id === v.slice(2))!;
      setUnit('serving');
      setServingId(s.id);
      if (Number.isFinite(prevGrams) && unit !== 'serving') setAmount(qty(Math.max(0.25, Math.round((prevGrams / s.amount) * 4) / 4)));
    } else {
      setUnit(v as Unit);
      if (Number.isFinite(prevGrams) && unit === 'serving') setAmount(qty(Math.round(prevGrams)));
    }
  }

  async function save() {
    if (!n) return;
    setBusy(true);
    try {
      const sid = unit === 'serving' && snap.basis !== 'per_serving' ? servingId : null;
      if (entry) await api.put<LogEntry>(`/log/${entry.id}`, { meal, quantity: q, unit, serving_id: sid });
      else await api.post<LogEntry>('/log', { type: 'food', date, meal, food_id: target.foodId, quantity: q, unit, serving_id: sid });
      toast(entry ? 'تم الحفظ' : `أُضيف إلى ${MEAL_LABEL[meal]}`);
      onDone();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !confirm(`حذف «${entry.name}» من ${MEAL_LABEL[entry.meal]}؟`)) return;
    try {
      await api.del(`/log/${entry.id}`);
      toast('تم الحذف');
      onDone();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <>
      <div className="food-head">
        <h3>{target.name}</h3>
        <p>
          <span>{snap.basis === 'per_serving' ? `لكل ${snap.serving_label}` : BASIS_LABEL[snap.basis]}: {n0(snap.kcal)} سعرة</span>
          <Macros p={snap.protein_g} c={snap.carbs_g} f={snap.fat_g} />
        </p>
      </div>
      <div className="amount-row">
        <Field label="الكمية">
          <NumberInput value={amount} onChange={setAmount} big invalid={!n} onEnter={save} aria-label="الكمية" />
        </Field>
        {unitOptions.length > 1 ? (
          <Segmented label="الوحدة" value={unitValue} onChange={chooseUnit} options={unitOptions} />
        ) : (
          <span className="unit-tag">{unitOptions[0]![1]}</span>
        )}
      </div>
      {unit === 'serving' && serving ? <p className="hint">{serving.label} = {qty(serving.amount)} {baseUnit === 'ml' ? 'مل' : 'غ'}</p> : null}
      <div className="chips">
        {chips.map((v) => (
          <button key={v} type="button" className="chip" onClick={() => setAmount(String(v))}>{v}</button>
        ))}
      </div>
      <div className="field">
        <span>الوجبة</span>
        <Segmented label="الوجبة" value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
      </div>
      <div className="preview" aria-live="polite">
        <div><b>{n ? n0(n.kcal) : '—'}</b><span>سعرة</span></div>
        <div className="m-p"><b>{n ? grams(n.protein_g) : '—'}</b><span className="dot">بروتين</span></div>
        <div className="m-c"><b>{n ? grams(n.carbs_g) : '—'}</b><span className="dot">كارب</span></div>
        <div className="m-f"><b>{n ? grams(n.fat_g) : '—'}</b><span className="dot">دهون</span></div>
      </div>
      <div className="btn-row">
        {entry ? <button type="button" className="btn danger" onClick={remove}>حذف</button> : null}
        <button type="button" className="btn primary" onClick={save} disabled={!n || busy}>{busy ? '...' : entry ? 'حفظ' : 'إضافة'}</button>
      </div>
    </>
  );
}

function QuickStep({ meal, setMeal, date, entry, onDone }: { meal: Meal; setMeal: (m: Meal) => void; date: string; entry: LogEntry | null; onDone: () => void }) {
  const toast = useToast();
  const s = (v: number | undefined) => (v == null ? '' : String(v));
  const [name, setName] = useState(entry?.name ?? '');
  const [kcal, setKcal] = useState(s(entry?.kcal));
  const [p, setP] = useState(s(entry?.protein_g));
  const [c, setC] = useState(s(entry?.carbs_g));
  const [f, setF] = useState(s(entry?.fat_g));
  const [busy, setBusy] = useState(false);

  const v = (x: string) => (x.trim() === '' ? 0 : parseNumber(x));
  const macros = { p: v(p), c: v(c), f: v(f) };
  const fromMacros = macroEnergy(macros.p, macros.c, macros.f);
  const typed = kcal.trim() === '' ? NaN : parseNumber(kcal);
  const finalKcal = Number.isFinite(typed) ? typed : fromMacros;
  const valid = [macros.p, macros.c, macros.f].every((x) => Number.isFinite(x) && x >= 0) && finalKcal > 0;

  async function save() {
    if (!valid) {
      toast('اكتب السعرات أو الماكروز');
      return;
    }
    setBusy(true);
    try {
      const body = { meal, name: name.trim() || null, kcal: finalKcal, protein_g: macros.p, carbs_g: macros.c, fat_g: macros.f };
      if (entry) await api.put(`/log/${entry.id}`, body);
      else await api.post('/log', { type: 'quick', date, ...body });
      toast(entry ? 'تم الحفظ' : `أُضيف إلى ${MEAL_LABEL[meal]}`);
      onDone();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !confirm(`حذف «${entry.name}»؟`)) return;
    try {
      await api.del(`/log/${entry.id}`);
      toast('تم الحذف');
      onDone();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <>
      <p className="hint">للوجبات اللي تعرف سعراتها من مصدر موثوق (مثل قائمة مطعم) بدون تفاصيل المكونات.</p>
      <Field label="الاسم (اختياري)">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="مثلاً: غداء مطعم" />
      </Field>
      <div className="grid2">
        <Field label="السعرات" className="span-all"><NumberInput value={kcal} onChange={setKcal} placeholder={fromMacros > 0 ? n0(fromMacros) : ''} /></Field>
        <Field label="بروتين (غ)"><NumberInput value={p} onChange={setP} placeholder="0" /></Field>
        <Field label="كارب (غ)"><NumberInput value={c} onChange={setC} placeholder="0" /></Field>
        <Field label="دهون (غ)"><NumberInput value={f} onChange={setF} placeholder="0" /></Field>
      </div>
      {Number.isFinite(typed) && fromMacros > 0 && Math.abs(fromMacros - typed) > Math.max(30, typed * 0.15) ? (
        <p className="notice caution">السعرات من الماكروز {n0(fromMacros)} — تختلف عن المكتوبة.</p>
      ) : !Number.isFinite(typed) && fromMacros > 0 ? (
        <p className="hint">ستُحسب السعرات من الماكروز: {n0(fromMacros)}</p>
      ) : null}
      <div className="field">
        <span>الوجبة</span>
        <Segmented label="الوجبة" value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
      </div>
      <div className="btn-row">
        {entry ? <button type="button" className="btn danger" onClick={remove}>حذف</button> : null}
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? '...' : entry ? 'حفظ' : 'إضافة'}</button>
      </div>
    </>
  );
}
