import { useEffect, useRef, useState } from 'react';

type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';

const MOOD_EMOJI: Record<Mood, string> = {
  idle: '🦐', watch: '🦐', cheer: '🦐', sad: '🦐',
  flag: '🦐', sleep: '🦐', dance: '🦐',
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

// Sparkline as inline SVG path. data: array of 0..1 values.
function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const w = 86, h = 16;
  const stepX = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${(i * stepX).toFixed(1)},${((1 - v) * (h - 2) + 1).toFixed(1)}`).join(' ');
  const lastY = (1 - data[data.length - 1]) * (h - 2) + 1;
  const lastPct = Math.round(data[data.length - 1] * 100);
  return (
    <div className="winprob">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline points={pts} fill="none" stroke="#fde047" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={(data.length - 1) * stepX} cy={lastY} r="2" fill="#fde047" />
      </svg>
      <span className="winprob-pct">{lastPct}%</span>
    </div>
  );
}

export function Shrimp() {
  const [mood, setMood] = useState<Mood>('idle');
  const [pack, setPack] = useState<Pack | null>(null);
  const [revertTimer, setRevertTimer] = useState<number | null>(null);
  const [score, setScore] = useState<ScoreState | null>(null);
  const [winProb, setWinProb] = useState<number[]>([]);
  const [showWinProb, setShowWinProb] = useState(true);
  const [now, setNow] = useState(Date.now());
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  });

  // Tick once per second for countdown / clock
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const api = (window as any).shrimpAPI;
    if (!api) return;
    api.getConfig().then((cfg: any) => {
      const id = cfg?.characterPack ?? 'default-shrimp';
      api.getCharacter(id).then((p: Pack) => setPack(p));
      if (typeof cfg?.showWinProb === 'boolean') setShowWinProb(cfg.showWinProb);
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
        if (typeof ev.showWinProb === 'boolean') setShowWinProb(ev.showWinProb);
      } else if (ev?.kind === 'winprob') {
        setWinProb(Array.isArray(ev.points) ? ev.points : []);
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
  const onClick = () => {
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
      className={`shrimp-stage mood-${mood} ${isCustom ? 'custom' : ''}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title="左键戳一下｜双击告别｜右键菜单"
    >
      {score && (
        <div className="score-stack">
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
          </div>
          {contextLabel && (
            <div className="series-chip">{contextLabel}</div>
          )}
          {showWinProb && winProb.length > 1 && score.statusState === 'in' && (
            <Sparkline data={winProb} />
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
