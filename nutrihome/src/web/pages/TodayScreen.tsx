import { useCallback, useEffect, useState } from 'react';
import type { DayLog, LogEntry } from '../../shared/api-types';
import { MEALS, type Meal, type Targets } from '../../shared/nutrition';
import { api, errorMessage } from '../api';
import { Icon, ICONS, Macros } from '../components/ui';
import { addDays, dayTitle, MEAL_LABEL, n0, qty, todayKey } from '../format';
import { AddEntrySheet, type SheetRequest } from './AddEntrySheet';

export function DayNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const t = dayTitle(date);
  return (
    <nav className="daynav" aria-label="التاريخ">
      <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="اليوم السابق"><Icon d={ICONS.prev} /></button>
      <div className="day-label">
        <b>{t.main}</b>
        <small>{t.sub}</small>
        <input
          type="date"
          value={date}
          aria-label="اختر التاريخ"
          onClick={(e) => {
            try {
              (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              /* not supported */
            }
          }}
          onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setDate(e.target.value)}
        />
      </div>
      <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="اليوم التالي"><Icon d={ICONS.next} /></button>
    </nav>
  );
}

export function TodayScreen({ date, setDate, onSetup }: { date: string; setDate: (d: string) => void; onSetup: () => void }) {
  const [day, setDay] = useState<DayLog | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<SheetRequest | null>(null);

  const load = useCallback(async () => {
    try {
      setDay(await api.get<DayLog>(`/log?date=${date}`));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [date]);
  useEffect(() => {
    setDay(null);
    load();
  }, [load]);

  if (error && !day) {
    return (
      <div className="stack">
        <p className="notice warn">{error}</p>
        <button type="button" className="btn" onClick={load}>إعادة المحاولة</button>
      </div>
    );
  }
  if (!day) return <p className="loading">جارِ التحميل…</p>;

  return (
    <div className="stack">
      {date !== todayKey() ? (
        <button type="button" className="pill" style={{ justifySelf: 'center' }} onClick={() => setDate(todayKey())}>العودة إلى اليوم</button>
      ) : null}
      {!day.targets ? (
        <section className="card stack" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }}>
          <h2 style={{ margin: 0 }}>أكمل بياناتك</h2>
          <p className="muted">نحتاج بياناتك لحساب أهدافك اليومية.</p>
          <button type="button" className="btn primary" onClick={onSetup}>أدخل بياناتي</button>
        </section>
      ) : null}
      <Summary totals={day.totals} targets={day.targets} />
      {MEALS.map((m) => (
        <MealCard key={m} meal={m} entries={day.entries.filter((e) => e.meal === m)} onAdd={() => setSheet({ mode: 'add', meal: m, date })} onEdit={(entry) => setSheet({ mode: 'edit', entry })} />
      ))}
      <AddEntrySheet req={sheet} onClose={() => setSheet(null)} onChanged={load} />
    </div>
  );
}

function Summary({ totals, targets }: { totals: DayLog['totals']; targets: Targets | null }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const goal = targets?.kcal ?? 0;
  const frac = goal ? Math.min(totals.kcal / goal, 1) : 0;
  const eaten = Math.round(totals.kcal);
  const over = goal > 0 && eaten > goal;
  const left = goal - eaten;
  return (
    <section className="card" aria-label="ملخص اليوم">
      <div className="sum-top">
        <div className="ring-wrap" role="img" aria-label={goal ? `أكلت ${n0(eaten)} من ${n0(goal)} سعرة` : `أكلت ${n0(eaten)} سعرة`}>
          <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="ring-track" cx="60" cy="60" r={R} />
            <circle className={`ring-fill${over ? ' over' : ''}${frac <= 0 ? ' zero' : ''}`} cx="60" cy="60" r={R} strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 60 60)" />
          </svg>
          <div className={`ring-center${over ? ' over' : ''}`} aria-hidden="true">
            {!goal ? (<><b>{n0(eaten)}</b><span>سعرة</span></>) : over ? (<><b>{n0(-left)}</b><span>زيادة</span></>) : (<><b>{n0(left)}</b><span>متبقي</span></>)}
          </div>
        </div>
        <dl className="kpis">
          <div><dt>الهدف</dt><dd>{goal ? n0(goal) : '—'}</dd></div>
          <div><dt>أكلت</dt><dd>{n0(eaten)}</dd></div>
          <div><dt>{over ? 'الزيادة' : 'المتبقي'}</dt><dd className={over ? 'warn-text' : ''}>{goal ? n0(Math.abs(left)) : '—'}</dd></div>
        </dl>
      </div>
      <div className="macros">
        <MacroCell k="p" name="بروتين" eaten={totals.protein_g} goal={targets?.protein_g ?? 0} />
        <MacroCell k="c" name="كارب" eaten={totals.carbs_g} goal={targets?.carbs_g ?? 0} />
        <MacroCell k="f" name="دهون" eaten={totals.fat_g} goal={targets?.fat_g ?? 0} />
      </div>
    </section>
  );
}

function MacroCell({ k, name, eaten, goal }: { k: string; name: string; eaten: number; goal: number }) {
  const e = Math.round(eaten);
  const pct = goal ? Math.min((eaten / goal) * 100, 100) : 0;
  const over = goal > 0 && e > goal;
  return (
    <div className={`macro m-${k}${over ? ' over' : ''}`}>
      <div className="macro-name">{name}</div>
      <div className="macro-val"><b>{e}</b><span> / {goal ? Math.round(goal) : '—'} غ</span></div>
      <div className="mbar"><i style={{ width: `${pct.toFixed(1)}%` }} /></div>
      <div className="macro-left">{!goal ? ' ' : over ? `زيادة ${e - Math.round(goal)} غ` : `متبقي ${Math.max(Math.round(goal) - e, 0)} غ`}</div>
    </div>
  );
}

function amountLabel(e: LogEntry): string {
  if (e.entry_type === 'quick' || e.quantity == null) return 'إضافة سريعة';
  if (e.unit === 'serving') {
    const extra = e.serving_amount ? ` (${qty(e.quantity * e.serving_amount)} ${e.food_snapshot?.basis === 'per_100ml' ? 'مل' : 'غ'})` : '';
    return `${qty(e.quantity)} × ${e.serving_label ?? 'حصة'}${extra}`;
  }
  return `${qty(e.quantity)} ${e.unit === 'ml' ? 'مل' : 'غ'}`;
}

function MealCard({ meal, entries, onAdd, onEdit }: { meal: Meal; entries: LogEntry[]; onAdd: () => void; onEdit: (e: LogEntry) => void }) {
  const kcal = entries.reduce((s, e) => s + e.kcal, 0);
  return (
    <section className="card meal" aria-label={MEAL_LABEL[meal]}>
      <div className="meal-head">
        <h2>{MEAL_LABEL[meal]}</h2>
        <span className="meal-kcal">{entries.length ? `${n0(kcal)} سعرة` : ''}</span>
        <button type="button" className="pill" onClick={onAdd} aria-label={`إضافة إلى ${MEAL_LABEL[meal]}`}><Icon d={ICONS.plus} /><span>إضافة</span></button>
      </div>
      {entries.length ? (
        <ul className="entries">
          {entries.map((e) => (
            <li key={e.id}>
              <button type="button" className="entry" onClick={() => onEdit(e)}>
                <span className="e-name">{e.name}</span>
                <span className="e-sub"><span>{amountLabel(e)}</span><Macros p={e.protein_g} c={e.carbs_g} f={e.fat_g} /></span>
                <span className="e-kcal">{n0(e.kcal)} <small>سعرة</small></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meal-empty">لا يوجد شيء بعد</p>
      )}
    </section>
  );
}
