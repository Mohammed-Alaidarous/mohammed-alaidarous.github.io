import { useEffect, useState } from 'react';
import type { Household, Me, ProfileResponse } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { useToast } from '../components/ui';
import { ProfileForm } from './ProfileForm';

export function AccountScreen({ me, onLogout, onProfileSaved }: { me: Me; onLogout: () => void; onProfileSaved: () => void }) {
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get<ProfileResponse>('/profile'), api.get<Household>('/household')])
      .then(([p, h]) => {
        setProfile(p);
        setHousehold(h);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      onLogout();
    }
  }

  if (error) return <p className="notice warn">{error}</p>;
  if (!profile || !household) return <p className="loading">جارِ التحميل…</p>;

  return (
    <div className="stack">
      <ProfileForm initial={profile.profile} onSaved={(r) => { setProfile(r); onProfileSaved(); }} />
      <section className="card">
        <h2>{household.name}</h2>
        <dl className="rows">
          {household.members.map((m, i) => (
            <div key={i}><dt>{m.isMe ? 'أنت' : 'فرد'}</dt><dd>{m.displayName}</dd></div>
          ))}
        </dl>
        {household.members.length < household.maxMembers ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="hint">لإضافة الفرد الثاني: ينشئ حساباً جديداً ويختار «عندي رمز دعوة» ويكتب هذا الرمز.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <span className="code">{household.inviteCode}</span>
              <button
                type="button"
                className="btn small"
                onClick={() => navigator.clipboard?.writeText(household.inviteCode).then(() => toast('تم نسخ الرمز'), () => toast('انسخ الرمز يدوياً'))}
              >
                نسخ الرمز
              </button>
            </div>
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 12 }}>كل فرد يرى أسماء الأطعمة المشتركة فقط. بياناتك الشخصية وسجلك اليومي لا يراها غيرك.</p>
      </section>
      <section className="card stack">
        <p className="muted">مسجل الدخول باسم <b>{me.displayName}</b> <span dir="ltr">({me.email})</span></p>
        <button type="button" className="btn danger block" onClick={logout}>تسجيل الخروج</button>
      </section>
    </div>
  );
}
