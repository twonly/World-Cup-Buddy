import { useEffect, useRef, useState } from 'react';

type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';

const MOOD_EMOJI: Record<Mood, string> = {
  idle: '⚽', watch: '⚽', cheer: '⚽', sad: '⚽',
  flag: '⚽', sleep: '⚽', dance: '⚽',
};
const MOOD_ACCESSORY: Record<Mood, string> = {
  idle: '', watch: '⚽', cheer: '🎉', sad: '💧',
  flag: '🚩', sleep: '💤', dance: '✨',
};
const MOOD_FACE: Record<Mood, string> = {
  idle: '·  ·', watch: '◉ ◉', cheer: '＞ ＜', sad: 'T  T',
  flag: '＞ ＜', sleep: '－ －', dance: '＾ ＾',
};
const MOOD_LABEL: Record<Mood, string> = {
  idle: '摸鱼中', watch: '看球中', cheer: '庆祝中', sad: '难过中',
  flag: '准备开赛', sleep: '打盹中', dance: '蹦迪中',
};

type Pack = { id: string; name: string; builtin?: boolean; frames: Partial<Record<Mood, string>> };

type KeyEvent = {
  id: string;
  type: 'goal' | 'yellow' | 'red' | 'penalty' | 'own-goal';
  clock: string;
  player: string | null;
  teamName?: string;
  side: 'my' | 'opp';
  score?: string;
};

const EVENT_ICON: Record<KeyEvent['type'], string> = {
  goal: '⚽', penalty: '🥅', 'own-goal': '🙃', yellow: '🟨', red: '🟥',
};
const EVENT_LABEL: Record<KeyEvent['type'], string> = {
  goal: '进球', penalty: '点球', 'own-goal': '乌龙球', yellow: '黄牌', red: '红牌',
};

type ScoreState = {
  myTeamAbbr: string;
  oppTeamAbbr: string;
  myTeamLogo: string;
  oppTeamLogo: string;
  myScore: number;
  oppScore: number;
  status: string;
  statusState: 'pre' | 'in' | 'post';
  statusText?: string;
  period: number;
  clock: string;
  utcDate: string;
  myShootout?: number;
  oppShootout?: number;
  isPenalties?: boolean;
  groupName?: string;
  roundName?: string;
  myPossessionPct?: number;
  oppPossessionPct?: number;
  myShots?: number;
  oppShots?: number;
  myShotsOnTarget?: number;
  oppShotsOnTarget?: number;
};

function statusBadge(s: ScoreState, now: number): string {
  if (s.statusState === 'in') {
    // displayClock is the live minute e.g. "67'"; fall back to a phase label.
    if (s.clock) return s.clock;
    if (s.period >= 5) return '点球';
    if (s.period >= 3) return '加时';
    if (s.period === 2) return '下半场';
    if (s.period === 1) return '上半场';
    return s.statusText || '进行中';
  }
  if (s.statusState === 'post') {
    if (s.isPenalties) return '点球';
    if (s.period >= 3) return '加时完';
    return '终';
  }
  // pre-match: countdown
  if (!s.utcDate) return '预告';
  const ms = new Date(s.utcDate).getTime() - now;
  if (ms <= 0) return '即将开赛';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `🕐 ${h}h ${m}m`;
  if (m > 0) return `🕐 ${m}m`;
  return `🕐 <1m`;
}

// =========================================================
// 8-bit-ish tones via Web Audio API. No assets bundled.
// =========================================================
let ac: AudioContext | null = null;
function getAC(): AudioContext {
  if (!ac) ac = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ac;
}
function blip(freq: number, durMs: number, startOffset = 0, type: OscillatorType = 'square', vol = 0.06) {
  try {
    const ctx = getAC();
    const now = ctx.currentTime + startOffset;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + durMs / 1000 + 0.02);
  } catch {}
}
function playMoodSound(mood: Mood) {
  switch (mood) {
    case 'cheer': blip(523.25, 90); blip(659.25, 90, 0.09); break;            // C5 → E5
    case 'dance': blip(523.25, 80); blip(659.25, 80, 0.08); blip(783.99, 120, 0.16); break; // C E G fanfare
    case 'sad':   blip(440, 120, 0, 'sine'); blip(349.23, 200, 0.12, 'sine'); break;         // A4 → F4
    case 'flag':  blip(880, 80, 0, 'square'); blip(880, 80, 0.10); break;                     // double whistle
    case 'sleep': blip(220, 200, 0, 'sine'); break;
    case 'watch': blip(660, 50, 0, 'triangle'); break;
    case 'idle':  break;
  }
}

// Two-sided possession bar. Labels each side with its team abbreviation so it's
// always clear which team owns which share — no need to remember who is "home".
function PossessionBar({
  data, myPct, oppPct, myAbbr, oppAbbr,
}: {
  data: number[]; myPct?: number; oppPct?: number; myAbbr: string; oppAbbr: string;
}) {
  // Prefer the explicit per-team percentage; fall back to the trend's last point.
  const my = Math.round(myPct ?? (data.length ? data[data.length - 1] * 100 : 50));
  const opp = Math.round(oppPct ?? (100 - my));
  const total = my + opp || 100;
  return (
    <div className="possession" title="控球率">
      <span className="poss-team my">{myAbbr || '主'}</span>
      <span className="poss-bar">
        <span className="poss-fill my" style={{ flexGrow: my / total }}>{my}%</span>
        <span className="poss-fill opp" style={{ flexGrow: opp / total }}>{opp}%</span>
      </span>
      <span className="poss-team opp">{oppAbbr || '客'}</span>
    </div>
  );
}

export function Shrimp() {
  const [mood, setMood] = useState<Mood>('idle');
  const [poked, setPoked] = useState(false);
  const pokeTimer = useRef<number | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [revertTimer, setRevertTimer] = useState<number | null>(null);
  const [score, setScore] = useState<ScoreState | null>(null);
  const [possession, setPossession] = useState<number[]>([]);
  const [showPossession, setShowPossession] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([]);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  });

  // Tick once per second for countdown / clock
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch key events when the scoreboard changes while the event panel is open.
  useEffect(() => {
    if (!eventsExpanded || !score) return;
    const api = (window as any).shrimpAPI;
    api?.getKeyEvents?.().then((events: KeyEvent[]) => setKeyEvents(events ?? []));
  }, [eventsExpanded, score]);

  useEffect(() => {
    const api = (window as any).shrimpAPI;
    if (!api) return;
    api.getConfig().then((cfg: any) => {
      const id = cfg?.characterPack ?? 'default-shrimp';
      api.getCharacter(id).then((p: Pack) => setPack(p));
      setShowPossession(cfg?.showPossession ?? cfg?.showWinProb !== false);
    });
    const off = api.onEvent((ev: any) => {
      if (ev?.kind === 'mood') {
        setMood(ev.mood);
        if (ev.playSound) playMoodSound(ev.mood);
        if (revertTimer) window.clearTimeout(revertTimer);
        const t = window.setTimeout(() => setMood('watch'), 12_000);
        setRevertTimer(t);
      } else if (ev?.kind === 'pack') {
        setPack(ev.pack ?? null);
      } else if (ev?.kind === 'score') {
        setScore(ev.score ?? null);
        if (typeof ev.showPossession === 'boolean') setShowPossession(ev.showPossession);
        else if (typeof ev.showWinProb === 'boolean') setShowPossession(ev.showWinProb);
      } else if (ev?.kind === 'possession' || ev?.kind === 'winprob') {
        setPossession(Array.isArray(ev.points) ? ev.points : []);
      }
    });
    return () => off?.();
  }, [revertTimer]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { dragging: true, lastX: e.screenX, lastY: e.screenY };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.screenX - dragRef.current.lastX;
      const dy = e.screenY - dragRef.current.lastY;
      dragRef.current.lastX = e.screenX;
      dragRef.current.lastY = e.screenY;
      (window as any).shrimpAPI?.drag(dx, dy);
    };
    const onUp = () => { dragRef.current.dragging = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const clickTimer = useRef<number | null>(null);
  // Instant tactile feedback on every click — even ones the main process
  // debounces away — so the buddy never feels unresponsive.
  const poke = () => {
    if (pokeTimer.current) window.clearTimeout(pokeTimer.current);
    setPoked(false);
    requestAnimationFrame(() => setPoked(true)); // restart the animation
    pokeTimer.current = window.setTimeout(() => setPoked(false), 550);
  };
  const onClick = () => {
    poke();
    if (clickTimer.current) return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      (window as any).shrimpAPI?.click();
    }, 260);
  };
  const onDoubleClick = () => {
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
    (window as any).shrimpAPI?.contextMenu();
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    (window as any).shrimpAPI?.contextMenu();
  };

  const toggleEvents = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEventsExpanded(prev => !prev);
  };

  const customSrc = pack && !pack.builtin ? pack.frames[mood] : undefined;
  const isCustom = !!customSrc;

  // Group / round context (e.g. "Group A" or "Round of 32"); penalties shown inline.
  const contextLabel = (() => {
    if (!score) return '';
    const parts: string[] = [];
    if (score.groupName) parts.push(score.groupName);
    else if (score.roundName) parts.push(score.roundName);
    if (score.isPenalties && score.myShootout !== undefined && score.oppShootout !== undefined) {
      parts.push(`点球 ${score.myShootout}-${score.oppShootout}`);
    }
    return parts.join(' · ');
  })();

  const isPregame = score?.statusState === 'pre';

  return (
    <div
      className={`shrimp-stage mood-${mood} ${isCustom ? 'custom' : ''} ${poked ? 'poked' : ''}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title="左键戳一下｜双击告别｜右键菜单"
    >
      {score && (
        <div className={`score-stack ${eventsExpanded ? 'expanded' : ''}`} onClick={toggleEvents} onDoubleClick={e => e.stopPropagation()}>
          <div className={`score-chip status-${score.status.replace('STATUS_','').toLowerCase()}`}>
            {score.myTeamLogo
              ? <img className="logo" src={score.myTeamLogo} alt={score.myTeamAbbr} draggable={false} />
              : <span className="team">{score.myTeamAbbr}</span>}
            {!isPregame && <span className={`score ${score.myScore > score.oppScore ? 'lead' : ''}`}>{score.myScore}</span>}
            <span className="dash">{isPregame ? 'vs' : '·'}</span>
            {!isPregame && <span className={`score ${score.oppScore > score.myScore ? 'lead' : ''}`}>{score.oppScore}</span>}
            {score.oppTeamLogo
              ? <img className="logo" src={score.oppTeamLogo} alt={score.oppTeamAbbr} draggable={false} />
              : <span className="team">{score.oppTeamAbbr}</span>}
            <span className="period">{statusBadge(score, now)}</span>
            <span className="score-chevron" aria-hidden>{eventsExpanded ? '▲' : '▼'}</span>
          </div>
          {contextLabel && (
            <div className="series-chip">{contextLabel}</div>
          )}
          {showPossession && score.statusState === 'in' &&
            (score.myPossessionPct != null || possession.length > 1) && (
            <PossessionBar
              data={possession}
              myPct={score.myPossessionPct}
              oppPct={score.oppPossessionPct}
              myAbbr={score.myTeamAbbr}
              oppAbbr={score.oppTeamAbbr}
            />
          )}
          {eventsExpanded && (
            <div className="events-panel" onClick={e => e.stopPropagation()}>
              {keyEvents.length === 0 ? (
                <div className="event-empty">暂无关键事件</div>
              ) : (
                <div className="tl">
                  <div className="tl-head">
                    <span className="tl-team my">{score.myTeamAbbr || '主'}</span>
                    <span className="tl-team opp">{score.oppTeamAbbr || '客'}</span>
                  </div>
                  <div className="tl-body">
                    {keyEvents.map(ev => {
                      const isGoal = ev.type !== 'yellow' && ev.type !== 'red';
                      const name = ev.player || EVENT_LABEL[ev.type];
                      const clk = <span className="tl-clk">{ev.clock || '?'}</span>;
                      const ic = <span className="tl-ic" aria-hidden>{EVENT_ICON[ev.type]}</span>;
                      const nm = <span className="tl-name" title={ev.teamName}>{name}</span>;
                      const content = ev.side === 'my' ? <>{nm}{ic}{clk}</> : <>{clk}{ic}{nm}</>;
                      const node = isGoal && ev.score
                        ? <span className="tl-score">{ev.score}</span>
                        : <span className={`tl-node ${ev.type}`} />;
                      return (
                        <div key={ev.id} className={`tl-row ${ev.side}`}>
                          <div className="tl-side left">{ev.side === 'my' && content}</div>
                          <div className="tl-mid">{node}</div>
                          <div className="tl-side right">{ev.side === 'opp' && content}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="shrimp-body">
        {isCustom ? (
          <img className="shrimp-img" src={customSrc} alt="" draggable={false} />
        ) : (
          <>
            <div className="shrimp-emoji" aria-hidden>{MOOD_EMOJI[mood]}</div>
            <div className="shrimp-face">{MOOD_FACE[mood]}</div>
          </>
        )}
        {MOOD_ACCESSORY[mood] && (
          <div className="shrimp-accessory">{MOOD_ACCESSORY[mood]}</div>
        )}
      </div>
      <div className="shrimp-label">{MOOD_LABEL[mood]}</div>
    </div>
  );
}
