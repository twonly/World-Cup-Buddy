import { useEffect, useState } from 'react';

type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';
type Pack = { id: string; name: string; author?: string; builtin?: boolean; frames: Partial<Record<Mood, string>> };

export function Settings() {
  const [teams, setTeams] = useState<string[]>([]);
  const [teamAliases, setTeamAliases] = useState<Record<string, string[]>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [mode, setMode] = useState<'live' | 'replay'>('replay');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [characterPack, setCharacterPack] = useState<string>('default-shrimp');
  const [quietMode, setQuietMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showPossession, setShowPossession] = useState(true);
  // Proxy settings
  const [proxyMode, setProxyMode] = useState<'direct' | 'system' | 'custom'>('direct');
  const [proxyUrl, setProxyUrl] = useState<string>('');
  const [proxyBypass, setProxyBypass] = useState<string>('<local>');
  const [proxyTestResult, setProxyTestResult] = useState<string>('');
  const [proxyTestOk, setProxyTestOk] = useState<boolean | null>(null);
  const [proxyTesting, setProxyTesting] = useState(false);

  useEffect(() => {
    const api = (window as any).shrimpAPI;
    (async () => {
      const [cfg, ts, aliases, ps] = await Promise.all([
        api.getConfig(),
        api.listTeams(),
        api.getTeamAliases ? api.getTeamAliases() : Promise.resolve({}),
        api.listCharacters(),
      ]);
      setFavorites(cfg.favoriteTeams ?? []);
      setMode(cfg.mode ?? 'replay');
      setCharacterPack(cfg.characterPack ?? 'default-shrimp');
      setQuietMode(!!cfg.quietMode);
      setSoundEnabled(!!cfg.soundEnabled);
      setShowPossession(cfg.showPossession ?? cfg.showWinProb !== false);
      setProxyMode(cfg.proxyMode ?? 'direct');
      setProxyUrl(cfg.proxyUrl ?? '');
      setProxyBypass(cfg.proxyBypass ?? '<local>');
      setTeams(ts);
      setTeamAliases(aliases ?? {});
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
    await api.setConfig({
      favoriteTeams: favorites, mode, characterPack, quietMode, soundEnabled, showPossession,
      proxyMode, proxyUrl, proxyBypass,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const testProxy = async () => {
    const api = (window as any).shrimpAPI;
    if (proxyMode === 'custom' && !proxyUrl.trim()) {
      setProxyTestOk(false);
      setProxyTestResult('❌ 请先填写自定义代理地址');
      return;
    }
    setProxyTesting(true);
    setProxyTestResult('');
    setProxyTestOk(null);
    try {
      const result = await api.testProxy(
        proxyMode,
        proxyMode === 'custom' ? proxyUrl : undefined,
        proxyMode === 'custom' ? proxyBypass : undefined,
      );
      setProxyTestOk(result.ok);
      setProxyTestResult(result.message);
    } catch (err: any) {
      setProxyTestOk(false);
      setProxyTestResult(`❌ 测试失败: ${err.message || String(err)}`);
    } finally {
      setProxyTesting(false);
    }
  };

  const filtered = teams.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    // Match against English name
    if (t.toLowerCase().includes(q)) return true;
    // Match against Chinese/abbr aliases (e.g. "阿根廷" → Argentina)
    const aliases = teamAliases[t.toLowerCase()] ?? [];
    return aliases.some(a => a.toLowerCase().includes(q));
  });

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
                <span className="pack-preview emoji">⚽</span>
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
          内置多国公仔。也可放球星公仔 / 国家队吉祥物 / 任意 PNG
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
            <small>ESPN 实时拉取,20s 一刷,进球/射门/角球/红黄牌自动推送</small>
          </label>
        </div>
      </section>

      <section className="section">
        <h2>🌐 网络代理</h2>
        <div className="proxy-row">
          <label>
            <input
              type="radio" name="proxy"
              checked={proxyMode === 'direct'}
              onChange={() => setProxyMode('direct')}
            />
            直连
            <small>不使用代理,直接联网</small>
          </label>
          <label>
            <input
              type="radio" name="proxy"
              checked={proxyMode === 'system'}
              onChange={() => setProxyMode('system')}
            />
            系统代理
            <small>使用操作系统代理配置</small>
          </label>
          <label>
            <input
              type="radio" name="proxy"
              checked={proxyMode === 'custom'}
              onChange={() => setProxyMode('custom')}
            />
            自定义
            <small>手动输入代理服务器地址</small>
          </label>
        </div>
        {proxyMode === 'custom' && (
          <div className="proxy-fields">
            <input
              type="text"
              placeholder="代理地址,如 http://proxy.corp.com:8080 或 http://user:pass@proxy:port"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
            />
            <input
              type="text"
              placeholder="绕过代理的域名(可选),如 <local>,*.corp.com"
              value={proxyBypass}
              onChange={e => setProxyBypass(e.target.value)}
            />
          </div>
        )}
        <div className="proxy-test-row">
          <button className="proxy-test-btn" onClick={testProxy} disabled={proxyTesting}>
            {proxyTesting ? '🔄 测试中...' : '🧪 测试连通性'}
          </button>
          {proxyTestResult && (
            <span className={`proxy-test-result ${proxyTestOk === true ? 'success' : proxyTestOk === false ? 'fail' : ''}`}>
              {proxyTestResult}
            </span>
          )}
        </div>
        <p className="proxy-hint">
          {proxyMode === 'system'
            ? '💡 系统代理会使用当前操作系统的代理配置。公司内网若有统一代理,通常选这个即可。'
            : proxyMode === 'custom'
            ? '💡 支持 HTTP 和 HTTPS 代理。格式: http://host:port 或 http://user:password@host:port'
            : '💡 公司内网无法访问 ESPN API 时,请切换到系统代理或自定义代理。'}
        </p>
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
          <label className="toggle">
            <input type="checkbox" checked={showPossession} onChange={e => setShowPossession(e.target.checked)} />
            <span>📈 控球曲线</span>
            <small>Live 模式下展示 ESPN possessionPct 的实时走势</small>
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
