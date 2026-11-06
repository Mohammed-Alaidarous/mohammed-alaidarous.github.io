import { useCallback, useEffect, useState } from 'react';
import type { Me } from '../shared/api-types';
import { api, ApiError, errorMessage } from './api';
import { Icon, ICONS, ToastProvider } from './components/ui';
import { todayKey } from './format';
import { AccountScreen } from './pages/AccountScreen';
import { AuthScreen } from './pages/AuthScreen';
import { FoodsScreen } from './pages/FoodsScreen';
import { ProfileForm } from './pages/ProfileForm';
import { DayNav, TodayScreen } from './pages/TodayScreen';

type Tab = 'today' | 'foods' | 'account';
const TABS: [Tab, string, string][] = [
  ['today', 'اليوم', ICONS.today],
  ['foods', 'الأطعمة', ICONS.foods],
  ['account', 'حسابي', ICONS.user],
];

export function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/auth/me'));
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error && me === undefined) {
    return (
      <main className="wrap auth stack">
        <p className="notice warn">{error}</p>
        <button type="button" className="btn" onClick={refresh}>إعادة المحاولة</button>
      </main>
    );
  }
  if (me === undefined) return <p className="loading">جارِ التحميل…</p>;
  if (me === null) return <AuthScreen onAuthed={setMe} />;
  if (!me.hasProfile) {
    return (
      <>
        <header className="top"><div className="wrap topbar"><h1>أهلاً {me.displayName} — بياناتك</h1></div></header>
        <main className="wrap">
          <p className="hint" style={{ marginBottom: 12 }}>نحسب منها احتياجك اليومي من السعرات والبروتين والكارب والدهون. بياناتك لا يراها أحد غيرك.</p>
          <ProfileForm initial={null} submitLabel="ابدأ" onSaved={() => setMe({ ...me, hasProfile: true })} />
        </main>
      </>
    );
  }
  return <Shell me={me} onLogout={() => setMe(null)} />;
}

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(todayKey());
  const [version, setVersion] = useState(0);

  // Follow the calendar when the app is reopened on a new day.
  useEffect(() => {
    let last = todayKey();
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const t = todayKey();
      if (t !== last) {
        setDate((d) => (d === last ? t : d));
        last = t;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div className="app">
      <header className="top">
        <div className="wrap topbar">
          {tab === 'today' ? <DayNav date={date} setDate={setDate} /> : <h1>{TABS.find((t) => t[0] === tab)![1]}</h1>}
        </div>
      </header>
      <main className="wrap">
        {tab === 'today' ? <TodayScreen key={version} date={date} setDate={setDate} onSetup={() => setTab('account')} /> : null}
        {tab === 'foods' ? <FoodsScreen /> : null}
        {tab === 'account' ? <AccountScreen me={me} onLogout={onLogout} onProfileSaved={() => setVersion((v) => v + 1)} /> : null}
      </main>
      <nav className="tabs" aria-label="الأقسام">
        <div className="tabs-in">
          {TABS.map(([t, label, icon]) => (
            <button
              key={t}
              type="button"
              className="tab"
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => {
                setTab(t);
                window.scrollTo(0, 0);
              }}
            >
              <Icon d={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
