import { useEffect, useState } from 'react';
import { Shrimp } from './components/Shrimp';
import { Bubble } from './components/Bubble';
import { Settings } from './components/Settings';
import { DailyCardRoute } from './components/DailyCard';

type Route = 'shrimp' | 'bubble' | 'settings' | 'card';

function readRoute(): { route: Route; query: URLSearchParams } {
  const hash = window.location.hash.replace(/^#/, '') || '/shrimp';
  const [path, search = ''] = hash.split('?');
  const query = new URLSearchParams(search);
  if (path.startsWith('/bubble')) return { route: 'bubble', query };
  if (path.startsWith('/settings')) return { route: 'settings', query };
  if (path.startsWith('/card')) return { route: 'card', query };
  return { route: 'shrimp', query };
}

export function App() {
  const [{ route, query }, setRoute] = useState(readRoute);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  if (route === 'bubble') {
    const data = query.get('data');
    let parsed = { message: 'Buddy 在看球～', mood: 'watch' };
    try { if (data) parsed = JSON.parse(data); } catch {}
    return <Bubble message={parsed.message} mood={parsed.mood} />;
  }
  if (route === 'settings') return <Settings />;
  if (route === 'card') return <DailyCardRoute encoded={query.get('data') ?? ''} />;
  return <Shrimp />;
}
