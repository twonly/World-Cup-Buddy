import { net } from 'electron';

// 7 moods, shared with the character system so custom packs stay drop-in compatible.
export type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';
export type GameEvent = { mood: Mood; message: string; ttl?: number };

type PollerOptions = {
  favoriteTeams: string[];
  mode: 'live' | 'replay';
  onEvent: (ev: GameEvent) => void;
  onScore?: (s: ScoreState | null) => void;
  onWinProb?: (points: number[]) => void;   // legacy callback name; carries ESPN possessionPct curve
};

export type ScoreState = {
  matchId: string;
  myTeam: string;
  oppTeam: string;
  myTeamAbbr: string;
  oppTeamAbbr: string;
  myTeamLogo: string;
  oppTeamLogo: string;
  myScore: number;
  oppScore: number;
  status: string;                   // raw ESPN status.type.name
  statusState: 'pre' | 'in' | 'post';
  statusText: string;               // human detail e.g. "1st Half", "FT-Pens"
  period: number;                   // 1,2 = halves; 3,4 = extra time; 5 = penalties
  clock: string;                    // displayClock e.g. "67'"
  myIsHome: boolean;
  utcDate: string;                  // ISO start time, for countdown
  // Penalty shootout — score stays level (e.g. 3-3), shootout decides it
  myShootout?: number;
  oppShootout?: number;
  isPenalties?: boolean;
  myWinner?: boolean;               // ESPN competitor.winner — survives draws-on-pens
  // World Cup context
  groupName?: string;               // "Group A" during group stage
  roundName?: string;               // "Round of 32", "Final", ...
  venue?: string;
  myPossessionPct?: number;
  oppPossessionPct?: number;
  myShots?: number;
  oppShots?: number;
  myShotsOnTarget?: number;
  oppShotsOnTarget?: number;
  myCorners?: number;
  oppCorners?: number;
  myFouls?: number;
  oppFouls?: number;
};
let currentScore: ScoreState | null = null;
let currentPossession: number[] = [];
let possessionHistory = new Map<string, number[]>();
export function getCurrentScore(): ScoreState | null { return currentScore; }
export function getCurrentPossession(): number[] { return [...currentPossession]; }

// ---- Proxy support ----
// The poller uses Electron's net.fetch() which goes through Chromium's network stack.
// Proxy is configured via session.setProxy() in main.ts — applies to ALL requests
// (poller, autoUpdater, net.fetch) automatically. No separate proxy agent needed.
// The testProxyConnectivity function below is used for verifying proxy settings.

/** Test ESPN connectivity using whatever proxy main.ts has applied. */
export async function testProxyConnectivity(): Promise<{ ok: boolean; message: string }> {
  const testUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${WC_LEAGUE}/scoreboard`;
  try {
    const result = await httpGetJson(testUrl);
    if (result && (result.events ?? []).length > 0) {
      return { ok: true, message: `✅ 代理连通！ESPN API 正常响应，已发现 ${result.events.length} 场比赛数据` };
    }
    return { ok: true, message: '✅ 代理连通！ESPN API 有响应（但暂无比赛数据）' };
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes('abort') || msg.includes('timeout')) {
      return { ok: false, message: '❌ 连接超时 — 代理地址可能不正确，或代理服务器未响应' };
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET') || msg.toLowerCase().includes('proxy') || msg.includes('tunnel')) {
      return { ok: false, message: `❌ 代理拒绝连接 — ${msg}` };
    }
    if (msg.includes('HTTP 407')) {
      return { ok: false, message: '❌ 代理需要认证 — 请在代理地址中包含用户名和密码 (http://user:pass@host:port)' };
    }
    return { ok: false, message: `❌ 连接失败 — ${msg}` };
  }
}

// ESPN soccer league slug for the FIFA World Cup. Season auto-selects 2026.
const WC_LEAGUE = 'fifa.world';

// National teams likely/confirmed for 2026 (48-team field). Used for the settings
// picker and favorite-matching. ESPN supplies real displayNames at runtime, so this
// only needs to be close enough to match on. Chinese aliases let users search 中文.
const WC_TEAMS = [
  'Argentina','Brazil','France','England','Spain','Germany','Portugal','Netherlands',
  'Italy','Belgium','Croatia','Uruguay','Colombia','Mexico','United States','Canada',
  'Japan','South Korea','Australia','Morocco','Senegal','Nigeria','Ghana','Ivory Coast',
  'Cameroon','Egypt','Tunisia','Algeria','South Africa','Switzerland','Denmark','Poland',
  'Serbia','Austria','Ukraine','Scotland','Wales','Norway','Sweden','Turkey','Czechia',
  'Ecuador','Peru','Chile','Paraguay','Venezuela','Costa Rica','Panama','Jamaica',
  'Saudi Arabia','Iran','Qatar','Iraq','Jordan','Uzbekistan','New Zealand','Greece',
];

const TEAM_ALIASES: Record<string, string[]> = {
  'argentina': ['阿根廷', 'arg', 'argentine'],
  'brazil': ['巴西', 'bra', 'brasil'],
  'france': ['法国', 'fra', 'les bleus'],
  'england': ['英格兰', 'eng', 'three lions'],
  'spain': ['西班牙', 'esp', 'espana', 'la roja'],
  'germany': ['德国', 'ger', 'deutschland', 'die mannschaft'],
  'portugal': ['葡萄牙', 'por'],
  'netherlands': ['荷兰', 'ned', 'holland', 'oranje'],
  'italy': ['意大利', 'ita', 'italia', 'azzurri'],
  'belgium': ['比利时', 'bel'],
  'croatia': ['克罗地亚', 'cro', 'hrvatska'],
  'uruguay': ['乌拉圭', 'uru'],
  'colombia': ['哥伦比亚', 'col'],
  'mexico': ['墨西哥', 'mex', 'el tri'],
  'united states': ['美国', 'usa', 'usmnt', 'united states of america'],
  'canada': ['加拿大', 'can'],
  'japan': ['日本', 'jpn', 'samurai blue'],
  'south korea': ['韩国', 'kor', 'korea republic', 'korea'],
  'australia': ['澳大利亚', 'aus', 'socceroos'],
  'morocco': ['摩洛哥', 'mar', 'atlas lions'],
  'senegal': ['塞内加尔', 'sen'],
  'nigeria': ['尼日利亚', 'nga', 'super eagles'],
  'ghana': ['加纳', 'gha', 'black stars'],
  'ivory coast': ['科特迪瓦', 'civ', "cote d'ivoire"],
  'cameroon': ['喀麦隆', 'cmr'],
  'egypt': ['埃及', 'egy'],
  'tunisia': ['突尼斯', 'tun'],
  'algeria': ['阿尔及利亚', 'alg'],
  'south africa': ['南非', 'rsa', 'bafana'],
  'switzerland': ['瑞士', 'sui', 'schweiz'],
  'denmark': ['丹麦', 'den'],
  'poland': ['波兰', 'pol'],
  'serbia': ['塞尔维亚', 'srb'],
  'austria': ['奥地利', 'aut'],
  'ukraine': ['乌克兰', 'ukr'],
  'scotland': ['苏格兰', 'sco'],
  'wales': ['威尔士', 'wal'],
  'norway': ['挪威', 'nor'],
  'sweden': ['瑞典', 'swe'],
  'turkey': ['土耳其', 'tur', 'turkiye'],
  'czechia': ['捷克', 'cze', 'czech republic'],
  'ecuador': ['厄瓜多尔', 'ecu'],
  'peru': ['秘鲁', 'per'],
  'chile': ['智利', 'chi'],
  'paraguay': ['巴拉圭', 'par'],
  'venezuela': ['委内瑞拉', 'ven'],
  'costa rica': ['哥斯达黎加', 'crc'],
  'panama': ['巴拿马', 'pan'],
  'jamaica': ['牙买加', 'jam'],
  'saudi arabia': ['沙特阿拉伯', '沙特', 'ksa'],
  'iran': ['伊朗', 'irn'],
  'qatar': ['卡塔尔', 'qat'],
  'iraq': ['伊拉克', 'irq'],
  'jordan': ['约旦', 'jor'],
  'uzbekistan': ['乌兹别克斯坦', 'uzb'],
  'new zealand': ['新西兰', 'nzl', 'all whites'],
  'greece': ['希腊', 'gre'],
};

type FallbackMatch = {
  id: number; home: string; away: string;
  homeScore: number; awayScore: number;
  homePens?: number; awayPens?: number;
  stage: string; date: string;
};

// World Cup classics for replay mode (offline / pre-tournament demo).
const WC_CLASSICS: FallbackMatch[] = [
  { id: 9_001, home: 'Argentina', away: 'France',  homeScore: 3, awayScore: 3, homePens: 4, awayPens: 2, stage: '2022 决赛', date: '2022-12-18' },
  { id: 9_002, home: 'France',    away: 'Croatia', homeScore: 4, awayScore: 2, stage: '2018 决赛', date: '2018-07-15' },
  { id: 9_003, home: 'Germany',   away: 'Argentina', homeScore: 1, awayScore: 0, stage: '2014 决赛', date: '2014-07-13' },
  { id: 9_004, home: 'Spain',     away: 'Netherlands', homeScore: 1, awayScore: 0, stage: '2010 决赛', date: '2010-07-11' },
  { id: 9_005, home: 'Brazil',    away: 'Germany',  homeScore: 1, awayScore: 7, stage: '2014 半决赛', date: '2014-07-08' },
  { id: 9_006, home: 'Italy',     away: 'France',   homeScore: 1, awayScore: 1, homePens: 5, awayPens: 3, stage: '2006 决赛', date: '2006-07-09' },
];

let pollTimer: NodeJS.Timeout | null = null;
let replayTimer: NodeJS.Timeout | null = null;
let currentOptions: PollerOptions | null = null;
let lastSeenGameIds = new Set<number>();
let lastSeenPlayId = new Map<string, string>();
let lastSeenStatus = new Map<string, string>();
let lastEventAt = new Map<string, number>();  // last time we said anything about a match
let pendingEmits: NodeJS.Timeout[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export type LastGameSnapshot = {
  myTeam: string; oppTeam: string;
  myScore: number; oppScore: number;
  date: string; highlight: string;
  mood: 'cheer' | 'sad' | 'watch';
};
let lastGameSnapshot: LastGameSnapshot | null = null;

export function getLastGameSnapshot(): LastGameSnapshot | null { return lastGameSnapshot; }
export function getKnownTeams(): string[] { return [...WC_TEAMS]; }

/**
 * Returns a map of English team name → Chinese/abbr aliases,
 * used by the Settings UI to support Chinese search input.
 */
export function getTeamAliases(): Record<string, string[]> {
  return { ...TEAM_ALIASES };
}

export function setFavoriteTeams(teams: string[]) {
  if (currentOptions) currentOptions.favoriteTeams = teams;
  lastSeenGameIds = new Set();
  lastSeenPlayId = new Map();
  lastSeenStatus = new Map();
  lastEventAt = new Map();
  possessionHistory = new Map();
  currentPossession = [];
  pendingEmits.forEach(t => clearTimeout(t));
  pendingEmits = [];
  if (replayTimer) clearTimeout(replayTimer);
  setTimeout(() => tick().catch(() => {}), 800);
}

export function startPoller(opts: PollerOptions) {
  currentOptions = opts;
  setTimeout(() => tick().catch(() => {}), 1500);
  // Tight loop during live matches so the user feels the action.
  const interval = opts.mode === 'live' ? 20_000 : 60_000;
  pollTimer = setInterval(() => { tick().catch(() => {}); }, interval);
}

export function stopPoller() {
  if (pollTimer) clearInterval(pollTimer);
  if (replayTimer) clearTimeout(replayTimer);
  pendingEmits.forEach(t => clearTimeout(t));
  pendingEmits = [];
  pollTimer = null;
  replayTimer = null;
  currentPossession = [];
  possessionHistory = new Map();
}

// Force a poll immediately (e.g. user clicked the buddy). 5s debounced.
let forceTickCooldownUntil = 0;
export function forceTick(): boolean {
  const now = Date.now();
  if (now < forceTickCooldownUntil) return false;
  forceTickCooldownUntil = now + 5000;
  tick().catch(() => {});
  return true;
}

let lastRealEventAt = 0;
export function getLastRealEventAt(): number { return lastRealEventAt; }

// Pull venue / group standings / scorer into a single info-bite bubble
// (best for "user clicked during a quiet stretch").
export async function fetchInfoBite(): Promise<GameEvent | null> {
  const snap = currentScore;
  if (!snap) return null;
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${WC_LEAGUE}/summary?event=${snap.matchId}`;
    const json = await httpGetJson(url);
    const options: GameEvent[] = [];

    // Venue
    const venue = snap.venue || json?.gameInfo?.venue?.fullName;
    const city = json?.gameInfo?.venue?.address?.city;
    if (venue) {
      options.push({
        mood: 'idle',
        message: `🏟️ 这场在 ${venue}${city ? ' (' + city + ')' : ''}`,
        ttl: 5500,
      });
    }

    // Group standings — surface my team's spot in the group
    const groups = json?.standings?.groups ?? [];
    for (const g of groups) {
      const entries = g?.standings?.entries ?? [];
      const mine = entries.find((e: any) =>
        teamMatches(e?.team?.displayName ?? '', snap.myTeam.toLowerCase()),
      );
      if (mine) {
        const rank = mine?.stats?.find((s: any) => s.name === 'rank')?.displayValue;
        const pts = mine?.stats?.find((s: any) => s.name === 'points')?.displayValue;
        const gName = g?.header ?? snap.groupName ?? '小组';
        if (rank || pts) {
          options.push({
            mood: 'watch',
            message: `📊 ${gName}: ${snap.myTeam} 第${rank ?? '?'} 位${pts ? `, ${pts} 分` : ''}`,
            ttl: 6500,
          });
        }
        break;
      }
    }

    // Top scorer in this match (boxscore leaders)
    for (const team of (json?.leaders ?? [])) {
      const cats = team?.leaders ?? [];
      const goals = cats.find((c: any) => /goal/i.test(c?.displayName ?? ''));
      const top = goals?.leaders?.[0];
      const ath = top?.athlete?.displayName;
      const val = top?.displayValue;
      if (ath && val) {
        options.push({ mood: 'cheer', message: `⚽ 射手榜: ${ath} (${val})`, ttl: 6000 });
      }
    }

    // News headline — bubble auto-grows now, so keep the full title
    // (cap only against pathological lengths)
    const articles = json?.news?.articles ?? [];
    if (articles.length > 0) {
      const headline: string = articles[0]?.headline ?? '';
      options.push({
        mood: 'watch',
        message: `📰 ${headline.length > 160 ? headline.slice(0, 157) + '…' : headline}`,
        ttl: 8000,
      });
    }

    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)];
  } catch {
    return null;
  }
}

function emit(ev: GameEvent, matchId: string) {
  if (!currentOptions) return;
  currentOptions.onEvent(ev);
  lastEventAt.set(matchId, Date.now());
  lastRealEventAt = Date.now();
}
function scheduleEmit(ev: GameEvent, matchId: string, delayMs: number) {
  const t = setTimeout(() => {
    emit(ev, matchId);
    pendingEmits = pendingEmits.filter(x => x !== t);
  }, delayMs);
  pendingEmits.push(t);
}

async function tick() {
  if (!currentOptions) return;
  if (currentOptions.mode === 'live') await tickLive().catch(() => {});
  else await tickReplay().catch(() => {});
}

// =====================================================================
// REPLAY MODE — World Cup classics
// =====================================================================
async function tickReplay() {
  if (!currentOptions) return;
  const matches = [...WC_CLASSICS].sort(() => Math.random() - 0.5);
  const fav = currentOptions.favoriteTeams.map(t => t.toLowerCase());
  const favMatch =
    matches.find(m => fav.some(f => teamMatches(m.home, f) || teamMatches(m.away, f))) ??
    matches[0];

  if (lastSeenGameIds.has(favMatch.id)) return;
  lastSeenGameIds.add(favMatch.id);
  startReplay(favMatch, fav);
}

function startReplay(match: FallbackMatch, favLower: string[]) {
  if (!currentOptions) return;
  const onEvent = currentOptions.onEvent;
  const myIsHome = favLower.some(f => teamMatches(match.home, f)) ||
                   !favLower.some(f => teamMatches(match.away, f));
  const myTeam = myIsHome ? match.home : match.away;
  const oppTeam = myIsHome ? match.away : match.home;
  const myScore = myIsHome ? match.homeScore : match.awayScore;
  const oppScore = myIsHome ? match.awayScore : match.homeScore;
  const hasPens = match.homePens !== undefined && match.awayPens !== undefined;
  const myPens = myIsHome ? match.homePens : match.awayPens;
  const oppPens = myIsHome ? match.awayPens : match.homePens;
  const won = hasPens ? (myPens! > oppPens!) : myScore > oppScore;
  const draw = !hasPens && myScore === oppScore;
  const pensStr = hasPens ? ` (点球 ${myPens}-${oppPens})` : '';

  lastGameSnapshot = {
    myTeam, oppTeam, myScore, oppScore,
    date: new Date().toLocaleDateString('zh-CN'),
    highlight: won ? `${match.stage}・${myTeam} 笑到最后!${pensStr}` :
               draw ? `${match.stage}・${myTeam} 战平 ${oppTeam}` :
                      `${match.stage}・遗憾告负${pensStr}`,
    mood: won ? 'cheer' : draw ? 'watch' : 'sad',
  };

  const beats: GameEvent[] = [
    { mood: 'flag', message: `⚽ ${match.stage}・${myTeam} vs ${oppTeam} 开球!Buddy 抱好围巾` },
    { mood: 'watch', message: `上半场, ${myTeam} 控住节奏` },
    { mood: 'cheer', message: `🔥 ${myTeam} 一脚远射,看台沸腾` },
    { mood: 'sad', message: `💢 ${oppTeam} 扳回一球,得稳住` },
    { mood: 'sleep', message: `☕ 中场休息` },
    { mood: 'watch', message: `下半场, ${myTeam} ${myScore >= oppScore ? '掌握主动' : '全力反扑'}` },
    won
      ? { mood: 'dance', message: `🏆 终场! ${myTeam} ${myScore}-${oppScore} ${oppTeam}${pensStr}, 赢了! ⚽🎉` }
      : draw
      ? { mood: 'watch', message: `🤝 ${myTeam} ${myScore}-${oppScore} ${oppTeam}, 握手言和` }
      : { mood: 'sad', message: `😭 终场 ${myTeam} ${myScore}-${oppScore} ${oppTeam}${pensStr}, 惜败` },
  ];

  let i = 0;
  const next = () => {
    if (!currentOptions) return;
    if (i >= beats.length) return;
    onEvent(beats[i]);
    i++;
    replayTimer = setTimeout(next, 9_000 + Math.random() * 3000);
  };
  next();
}

// =====================================================================
// LIVE MODE — ESPN public soccer API (fifa.world)
// =====================================================================
type EspnEvent = {
  id: string;
  home: string; away: string;
  homeAbbr: string; awayAbbr: string;
  homeLogo: string; awayLogo: string;
  homeId: string; awayId: string;
  homeScore: number; awayScore: number;
  homeShootout?: number; awayShootout?: number;
  homeWinner?: boolean; awayWinner?: boolean;
  status: string;            // status.type.name
  state: 'pre' | 'in' | 'post';
  completed: boolean;
  statusText: string;        // status.type.detail e.g. "1st Half" / "FT-Pens"
  period: number; clock: string; utcDate: string;
  groupName?: string;
  roundName?: string;
  venue?: string;
  homeStats: SoccerStats;
  awayStats: SoccerStats;
};

type EspnPlay = {
  id: string;
  text: string;
  typeText: string;          // "Goal", "Yellow Card", "Substitution", ...
  scoringPlay: boolean;
  teamName?: string;
  clock: string;
  homeScore: number; awayScore: number;
  sortKey?: number;
};

type SoccerStats = {
  possessionPct?: number;
  totalShots?: number;
  shotsOnTarget?: number;
  corners?: number;
  fouls?: number;
};

async function tickLive() {
  if (!currentOptions) return;
  const fav = currentOptions.favoriteTeams.map(t => t.toLowerCase());

  let matches: EspnEvent[] = [];
  try { matches = await fetchEspnScoreboard(); } catch { return; }
  if (!matches.length) {
    await announceNoMatch(fav, []);
    return;
  }

  const relevant = matches.filter(m =>
    fav.some(f => teamMatches(m.home, f) || teamMatches(m.away, f))
  );

  // Decide which match(es) to follow (Issue #1):
  //  - Favorite team playing today → follow those, with partisan 我方/对方 commentary.
  //  - Otherwise auto-follow the single best World Cup match (live now, or the next one
  //    once it's within 30 min of kickoff), so the user always sees live match info
  //    even without picking a team.
  let followed: EspnEvent[];
  let rooting: boolean;
  if (relevant.length > 0) {
    followed = relevant;
    rooting = true;
  } else {
    const auto = pickAutoFollowMatch(matches);
    if (!auto) {
      if (currentScore) { currentScore = null; currentOptions.onScore?.(null); }
      await announceNoMatch(fav, matches);
      return;
    }
    followed = [auto];
    rooting = false;
  }

  // myIsHome: partisan mode follows the favorite team's side; neutral mode treats home as "my".
  const myHomeOf = (m: EspnEvent) => rooting ? fav.some(f => teamMatches(m.home, f)) : true;

  // Broadcast the BEST followed match as the persistent scoreboard.
  // Priority: in-progress > finished today > scheduled today.
  const priorityRank = (m: EspnEvent) =>
    m.state === 'in' ? 0 : m.state === 'post' ? 1 : 2;
  const best = [...followed].sort((a, b) => priorityRank(a) - priorityRank(b))[0];
  if (best) {
    const bestMyHome = myHomeOf(best);
    const myStats = bestMyHome ? best.homeStats : best.awayStats;
    const oppStats = bestMyHome ? best.awayStats : best.homeStats;
    currentScore = {
      matchId: best.id,
      myTeam: bestMyHome ? best.home : best.away,
      oppTeam: bestMyHome ? best.away : best.home,
      myTeamAbbr: bestMyHome ? best.homeAbbr : best.awayAbbr,
      oppTeamAbbr: bestMyHome ? best.awayAbbr : best.homeAbbr,
      myTeamLogo: bestMyHome ? best.homeLogo : best.awayLogo,
      oppTeamLogo: bestMyHome ? best.awayLogo : best.homeLogo,
      myScore: bestMyHome ? best.homeScore : best.awayScore,
      oppScore: bestMyHome ? best.awayScore : best.homeScore,
      status: best.status,
      statusState: best.state,
      statusText: best.statusText,
      period: best.period,
      clock: best.clock,
      myIsHome: bestMyHome,
      utcDate: best.utcDate,
      myShootout: bestMyHome ? best.homeShootout : best.awayShootout,
      oppShootout: bestMyHome ? best.awayShootout : best.homeShootout,
      isPenalties: best.homeShootout !== undefined || best.awayShootout !== undefined,
      myWinner: bestMyHome ? best.homeWinner : best.awayWinner,
      groupName: best.groupName,
      roundName: best.roundName,
      venue: best.venue,
      myPossessionPct: myStats.possessionPct,
      oppPossessionPct: oppStats.possessionPct,
      myShots: myStats.totalShots,
      oppShots: oppStats.totalShots,
      myShotsOnTarget: myStats.shotsOnTarget,
      oppShotsOnTarget: oppStats.shotsOnTarget,
      myCorners: myStats.corners,
      oppCorners: oppStats.corners,
      myFouls: myStats.fouls,
      oppFouls: oppStats.fouls,
    };
    currentOptions.onScore?.(currentScore);
    if (best.state === 'in') {
      const next = appendPossessionPoint(possessionHistory.get(best.id) ?? [], myStats.possessionPct);
      possessionHistory.set(best.id, next);
      currentPossession = next;
      currentOptions.onWinProb?.(currentPossession);
    } else {
      currentPossession = [];
      currentOptions.onWinProb?.([]);
    }
  }

  for (const m of followed) {
    const prevStatus = lastSeenStatus.get(m.id);
    lastSeenStatus.set(m.id, m.status);
    const myIsHome = myHomeOf(m);
    const myTeam = myIsHome ? m.home : m.away;
    const oppTeam = myIsHome ? m.away : m.home;
    const myScore = myIsHome ? m.homeScore : m.awayScore;
    const oppScore = myIsHome ? m.awayScore : m.homeScore;
    const myPens = myIsHome ? m.homeShootout : m.awayShootout;
    const oppPens = myIsHome ? m.awayShootout : m.homeShootout;
    const myWon = myIsHome ? m.homeWinner : m.awayWinner;

    // ============= First sighting — describe CURRENT state honestly =============
    if (prevStatus === undefined) {
      if (m.state === 'pre') {
        const localTime = new Date(m.utcDate).toLocaleString('zh-CN', {
          hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit',
        });
        const ctx = m.groupName ? ` · ${m.groupName}` : m.roundName ? ` · ${m.roundName}` : '';
        emit({ mood: 'flag', message: `📅 ${localTime} ${myTeam} vs ${oppTeam}${ctx}, 锁定时间`, ttl: 6000 }, m.id);
      } else if (m.state === 'in') {
        emit({
          mood: 'watch',
          message: `👀 接上比赛: ${m.clock || phaseLabel(m)} | ${myTeam} ${myScore}-${oppScore} ${oppTeam}`,
          ttl: 6000,
        }, m.id);
      } else if (m.state === 'post') {
        emitFullTime(m, myTeam, oppTeam, myScore, oppScore, myPens, oppPens, myWon, true, rooting);
      }
    }

    // ============= Status transitions =============
    if (prevStatus !== undefined && prevStatus !== m.status) {
      if (isKickoffTransition(prevStatus, m)) {
        emit({ mood: 'flag', message: pick([
          `⚽ 开球! ${myTeam} vs ${oppTeam}, 全场屏息!`,
          `🚨 ${myTeam} vs ${oppTeam} 正式开战!`,
          `🔥 ${myTeam} 出场, 比赛开始!`,
        ]), ttl: 6000 }, m.id);
      } else if (isHalftime(m.status)) {
        emit({ mood: 'sleep', message: pick([
          `☕ 中场 ${myTeam} ${myScore}-${oppScore} ${oppTeam}, 喘口气`,
          `🛋️ 半场休息, ${myScore}-${oppScore}`,
        ]), ttl: 6000 }, m.id);
      } else if (isSecondHalfRestartTransition(prevStatus, m)) {
        emit({ mood: 'flag', message: pick([
          `▶️ 下半场开打! ${myTeam} ${myScore}-${oppScore} ${oppTeam}`,
          `🔄 易边再战!`,
        ]), ttl: 5500 }, m.id);
      } else if (m.state === 'post') {
        emitFullTime(m, myTeam, oppTeam, myScore, oppScore, myPens, oppPens, myWon, false, rooting);
      }
    }

    // ============= Live key events (goals / cards / subs) =============
    if (m.state === 'in') {
      let plays: EspnPlay[] = [];
      try { plays = await fetchEspnPlays(m.id); } catch { continue; }

      const lastSeenId = lastSeenPlayId.get(m.id);
      const fresh = collectNewKeyEvents(plays, lastSeenId);
      if (plays.length > 0) lastSeenPlayId.set(m.id, plays[plays.length - 1].id);

      const toEmit = fresh.slice(-3);   // cap to avoid flood after a long gap
      let delay = 600;
      for (const play of toEmit) {
        const ev = keyEventToGameEvent(play, myTeam, oppTeam, myIsHome, myScore, oppScore, rooting);
        if (ev) { scheduleEmit(ev, m.id, delay); delay += 4500; }
      }

      // Heartbeat: nothing said for >3 min and match in progress → status check
      if (toEmit.length === 0) {
        const idleMs = Date.now() - (lastEventAt.get(m.id) ?? 0);
        if (idleMs > 180_000) {
          const lead = !rooting ? '' : myScore > oppScore ? ' (领先)' : myScore < oppScore ? ' (落后)' : ' (战平)';
          emit({
            mood: 'watch',
            message: pick([
              `📊 ${m.clock || phaseLabel(m)} | ${myTeam} ${myScore}-${oppScore} ${oppTeam}${lead}`,
              `👀 还在踢, ${myTeam} ${myScore}-${oppScore} ${oppTeam}`,
            ]),
            ttl: 5500,
          }, m.id);
        }
      }

      lastGameSnapshot = {
        myTeam, oppTeam, myScore, oppScore,
        date: new Date().toLocaleDateString('zh-CN'),
        highlight: `${myTeam} ${myScore}-${oppScore} ${oppTeam} (${m.clock || phaseLabel(m)})`,
        mood: !rooting ? 'watch' : myScore >= oppScore ? 'cheer' : 'sad',
      };
    }
  }
}

async function announceNoMatch(fav: string[], allMatches: EspnEvent[]) {
  const sentinelKey = 999_000 + new Date().getUTCDate();
  if (lastSeenGameIds.has(sentinelKey)) return;
  lastSeenGameIds.add(sentinelKey);

  const hasFav = fav.length > 0;
  const favName = currentOptions?.favoriteTeams[0] ?? '你的球队';

  // 1. Find the next scheduled/in-progress match for the favorite team (may be future days).
  //    Skipped entirely when no team is picked.
  let nextMatch: EspnEvent | null = null;
  if (hasFav) {
    try {
      nextMatch = await fetchNextMatchForTeam(fav);
    } catch {
      // Non-fatal: fall back to old behavior
    }
  }

  // 2. Other world cup matches happening right now (for ambient context)
  const ongoingOther = allMatches.filter(m => m.state === 'in');

  let message: string;

  if (nextMatch) {
    const myIsHome = fav.some(f => teamMatches(nextMatch!.home, f));
    const myTeamName = myIsHome ? nextMatch.home : nextMatch.away;
    const opponent = myIsHome ? nextMatch.away : nextMatch.home;
    const timeStr = formatMatchTime(nextMatch.utcDate);
    const ctx = nextMatch.roundName ?? nextMatch.groupName ?? '';
    const ctxStr = ctx ? ` · ${ctx}` : '';

    if (nextMatch.state === 'in') {
      // The fav team is actually playing right now on a different day lookup — unlikely but handle it
      message = `👀 ${myTeamName} 正在踢! vs ${opponent}${ctxStr} — 快看!`;
    } else {
      // Upcoming match
      const timeLabel = timeStr ? ` ${timeStr}` : '';
      message = `📅 ${myTeamName} 下一场: vs ${opponent}${timeLabel}${ctxStr}`;
      if (ongoingOther.length > 0) {
        const others = ongoingOther.slice(0, 2).map(m => `${m.home} vs ${m.away}`).join('、');
        message += ` | 世界杯正在打: ${others}`;
      }
    }
  } else if (ongoingOther.length > 0) {
    // No upcoming fav match, but other WC games are live
    const others = ongoingOther.slice(0, 2).map(m => `${m.home} vs ${m.away}`).join('、');
    message = hasFav
      ? `🌙 ${favName} 今天不踢~ 世界杯还在打: ${others}`
      : `📺 世界杯正在打: ${others}`;
  } else {
    message = hasFav
      ? `🌙 ${favName} 今天没比赛~ Buddy 陪你摸鱼`
      : `🌙 今天没有世界杯比赛~ Buddy 陪你摸鱼`;
  }

  emit({ mood: 'idle', message, ttl: 8000 }, String(sentinelKey));
}

// Full-time / after-extra-time / after-penalties summary.
function emitFullTime(
  m: EspnEvent, myTeam: string, oppTeam: string,
  myScore: number, oppScore: number,
  myPens: number | undefined, oppPens: number | undefined,
  myWon: boolean | undefined, firstSighting: boolean,
  rooting: boolean = true,
) {
  const hasPens = myPens !== undefined && oppPens !== undefined;
  // Penalties: ESPN keeps score level, decides via shootout/winner flag.
  const won = hasPens ? (myWon ?? (myPens! > oppPens!)) : myScore > oppScore;
  const draw = !hasPens && myScore === oppScore;
  const pensStr = hasPens ? ` (点球 ${myPens}-${oppPens})` : '';
  const aet = /AET|EXTRA|FINAL_AET|OT/i.test(m.status) || m.period >= 3;
  const phaseTag = hasPens ? '点球大战' : aet ? '加时赛后' : '终场';
  const prefix = firstSighting ? '📰 已结束' : `🏁 ${phaseTag}`;

  let mood: Mood;
  let body: string;
  if (!rooting) {
    // Neutral viewer — name the actual winner, no 我方/对方 emotion.
    const winner = won ? myTeam : oppTeam;
    mood = draw ? 'watch' : 'cheer';
    body = draw
      ? `${myTeam} ${myScore}-${oppScore} ${oppTeam}, 平局`
      : `${myTeam} ${myScore}-${oppScore} ${oppTeam}${pensStr}, ${winner} 胜!`;
  } else if (won) {
    mood = 'dance';
    body = pick([
      `${myTeam} ${myScore}-${oppScore} ${oppTeam}${pensStr}, 赢了! ⚽🎉`,
      `${myTeam} 拿下 ${oppTeam}!${pensStr} 庆祝时刻!`,
    ]);
  } else if (draw) {
    mood = 'watch';
    body = `${myTeam} ${myScore}-${oppScore} ${oppTeam}, 握手言和`;
  } else {
    mood = 'sad';
    body = pick([
      `${myTeam} ${myScore}-${oppScore} ${oppTeam}${pensStr}, 惜败`,
      `${myTeam} 输了${pensStr}, 下一场再来`,
    ]);
  }
  emit({ mood, message: `${prefix}: ${body}`, ttl: 7500 }, m.id);

  lastGameSnapshot = {
    myTeam, oppTeam, myScore, oppScore,
    date: new Date().toLocaleDateString('zh-CN'),
    highlight: !rooting
      ? (draw ? `${myTeam} 战平 ${oppTeam}` : `${won ? myTeam : oppTeam} 胜 ${won ? oppTeam : myTeam}${pensStr}`)
      : won ? `${myTeam} 顶住拿下!${pensStr}`
      : draw ? `${myTeam} 战平 ${oppTeam}`
      : `${myTeam} 惜败 ${oppTeam}${pensStr}`,
    mood: !rooting ? 'watch' : won ? 'cheer' : draw ? 'watch' : 'sad',
  };
}

function isKickoffTransition(prevStatus: string, m: EspnEvent): boolean {
  // Scheduled/pre -> in-progress = kickoff
  return m.state === 'in' && (prevStatus.includes('SCHEDULED') || prevStatus.includes('PRE'));
}
function isHalftime(status: string): boolean {
  return /HALFTIME|HALF_TIME/i.test(status);
}
export function isSecondHalfRestartTransition(
  prevStatus: string,
  m: Pick<EspnEvent, 'state' | 'status' | 'period'>,
): boolean {
  return m.state === 'in' && m.period === 2 && isHalftime(prevStatus) && /SECOND_HALF|IN_PROGRESS/i.test(m.status);
}
function phaseLabel(m: EspnEvent): string {
  if (m.period >= 5) return '点球';
  if (m.period >= 3) return '加时';
  if (m.period === 2) return '下半场';
  if (m.period === 1) return '上半场';
  return m.statusText || '';
}

export function collectNewKeyEvents(plays: EspnPlay[], lastSeenId: string | undefined): EspnPlay[] {
  // Surface soccer beats that feel like live commentary, not every routine touch.
  const meaningful = (p: EspnPlay) =>
    p.scoringPlay || /goal|card|penalty|own goal|shot|attempt|save|blocked|miss|corner|foul|free kick|handball|offside|substitution|delay|injury|tackle|interception|turnover|dispossess/i.test(`${p.typeText} ${p.text}`);
  if (!lastSeenId) return plays.filter(meaningful).slice(-1);
  const idx = plays.findIndex(p => p.id === lastSeenId);
  if (idx < 0) return plays.filter(meaningful).slice(-1);
  return plays.slice(idx + 1).filter(meaningful);
}

export function keyEventToGameEvent(
  play: EspnPlay, myTeam: string, oppTeam: string, myIsHome: boolean,
  liveMy: number, liveOpp: number, rooting: boolean = true,
): GameEvent | null {
  const isMyTeam = play.teamName ? teamMatches(myTeam, play.teamName.toLowerCase()) : false;
  // keyEvents don't always carry per-event score; fall back to live scoreboard score.
  const hasPlayScore = play.homeScore > 0 || play.awayScore > 0;
  const my = hasPlayScore ? (myIsHome ? play.homeScore : play.awayScore) : liveMy;
  const opp = hasPlayScore ? (myIsHome ? play.awayScore : play.homeScore) : liveOpp;
  const scoreStr = `${myTeam} ${my}-${opp} ${oppTeam}`;
  const type = play.typeText.toLowerCase();
  const scorer = parseScorer(play.text);
  const at = play.clock ? `${play.clock} ` : '';

  // Neutral viewer (no favorite team picked): describe events by the team that
  // performed them, with no 我方/对方 emotion. (Issue #1)
  if (!rooting) return neutralKeyEvent(play, myTeam, oppTeam, isMyTeam, scoreStr, type, scorer, at);

  // ---- Goals ----
  if (play.scoringPlay || /goal/.test(type)) {
    const isOwn = /own goal/.test(type);
    const isPen = /penalty/.test(type);
    const isHeader = /header/.test(type);
    if (isMyTeam && !isOwn) {
      const tag = isPen ? '点球破门!' : isHeader ? '头球破门!' : pick(['进球啦!', '球进了!', '世界波!', '破门!']);
      return { mood: 'dance', message: `⚽🔥 ${at}${tag} ${scorer ? scorer + ' | ' : ''}${scoreStr}`, ttl: 7500 };
    }
    if (isMyTeam && isOwn) {
      return { mood: 'sad', message: `😱 ${at}乌龙球... | ${scoreStr}`, ttl: 6500 };
    }
    // opponent scored
    const tag = isOwn ? '对面乌龙(我们赚了)!' : '对面进球';
    return {
      mood: isOwn ? 'cheer' : 'sad',
      message: `${isOwn ? '🎁' : '😣'} ${at}${tag} | ${scoreStr}`,
      ttl: 6500,
    };
  }

  // ---- Cards ----
  if (/red card|second yellow/.test(type)) {
    if (isMyTeam) return { mood: 'sad', message: `🟥 ${at}我方红牌! 少打一人 | ${scoreStr}`, ttl: 6500 };
    return { mood: 'cheer', message: `🟥 ${at}对方红牌! 多打一人 | ${scoreStr}`, ttl: 6500 };
  }
  if (/yellow card/.test(type)) {
    if (isMyTeam) return { mood: 'watch', message: `🟨 ${at}我方吃到黄牌 | ${scoreStr}`, ttl: 5000 };
    return { mood: 'watch', message: `🟨 ${at}对方黄牌 | ${scoreStr}`, ttl: 5000 };
  }

  // ---- Attempts / saves ----
  if (/shot on target|attempt saved|save/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'cheer', message: `🥅 ${at}我方射正! 门将扑出 | ${scoreStr}`, ttl: 5200 };
    return { mood: 'sad', message: `🧤 ${at}对方射正, 门前有点险 | ${scoreStr}`, ttl: 5200 };
  }
  if (/shot blocked|blocked/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'watch', message: `🚧 ${at}我方射门被封堵 | ${scoreStr}`, ttl: 4800 };
    return { mood: 'watch', message: `🛡️ ${at}挡住对方射门 | ${scoreStr}`, ttl: 4800 };
  }
  if (/shot|attempt|miss|off target/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'watch', message: `🎯 ${at}我方起脚打门, 还差一点 | ${scoreStr}`, ttl: 4800 };
    return { mood: 'watch', message: `😮 ${at}对方完成射门 | ${scoreStr}`, ttl: 4800 };
  }

  // ---- Set pieces / stoppages ----
  if (/corner/.test(type)) {
    if (isMyTeam) return { mood: 'watch', message: `🚩 ${at}我方角球机会 | ${scoreStr}`, ttl: 5000 };
    return { mood: 'watch', message: `🚩 ${at}对方角球, 禁区盯紧 | ${scoreStr}`, ttl: 5000 };
  }
  if (/substitution/.test(type)) {
    if (isMyTeam) return { mood: 'watch', message: `🔁 ${at}我方换人调整 | ${scoreStr}`, ttl: 4800 };
    return { mood: 'watch', message: `🔁 ${at}对方换人 | ${scoreStr}`, ttl: 4800 };
  }
  if (/start delay/.test(type)) {
    return { mood: 'sleep', message: `⏸️ ${at}比赛暂停${/drink/i.test(play.text) ? ', 补水时间' : ''} | ${scoreStr}`, ttl: 5000 };
  }
  if (/end delay/.test(type)) {
    return { mood: 'flag', message: `▶️ ${at}比赛恢复 | ${scoreStr}`, ttl: 4500 };
  }

  // ---- Fouls / turnovers ----
  if (/handball/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'sad', message: `✋ ${at}我方手球失误 | ${scoreStr}`, ttl: 5000 };
    return { mood: 'cheer', message: `✋ ${at}对方手球, 我们拿回球权 | ${scoreStr}`, ttl: 5000 };
  }
  if (/offside/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'watch', message: `🚩 ${at}我方越位, 进攻先停 | ${scoreStr}`, ttl: 4500 };
    return { mood: 'cheer', message: `🚩 ${at}对方越位 | ${scoreStr}`, ttl: 4500 };
  }
  if (/foul|free kick/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'sad', message: `💢 ${at}我方犯规, 小心定位球 | ${scoreStr}`, ttl: 4800 };
    return { mood: 'watch', message: `💪 ${at}对方犯规, 我们获得机会 | ${scoreStr}`, ttl: 4800 };
  }
  if (/tackle|interception|turnover|dispossess/.test(`${type} ${play.text.toLowerCase()}`)) {
    if (isMyTeam) return { mood: 'cheer', message: `🦵 ${at}我方完成抢断 | ${scoreStr}`, ttl: 4600 };
    return { mood: 'sad', message: `😬 ${at}我方丢球权, 对方抢断 | ${scoreStr}`, ttl: 4600 };
  }

  return null;
}

// Neutral commentary: the buddy narrates by team name and stays excited about goals
// for either side, instead of taking a 我方/对方 stance. Used when no favorite is picked.
export function neutralKeyEvent(
  play: EspnPlay, myTeam: string, oppTeam: string, isMyTeam: boolean,
  scoreStr: string, type: string, scorer: string | null, at: string,
): GameEvent | null {
  const actor = isMyTeam ? myTeam : oppTeam;   // myTeam==home, oppTeam==away in neutral mode
  const txt = play.text.toLowerCase();
  const tag = `${type} ${txt}`;

  // ---- Goals ----
  if (play.scoringPlay || /goal/.test(type)) {
    if (/own goal/.test(type)) {
      return { mood: 'watch', message: `😲 ${at}乌龙球! (${actor}) | ${scoreStr}`, ttl: 6500 };
    }
    const how = /penalty/.test(type) ? '点球破门' : /header/.test(type) ? '头球破门' : '进球';
    return { mood: 'dance', message: `⚽🔥 ${at}${actor} ${how}! ${scorer ? scorer + ' | ' : ''}${scoreStr}`, ttl: 7500 };
  }

  // ---- Cards ----
  if (/red card|second yellow/.test(type)) {
    return { mood: 'watch', message: `🟥 ${at}${actor} 红牌罚下, 少打一人 | ${scoreStr}`, ttl: 6500 };
  }
  if (/yellow card/.test(type)) {
    return { mood: 'watch', message: `🟨 ${at}${actor} 吃到黄牌 | ${scoreStr}`, ttl: 5000 };
  }

  // ---- Attempts / saves ----
  if (/shot on target|attempt saved|save/.test(tag)) {
    return { mood: 'watch', message: `🥅 ${at}${actor} 射正, 门将扑出 | ${scoreStr}`, ttl: 5200 };
  }
  if (/shot blocked|blocked/.test(tag)) {
    return { mood: 'watch', message: `🚧 ${at}${actor} 射门被封堵 | ${scoreStr}`, ttl: 4800 };
  }
  if (/shot|attempt|miss|off target/.test(tag)) {
    return { mood: 'watch', message: `🎯 ${at}${actor} 起脚打门 | ${scoreStr}`, ttl: 4800 };
  }

  // ---- Set pieces / stoppages ----
  if (/corner/.test(type)) {
    return { mood: 'watch', message: `🚩 ${at}${actor} 角球机会 | ${scoreStr}`, ttl: 5000 };
  }
  if (/substitution/.test(type)) {
    return { mood: 'watch', message: `🔁 ${at}${actor} 换人调整 | ${scoreStr}`, ttl: 4800 };
  }
  if (/start delay/.test(type)) {
    return { mood: 'sleep', message: `⏸️ ${at}比赛暂停${/drink/i.test(play.text) ? ', 补水时间' : ''} | ${scoreStr}`, ttl: 5000 };
  }
  if (/end delay/.test(type)) {
    return { mood: 'flag', message: `▶️ ${at}比赛恢复 | ${scoreStr}`, ttl: 4500 };
  }

  // ---- Fouls / turnovers ----
  if (/handball/.test(tag)) {
    return { mood: 'watch', message: `✋ ${at}${actor} 手球 | ${scoreStr}`, ttl: 5000 };
  }
  if (/offside/.test(tag)) {
    return { mood: 'watch', message: `🚩 ${at}${actor} 越位 | ${scoreStr}`, ttl: 4500 };
  }
  if (/foul|free kick/.test(tag)) {
    return { mood: 'watch', message: `💢 ${at}${actor} 犯规 | ${scoreStr}`, ttl: 4800 };
  }
  if (/tackle|interception|turnover|dispossess/.test(tag)) {
    return { mood: 'watch', message: `🦵 ${at}${actor} 完成抢断 | ${scoreStr}`, ttl: 4600 };
  }

  return null;
}

// "Goal! Brighton 0, Manchester United 1. Patrick Dorgu (..." -> "Patrick Dorgu"
function parseScorer(text: string): string | null {
  const m = text.match(/\.\s+([A-ZÀ-Ž][\p{L}'.\-]+(?:\s+[A-ZÀ-Ž][\p{L}'.\-]+){0,3})\s*\(/u);
  return m ? m[1] : null;
}

/** Parse ESPN scoreboard JSON response into typed EspnEvent[]. Shared by current-day and future-date queries. */
export function parseEspnScoreboardJson(json: any): EspnEvent[] {
  const out: EspnEvent[] = [];
  for (const ev of (json?.events ?? [])) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const cs = comp?.competitors ?? [];
    if (cs.length < 2) continue;
    const home = cs.find((c: any) => c.homeAway === 'home') ?? cs[0];
    const away = cs.find((c: any) => c.homeAway === 'away') ?? cs[1];
    const st = ev?.status?.type ?? {};

    // Group / round context from the notes headline or season type name
    let groupName: string | undefined;
    let roundName: string | undefined;
    const headline = comp?.notes?.[0]?.headline ?? ev?.season?.type?.name ?? '';
    const gm = String(headline).match(/group\s+[a-l]/i);
    if (gm) groupName = gm[0];
    else if (headline) roundName = String(headline);

    const shoot = (c: any) => (c?.shootoutScore !== undefined && c?.shootoutScore !== null)
      ? Number(c.shootoutScore) : undefined;
    const homeStats = extractCompetitorStats(home);
    const awayStats = extractCompetitorStats(away);

    out.push({
      id: String(ev.id),
      home: home?.team?.displayName ?? '?',
      away: away?.team?.displayName ?? '?',
      homeAbbr: home?.team?.abbreviation ?? '?',
      awayAbbr: away?.team?.abbreviation ?? '?',
      homeLogo: home?.team?.logo ?? '',
      awayLogo: away?.team?.logo ?? '',
      homeId: String(home?.team?.id ?? ''),
      awayId: String(away?.team?.id ?? ''),
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
      homeShootout: shoot(home),
      awayShootout: shoot(away),
      homeWinner: home?.winner === true,
      awayWinner: away?.winner === true,
      status: st?.name ?? 'STATUS_SCHEDULED',
      state: (st?.state ?? 'pre') as 'pre' | 'in' | 'post',
      completed: !!st?.completed,
      statusText: st?.detail ?? st?.description ?? '',
      period: Number(ev?.status?.period ?? 0),
      clock: ev?.status?.displayClock ?? '',
      utcDate: ev?.date ?? '',
      groupName,
      roundName,
      venue: comp?.venue?.fullName,
      homeStats,
      awayStats,
    });
  }
  return out;
}

async function fetchEspnScoreboard(): Promise<EspnEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${WC_LEAGUE}/scoreboard`;
  const json = await httpGetJson(url);
  return parseEspnScoreboardJson(json);
}

/**
 * Pick the single World Cup match to auto-follow when no favorite team is playing,
 * so the buddy always shows live match info (Issue #1). Priority:
 *   1. A match in progress right now.
 *   2. The next upcoming match once it's within 30 min of kickoff — the "switch to the
 *      next match half an hour before it starts" behavior.
 *   3. Otherwise the most recently finished match today, so a result lingers on screen
 *      until the next match is imminent.
 * Returns null only when there are no matches at all on the board.
 */
export function pickAutoFollowMatch(matches: EspnEvent[], now: number = Date.now()): EspnEvent | null {
  if (!matches.length) return null;
  const byKickoffAsc = (a: EspnEvent, b: EspnEvent) =>
    new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime();

  const live = matches.filter(m => m.state === 'in').sort(byKickoffAsc);
  if (live.length) return live[0];

  const upcoming = matches.filter(m => m.state === 'pre').sort(byKickoffAsc);
  const finished = matches.filter(m => m.state === 'post').sort(byKickoffAsc);
  const lastFinished = finished.length ? finished[finished.length - 1] : null;
  const nextUp = upcoming[0] ?? null;

  if (nextUp) {
    const msUntil = new Date(nextUp.utcDate).getTime() - now;
    if (msUntil <= 30 * 60_000) return nextUp;   // imminent → switch to its countdown
    return lastFinished ?? nextUp;               // else linger on the last result
  }
  return lastFinished;
}

// ---- Next match lookup (for "no game today" announcement) ----

type NextMatchCache = { key: string; event: EspnEvent | null; fetchedAt: number };
let nextMatchCache: NextMatchCache | null = null;
const NEXT_MATCH_CACHE_MS = 30 * 60_000; // 30-minute TTL — avoids hammering API on every tick

/**
 * Find the next upcoming/in-progress match for any of the given favorite teams,
 * searching today + 7 future days. Results are cached for 30 minutes.
 */
async function fetchNextMatchForTeam(fav: string[]): Promise<EspnEvent | null> {
  const cacheKey = [...fav].sort().join(',');
  if (
    nextMatchCache &&
    nextMatchCache.key === cacheKey &&
    Date.now() - nextMatchCache.fetchedAt < NEXT_MATCH_CACHE_MS
  ) {
    return nextMatchCache.event;
  }

  const now = new Date();
  for (let d = 0; d <= 7; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + d);
    const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${WC_LEAGUE}/scoreboard?dates=${yyyymmdd}`;
      const json = await httpGetJson(url);
      const events = parseEspnScoreboardJson(json);
      // Take the first scheduled/in-progress match for any fav team
      const found = events.find(m =>
        (m.state === 'pre' || m.state === 'in') &&
        fav.some(f => teamMatches(m.home, f) || teamMatches(m.away, f))
      );
      if (found) {
        nextMatchCache = { key: cacheKey, event: found, fetchedAt: Date.now() };
        return found;
      }
    } catch {
      // Silently skip — network error on one day shouldn't block the rest
    }
  }

  nextMatchCache = { key: cacheKey, event: null, fetchedAt: Date.now() };
  return null;
}

/** Format a UTC ISO date string into a human-readable local time string (Chinese locale). */
function formatMatchTime(utcDate: string): string {
  if (!utcDate) return '';
  try {
    const d = new Date(utcDate);
    const now = new Date();
    const todayStr = now.toLocaleDateString('zh-CN');
    const matchStr = d.toLocaleDateString('zh-CN');
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (todayStr === matchStr) return `今天 ${timeStr}`;
    // Check tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.toLocaleDateString('zh-CN') === matchStr) return `明天 ${timeStr}`;
    return `${matchStr} ${timeStr}`;
  } catch {
    return '';
  }
}

async function fetchEspnPlays(eventId: string): Promise<EspnPlay[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${WC_LEAGUE}/summary?event=${eventId}`;
  const json = await httpGetJson(url);
  return extractEspnPlaysFromSummary(json);
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(String(value).replace('%', ''));
  return Number.isFinite(n) ? n : undefined;
}

function statValue(stats: any[], name: string): number | undefined {
  const stat = stats.find(s => s?.name === name);
  return numberValue(stat?.value ?? stat?.displayValue);
}

function extractCompetitorStats(competitor: any): SoccerStats {
  const stats = competitor?.statistics ?? [];
  return {
    possessionPct: statValue(stats, 'possessionPct'),
    totalShots: statValue(stats, 'totalShots'),
    shotsOnTarget: statValue(stats, 'shotsOnTarget'),
    corners: statValue(stats, 'wonCorners'),
    fouls: statValue(stats, 'foulsCommitted'),
  };
}

export function appendPossessionPoint(prev: number[], pct: number | undefined, maxPoints = 24): number[] {
  if (pct === undefined || !Number.isFinite(pct)) return [...prev].slice(-maxPoints);
  const clamped = Math.max(0, Math.min(100, pct)) / 100;
  const point = Number(clamped.toFixed(3));
  return [...prev, point].slice(-maxPoints);
}

function playFromRaw(raw: any, fallbackSort = 0): EspnPlay | null {
  const play = raw?.play ?? raw;
  const text = raw?.text ?? play?.text ?? '';
  const typeText = play?.type?.text ?? raw?.type?.text ?? inferPlayType(text);
  const clock = play?.clock?.displayValue ?? raw?.clock?.displayValue ?? raw?.time?.displayValue ?? '';
  const sortKey = Number(play?.clock?.value ?? raw?.clock?.value ?? raw?.time?.value ?? parseClockSort(clock) ?? raw?.sequence ?? fallbackSort);
  const id = String(play?.id ?? raw?.id ?? raw?.sequence ?? `${clock}-${typeText}-${text.slice(0, 48)}`);
  if (!id || (!typeText && !text)) return null;
  return {
    id,
    text,
    typeText,
    scoringPlay: !!(play?.scoringPlay ?? raw?.scoringPlay) || /goal/i.test(typeText),
    teamName: play?.team?.displayName ?? raw?.team?.displayName,
    clock,
    homeScore: Number(play?.homeScore ?? raw?.homeScore ?? 0),
    awayScore: Number(play?.awayScore ?? raw?.awayScore ?? 0),
    sortKey: Number.isFinite(sortKey) ? sortKey : fallbackSort,
  };
}

function parseClockSort(clock: string): number | undefined {
  const m = clock.match(/^(\d+)(?:'\+(\d+))?/);
  if (!m) return undefined;
  return (Number(m[1]) * 60) + Number(m[2] ?? 0);
}

function inferPlayType(text: string): string {
  if (/goal/i.test(text)) return 'Goal';
  if (/attempt saved/i.test(text)) return 'Shot On Target';
  if (/attempt blocked/i.test(text)) return 'Shot Blocked';
  if (/attempt missed|misses/i.test(text)) return 'Shot Off Target';
  if (/corner/i.test(text)) return 'Corner Awarded';
  if (/handball/i.test(text)) return 'Handball';
  if (/offside/i.test(text)) return 'Offside';
  if (/foul|free kick/i.test(text)) return 'Foul';
  if (/substitution/i.test(text)) return 'Substitution';
  return '';
}

export function extractEspnPlaysFromSummary(json: any): EspnPlay[] {
  const byId = new Map<string, EspnPlay>();
  const add = (raw: any, fallbackSort: number) => {
    const play = playFromRaw(raw, fallbackSort);
    if (!play) return;
    const prev = byId.get(play.id);
    if (!prev || (!prev.text && play.text) || play.sortKey! >= (prev.sortKey ?? 0)) {
      byId.set(play.id, play);
    }
  };

  (json?.commentary ?? []).forEach((p: any, i: number) => add(p, i));
  (json?.keyEvents ?? []).forEach((p: any, i: number) => add(p, 10_000 + i));

  return [...byId.values()].sort((a, b) => {
    const byTime = (a.sortKey ?? 0) - (b.sortKey ?? 0);
    if (byTime !== 0) return byTime;
    return String(a.id).localeCompare(String(b.id));
  });
}

function teamMatches(teamA: string, queryLower: string): boolean {
  const a = teamA.toLowerCase().trim();
  const q = queryLower.trim();
  if (!a || !q) return false;
  if (a === q) return true;
  if (a.includes(q) || q.includes(a)) return true;
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const group = [canonical, ...aliases];
    const aHit = group.some(g => a.includes(g) || g.includes(a));
    const qHit = group.some(g => q.includes(g) || g.includes(q));
    if (aHit && qHit) return true;
  }
  return false;
}

async function httpGetJson(url: string): Promise<any> {
  // Use Electron's net.fetch() — goes through Chromium's network stack,
  // respects session proxy settings configured via session.setProxy().
  // This ensures proxy configuration applies to ALL requests uniformly.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await net.fetch(url, {
      headers: { 'User-Agent': 'WorldCupBuddy/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
