import { useEffect, useState } from 'react';

type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';
type Pack = { id: string; name: string; author?: string; builtin?: boolean; frames: Partial<Record<Mood, string>> };

export function Settings() {
  const [teams, setTeams] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [mode, setMode] = useState<'live' | 'replay'>('replay');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [characterPack, setCharacterPack] = useState<string>('default-shrimp');
  const [quietMode, setQuietMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showWinProb, setShowWinProb] = useState(true);

  useEffect(() => {
    const api = (window as any).shrimpAPI;
    (async () => {
      const [cfg, ts, ps] = await Promise.all([
        api.getConfig(),
        api.listTeams(),
        api.listCharacters(),
      ]);
      setFavorites(cfg.favoriteTeams ?? []);
      setMode(cfg.mode ?? 'replay');
      setCharacterPack(cfg.characterPack ?? 'default-shrimp');
      setQuietMode(!!cfg.quietMode);
      setSoundEnabled(!!cfg.soundEnabled);
      setShowWinProb(cfg.showWinProb !== false);
      setTeams(ts);
      setPacks(ps);
    })();
  }, []);

  const refreshPacks = async () => {
    const ps = await (window as any).shrimpAPI.listCharacters();
    setPacks(ps);
  };

  const toggle = (t: string) => {
    setFavorites(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].slice(0, 3)
    );
  };

  const save = async () => {
    const api = (window as any).shrimpAPI;
    await api.setConfig({ favoriteTeams: favorites, mode, characterPack, quietMode, soundEnabled, showWinProb });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const filtered = teams.filter(t =>
    t.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="settings-stage">
      <h1>⚽ 世界杯 Buddy · 设置</h1>

      <section className="section">
        <h2>角色形象</h2>
        <div className="pack-row">
          {packs.map(p => (
            <button
              key={p.id}
              className={`pack-chip ${characterPack === p.id ? 'active' : ''}`}
              onClick={() => setCharacterPack(p.id)}
              title={p.author ? `作者: ${p.author}` : ''}
            >
              {p.frames.idle && !p.builtin ? (
                <img src={p.frames.idle} alt="" className="pack-preview" />
              ) : (
                <span className="pack-preview emoji">🦐</span>
              )}
              <span className="pack-name">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="pack-actions">
          <button
            className="link-btn"
            onClick={() => (window as any).shrimpAPI.openCharactersFolder()}
          >
            📂 素材文件夹
          </button>
          <button className="link-btn" onClick={refreshPacks}>🔄 刷新</button>
        </div>
        <p className="pack-hint">
          内置 🇧🇷 巴西公仔 + 48 国国旗头像。也可放球星公仔 / 国家队吉祥物 / 任意 PNG
          到素材文件夹,每个子文件夹一个包(7 张表情图或单张图都行)
        </p>
      </section>

      <section className="section">
        <h2>数据模式</h2>
        <div className="mode-row">
          <label>
            <input
              type="radio" name="mode"
              checked={mode === 'replay'}
              onChange={() => setMode('replay')}
            />
            Replay
            <small>世界杯经典战役回放(离线也能玩)</small>
          </label>
          <label>
            <input
              type="radio" name="mode"
              checked={mode === 'live'}
              onChange={() => setMode('live')}
            />
            Live <span className="badge">推荐</span>
            <small>ESPN 实时拉取,20s 一刷,进球/红黄牌/点球自动推送</small>
          </label>
        </div>
      </section>

      <section className="section">
        <h2>提醒方式</h2>
        <div className="toggle-row">
          <label className="toggle">
            <input type="checkbox" checked={!quietMode} onChange={e => setQuietMode(!e.target.checked)} />
            <span>💬 弹气泡通知</span>
            <small>关闭后只看比分板,不弹任何文字气泡</small>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} />
            <span>🔊 声音提示</span>
            <small>进球/红牌/终场 8-bit 音效</small>
          </label>
        </div>
      </section>

      <section className="section">
        <h2>关注的球队（1-3 支国家队）</h2>
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索国家队 (阿根廷 / Brazil / 法国 ...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="team-grid">
          {filtered.map(t => (
            <button
              key={t}
              className={`team-chip ${favorites.includes(t) ? 'active' : ''}`}
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <div className="actions">
        <div className="selected">已选：{favorites.join(' · ') || '（无）'}</div>
        <button className="save-btn" onClick={save}>
          {saved ? '✓ 已保存' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
