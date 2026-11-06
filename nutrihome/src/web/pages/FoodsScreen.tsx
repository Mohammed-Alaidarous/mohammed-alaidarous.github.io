import { useCallback, useEffect, useState } from 'react';
import type { Food } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { Icon, ICONS, Sheet } from '../components/ui';
import { FoodList } from './AddEntrySheet';
import { FoodForm } from './FoodForm';

export function FoodsScreen() {
  const [q, setQ] = useState('');
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Food | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setFoods((await api.get<{ foods: Food[] }>(`/foods?q=${encodeURIComponent(q.trim())}`)).foods);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 180 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const close = () => setEditing(null);
  const changed = () => {
    close();
    load();
  };

  return (
    <div className="stack">
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في أطعمة البيت…" aria-label="ابحث في الأطعمة" style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon d={ICONS.plus} /> جديد</button>
      </div>
      <p className="hint">قائمة الأطعمة مشتركة بين أفراد البيت. السجل اليومي لكل فرد خاص به.</p>
      {error ? <p className="notice warn">{error}</p> : null}
      <section className="card">
        {foods === null ? <p className="hint">جارِ التحميل…</p> : null}
        {foods && foods.length === 0 ? (
          <div className="empty">
            <p>{q ? `لا يوجد «${q}».` : 'لا توجد أطعمة بعد. أضف الأطعمة التي تأكلها كثيراً من ملصقها الغذائي.'}</p>
            <button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon d={ICONS.plus} /> إضافة طعام</button>
          </div>
        ) : null}
        {foods && foods.length ? <FoodList foods={foods} onPick={(f) => setEditing(f)} onEdit={(f) => setEditing(f)} /> : null}
      </section>
      <Sheet open={!!editing} title={editing === 'new' ? 'طعام جديد' : 'تعديل طعام'} onClose={close}>
        {editing ? <FoodForm key={editing === 'new' ? 'new' : editing.id} food={editing === 'new' ? null : editing} initialName={q} onSaved={changed} onDeleted={changed} /> : null}
      </Sheet>
    </div>
  );
}
