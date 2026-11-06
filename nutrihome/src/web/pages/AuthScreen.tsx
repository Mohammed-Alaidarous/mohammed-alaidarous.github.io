import { useState, type FormEvent } from 'react';
import type { Me } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { Field, Segmented } from '../components/ui';

type Mode = 'login' | 'register';

export function AuthScreen({ onAuthed }: { onAuthed: (me: Me) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [hhMode, setHhMode] = useState<'create' | 'join'>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password.length < 8) {
      setError('كلمة المرور 8 أحرف على الأقل.');
      return;
    }
    setBusy(true);
    try {
      const me =
        mode === 'login'
          ? await api.post<Me>('/auth/login', { email, password })
          : await api.post<Me>('/auth/register', {
              email,
              password,
              displayName,
              household: hhMode === 'create' ? { mode: 'create', name: householdName } : { mode: 'join', inviteCode },
            });
      onAuthed(me);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap auth">
      <div className="brand">
        <img src="/icon.svg" alt="" />
        <h1>NutriHome</h1>
        <p className="muted">سعرات وماكروز البيت — لكل فرد سجله الخاص</p>
      </div>
      <form className="card form" onSubmit={submit} noValidate>
        <Segmented<Mode>
          label="نوع الدخول"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          options={[
            ['login', 'تسجيل الدخول'],
            ['register', 'حساب جديد'],
          ]}
        />
        {mode === 'register' ? (
          <Field label="اسمك">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={60} autoComplete="name" />
          </Field>
        ) : null}
        <Field label="البريد الإلكتروني">
          <input className="input ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" dir="ltr" />
        </Field>
        <Field label="كلمة المرور">
          <input
            className="input ltr"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            dir="ltr"
          />
        </Field>
        {mode === 'register' ? (
          <>
            <Segmented
              label="البيت"
              value={hhMode}
              onChange={setHhMode}
              options={[
                ['create', 'بيت جديد'],
                ['join', 'عندي رمز دعوة'],
              ]}
            />
            {hhMode === 'create' ? (
              <Field label="اسم البيت">
                <input className="input" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} required maxLength={80} placeholder="مثلاً: بيت العيدروس" />
              </Field>
            ) : (
              <Field label="رمز الدعوة (من حساب الفرد الآخر)">
                <input
                  className="input ltr code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  required
                  maxLength={8}
                  autoCapitalize="characters"
                  dir="ltr"
                />
              </Field>
            )}
          </>
        ) : null}
        {error ? <p className="notice warn" role="alert">{error}</p> : null}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? '...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
        </button>
      </form>
    </main>
  );
}
