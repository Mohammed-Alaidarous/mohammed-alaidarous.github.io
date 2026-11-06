import { useMemo, useState } from 'react';
import type { Profile, ProfileResponse } from '../../shared/api-types';
import { computeTargets, parseNumber, type ActivityLevel, type ProfileInput, type Sex, type TargetWarning } from '../../shared/nutrition';
import { api, errorMessage, fieldErrors } from '../api';
import { Field, NumberInput, Segmented, useToast } from '../components/ui';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS, n0, todayKey } from '../format';

const s = (v: number | null | undefined) => (v == null ? '' : String(v));

const WARNING_TEXT: Record<TargetWarning, string> = {
  below_min_kcal: 'السعرات أقل من الحد الأدنى المنصوح به — عجز كبير. فكّر بهدف أبطأ.',
  carbs_exhausted: 'البروتين والدهون أخذوا كل السعرات — خفّف أحدهما.',
  manual_macros_mismatch: 'مجموع سعرات الماكروز لا يطابق السعرات المكتوبة.',
};

export function ProfileForm({ initial, onSaved, submitLabel = 'حفظ' }: { initial: Profile | null; onSaved: (r: ProfileResponse) => void; submitLabel?: string }) {
  const toast = useToast();
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'male');
  const [birth, setBirth] = useState(initial?.birth_date ?? '');
  const [height, setHeight] = useState(s(initial?.height_cm));
  const [weight, setWeight] = useState(s(initial?.weight_kg));
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity_level ?? 'light');
  const [goal, setGoal] = useState<number>(initial?.goal_rate_kg_week ?? 0);
  const [ppk, setPpk] = useState(initial?.protein_g_per_kg ?? 1.8);
  const [fatPct, setFatPct] = useState(initial?.fat_pct ?? 25);
  const [manual, setManual] = useState(initial?.targets_mode === 'manual');
  const [mk, setMk] = useState(s(initial?.manual_kcal));
  const [mp, setMp] = useState(s(initial?.manual_protein_g));
  const [mc, setMc] = useState(s(initial?.manual_carbs_g));
  const [mf, setMf] = useState(s(initial?.manual_fat_g));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const input: ProfileInput = {
    sex,
    birth_date: birth,
    height_cm: parseNumber(height),
    weight_kg: parseNumber(weight),
    activity_level: activity,
    goal_rate_kg_week: goal,
    protein_g_per_kg: ppk,
    fat_pct: fatPct,
    targets_mode: manual ? 'manual' : 'auto',
    manual_kcal: manual ? Math.round(parseNumber(mk)) : null,
    manual_protein_g: manual ? parseNumber(mp) : null,
    manual_carbs_g: manual ? parseNumber(mc) : null,
    manual_fat_g: manual ? parseNumber(mf) : null,
  };

  // Live preview using the same shared function the server uses.
  const preview = useMemo(() => {
    const auto = { ...input, targets_mode: 'auto' as const };
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(birth) && auto.height_cm >= 100 && auto.height_cm <= 250 && auto.weight_kg >= 25 && auto.weight_kg <= 350;
    if (!ok) return null;
    try {
      return computeTargets(auto, todayKey());
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sex, birth, height, weight, activity, goal, ppk, fatPct]);

  function enableManual(on: boolean) {
    setManual(on);
    if (on && !mk && preview) {
      setMk(String(preview.kcal));
      setMp(String(preview.protein_g));
      setMc(String(preview.carbs_g));
      setMf(String(preview.fat_g));
    }
  }

  async function save() {
    setErrors({});
    const local: Record<string, string> = {};
    if (!birth) local.birth_date = 'اختر تاريخ الميلاد.';
    if (!(input.height_cm >= 100 && input.height_cm <= 250)) local.height_cm = 'الطول بين 100 و250 سم.';
    if (!(input.weight_kg >= 25 && input.weight_kg <= 350)) local.weight_kg = 'الوزن بين 25 و350 كجم.';
    if (manual) {
      if (!(input.manual_kcal! >= 800 && input.manual_kcal! <= 6000)) local.manual_kcal = 'بين 800 و6000.';
      for (const [k, v] of [['manual_protein_g', input.manual_protein_g], ['manual_carbs_g', input.manual_carbs_g], ['manual_fat_g', input.manual_fat_g]] as const) {
        if (!(v! >= 0)) local[k] = 'مطلوب.';
      }
    }
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<ProfileResponse>('/profile', input);
      toast('تم حفظ بياناتك');
      onSaved(r);
    } catch (e) {
      setErrors(fieldErrors(e));
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = manual && Number.isFinite(input.manual_kcal) ? null : preview;

  return (
    <div className="stack">
      <section className="card">
        <h2>بياناتي</h2>
        <div className="form">
          <div className="field">
            <span>الجنس</span>
            <Segmented label="الجنس" value={sex} onChange={setSex} options={[['male', 'ذكر'], ['female', 'أنثى']]} />
          </div>
          <Field label="تاريخ الميلاد" error={errors.birth_date}>
            <input className="input" type="date" value={birth} max={todayKey()} onChange={(e) => setBirth(e.target.value)} aria-invalid={!!errors.birth_date || undefined} />
          </Field>
          <div className="grid2">
            <Field label="الطول (سم)" error={errors.height_cm}>
              <NumberInput value={height} onChange={setHeight} invalid={!!errors.height_cm} placeholder="175" />
            </Field>
            <Field label="الوزن (كجم)" error={errors.weight_kg}>
              <NumberInput value={weight} onChange={setWeight} invalid={!!errors.weight_kg} placeholder="80" />
            </Field>
          </div>
          <Field label="مستوى النشاط">
            <select className="input" value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
              {ACTIVITY_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="الهدف">
            <select className="input" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
              {GOAL_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>توزيع الماكروز</h2>
        <div className="form">
          <Field label={<>البروتين: <b className="num">{ppk.toFixed(1)}</b> غ لكل كجم من وزنك</>}>
            <input type="range" min={0.8} max={3} step={0.1} value={ppk} onChange={(e) => setPpk(Number(e.target.value))} />
          </Field>
          <Field label={<>الدهون: <b className="num">{fatPct}%</b> من السعرات</>}>
            <input type="range" min={15} max={45} step={1} value={fatPct} onChange={(e) => setFatPct(Number(e.target.value))} />
          </Field>
          <p className="hint">الكارب يأخذ باقي السعرات.</p>
        </div>
      </section>

      <section className="card" aria-live="polite">
        <h2>احتياجك اليومي</h2>
        {shown ? (
          <>
            <div className="big-kcal"><b>{n0(shown.kcal)}</b>سعرة باليوم</div>
            <div className="res-macros">
              {([['p', 'بروتين', shown.protein_g, 4], ['c', 'كارب', shown.carbs_g, 4], ['f', 'دهون', shown.fat_g, 9]] as const).map(([k, l, v, f]) => (
                <div key={k} className={`m-${k}`}>
                  <span>{l}</span>
                  <b>{v} غ</b>
                  <small>{shown.kcal ? Math.round((v * f * 100) / shown.kcal) : 0}% من السعرات</small>
                </div>
              ))}
            </div>
            <dl className="rows">
              <div><dt>الحرق الأساسي (BMR)</dt><dd>{n0(shown.bmr)}</dd></div>
              <div><dt>الحرق اليومي مع النشاط (TDEE)</dt><dd>{n0(shown.tdee)}</dd></div>
              <div><dt>الفرق عن الحرق اليومي</dt><dd dir="ltr">{shown.goal_delta_kcal > 0 ? '+' : ''}{n0(shown.goal_delta_kcal)}</dd></div>
            </dl>
            {shown.warnings.map((w) => (
              <p key={w} className="notice warn" style={{ marginTop: 10 }}>{WARNING_TEXT[w]}</p>
            ))}
            <p className="hint" style={{ marginTop: 10 }}>
              معادلة Mifflin-St Jeor. تقدير الهدف يفترض أن 1 كجم ≈ 7,700 سعرة. هذه أرقام تقديرية — تابع وزنك أسبوعين وعدّل.
            </p>
          </>
        ) : manual ? (
          <p className="hint">تستخدم أهدافاً يدوية (أدناه).</p>
        ) : (
          <p className="hint">أدخل تاريخ الميلاد والطول والوزن لعرض احتياجك.</p>
        )}
      </section>

      <section className="card">
        <label className="switch">
          <input type="checkbox" checked={manual} onChange={(e) => enableManual(e.target.checked)} /> أحدد أهدافي يدوياً
        </label>
        {manual ? (
          <div className="form" style={{ marginTop: 8 }}>
            <p className="hint">مفيد لو عندك خطة من أخصائي تغذية.</p>
            <div className="grid2">
              <Field label="السعرات" error={errors.manual_kcal} className="span-all"><NumberInput value={mk} onChange={setMk} invalid={!!errors.manual_kcal} /></Field>
              <Field label="بروتين (غ)" error={errors.manual_protein_g}><NumberInput value={mp} onChange={setMp} /></Field>
              <Field label="كارب (غ)" error={errors.manual_carbs_g}><NumberInput value={mc} onChange={setMc} /></Field>
              <Field label="دهون (غ)" error={errors.manual_fat_g}><NumberInput value={mf} onChange={setMf} /></Field>
            </div>
            {(() => {
              const t = computeTargets({ ...input, birth_date: birth || '2000-01-01', height_cm: input.height_cm || 170, weight_kg: input.weight_kg || 70 }, todayKey());
              return t.warnings.includes('manual_macros_mismatch') ? <p className="notice caution">{WARNING_TEXT.manual_macros_mismatch}</p> : null;
            })()}
          </div>
        ) : null}
      </section>

      <button type="button" className="btn primary block" onClick={save} disabled={busy}>{busy ? '...' : submitLabel}</button>
    </div>
  );
}
