import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, dialog, globalShortcut } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { startPoller, stopPoller, setFavoriteTeams, getKnownTeams, getLastGameSnapshot, forceTick, fetchInfoBite, getLastRealEventAt, getCurrentScore, type GameEvent, type ScoreState } from './poller';
import { listPacks, ensureCharactersDir, charactersDir, packById, seedBuiltinPacks, DEFAULT_PACK_ID } from './characters';

// Make the process easier to find in Activity Monitor / pkill
process.title = '世界杯 Buddy';

// Suppress EPIPE on stdio when launched without a terminal (Finder/launchd).
// Without this, any console.* call after the pipe closes throws and crashes the app.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err && err.code === 'EPIPE') return;
  });
}
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err && err.code === 'EPIPE') return;
  // Don't bring up Electron's error dialog for non-fatal stuff
  try { console.error('[uncaught]', err); } catch {}
});

// Tray icon, embedded so it never depends on disk paths inside an asar bundle.
const TRAY_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAABo0lEQVR4nNXZwXXDIAwA0Fw4doEefezNh67hDTxBJ8oG2YB1ukMGUPGL36vAAiQsEaP3dEn8nB8iiwC3m1IAgAs5h1xCrnsu+2tO63NOxY7ywI/t2rU3cgr5ECBzsd1jsoS6IvTnu5xluG7JwOunlyNleJ1SCTe6q0Hr8PtZrDeBluH+2lgN9KEMrLE0mlcekD5gvbA0uvwgwqt1vQ9Lo/MtD3CfLd3w+UunDfqRw06s0aWAFug4jjMia3RrKDv0cZSro8vFaKJR5DvDWUjhuq/PjyiF6BWDPQvMHRkbsOeXwzXAcOy9GrWpXRIx2m3guRe4Of9j3sALC8zBWGBj8MLrEBTKeuKgwascnAJrWI3pOwHzS0KSuS/VAk9KgvfQtWIl79XBM7+ttYBb38+DHX/i0MJKr0Mhm5rfD46mZnmn6A+Ol0tqZaEJpspBvDzSQMtHl/wDz1siScBn2loc9KahySi3Thyl0UVg/WV+ywwXR3lnE0baSEHocbaqEHqczcDuaA0sQo+zoY3Q4xwZIPQ4hzIJfIxjrwz++geLuYBOR7d/OzOLeNrHweMAAAAASUVORK5CYII=';

const isDev = process.env.NODE_ENV === 'development';
const SHRIMP_W = 240;
const SHRIMP_H = 280;
const BUBBLE_W = 320;
const BUBBLE_H = 140;

let shrimpWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const userDataPath = () => app.getPath('userData');
const configPath = () => path.join(userDataPath(), 'config.json');
const usagePath = () => path.join(userDataPath(), 'usage.json');

// =====================================================================
// Usage tracking (this session + today total)
// =====================================================================
const SESSION_START = Date.now();
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
function loadUsage(): Record<string, number> {
  try { return JSON.parse(fs.readFileSync(usagePath(), 'utf-8')); }
  catch { return {}; }
}
function saveUsage(u: Record<string, number>) {
  fs.mkdirSync(userDataPath(), { recursive: true });
  fs.writeFileSync(usagePath(), JSON.stringify(u, null, 2));
}
function getSessionMs(): number { return Date.now() - SESSION_START; }
function getTodayMs(): number {
  return (loadUsage()[todayKey()] ?? 0) + getSessionMs();
}
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

type Config = {
  favoriteTeams: string[];
  mode: 'live' | 'replay';
  positionX?: number;
  positionY?: number;
  characterPack?: string;
  quietMode?: boolean;       // suppress live-game bubbles (chip still updates)
  soundEnabled?: boolean;    // play 8-bit tones on score/end
  showWinProb?: boolean;     // render sparkline under chip
};

function loadConfig(): Config {
  let cfg: Config;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
  } catch {
    cfg = {
      favoriteTeams: ['Argentina', 'Brazil'],
      mode: 'live',
      characterPack: DEFAULT_PACK_ID,
      quietMode: false,
      soundEnabled: false,
      showWinProb: true,
    };
  }
  // Backfill defaults for older configs
  if (cfg.quietMode === undefined) cfg.quietMode = false;
  if (cfg.soundEnabled === undefined) cfg.soundEnabled = false;
  if (cfg.showWinProb === undefined) cfg.showWinProb = true;
  // Sanitize: drop teams that no longer exist in current sport list
  const known = new Set(getKnownTeams().map(t => t.toLowerCase()));
  const filtered = (cfg.favoriteTeams ?? []).filter(t =>
    [...known].some(k => t.toLowerCase().includes(k) || k.includes(t.toLowerCase()))
  );
  if (filtered.length === 0) {
    cfg.favoriteTeams = ['Argentina', 'Brazil'];
  } else {
    cfg.favoriteTeams = filtered;
  }
  return cfg;
}

function saveConfig(cfg: Config) {
  fs.mkdirSync(userDataPath(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function loadUrl(win: BrowserWindow, route: string) {
  if (isDev) {
    win.loadURL(`http://localhost:5173/#${route}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: route });
  }
}

function createShrimpWindow() {
  const cfg = loadConfig();
  const { workArea } = screen.getPrimaryDisplay();
  const x = cfg.positionX ?? workArea.x + workArea.width - SHRIMP_W - 40;
  const y = cfg.positionY ?? workArea.y + workArea.height - SHRIMP_H - 80;

  shrimpWindow = new BrowserWindow({
    width: SHRIMP_W,
    height: SHRIMP_H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    focusable: false, // never steal focus from whatever the user is typing in
    acceptFirstMouse: true, // but still receive clicks immediately
    type: process.platform === 'darwin' ? 'panel' : undefined, // NSPanel on Mac = floats without activating
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shrimpWindow.setAlwaysOnTop(true, 'screen-saver');
  shrimpWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadUrl(shrimpWindow, '/shrimp');
  shrimpWindow.once('ready-to-show', () => shrimpWindow?.showInactive());

  shrimpWindow.on('moved', () => {
    if (!shrimpWindow) return;
    const [px, py] = shrimpWindow.getPosition();
    const cur = loadConfig();
    saveConfig({ ...cur, positionX: px, positionY: py });
  });

  shrimpWindow.on('closed', () => {
    shrimpWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 680,
    title: '世界杯 Buddy · 设置',
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadUrl(settingsWindow, '/settings');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function showBubble(message: string, mood: string, ttl = 5000) {
  if (!shrimpWindow) return;
  const [sx, sy] = shrimpWindow.getPosition();
  const bubble = new BrowserWindow({
    width: BUBBLE_W,
    height: BUBBLE_H,
    x: sx - BUBBLE_W + 40,
    y: sy - BUBBLE_H + 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  bubble.setAlwaysOnTop(true, 'screen-saver');
  bubble.setIgnoreMouseEvents(true); // click-through; never block what's underneath

  const encoded = encodeURIComponent(JSON.stringify({ message, mood }));
  if (isDev) {
    bubble.loadURL(`http://localhost:5173/#/bubble?data=${encoded}`);
  } else {
    bubble.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `/bubble?data=${encoded}` });
  }
  bubble.once('ready-to-show', () => bubble.showInactive());

  setTimeout(() => {
    if (!bubble.isDestroyed()) bubble.close();
  }, ttl);
}

function setupAutoUpdater() {
  if (isDev) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    showBubble(`🎉 发现新版 v${info.version},悄悄下载中...`, 'flag', 5000);
  });
  autoUpdater.on('update-downloaded', (info) => {
    showBubble(`✨ v${info.version} 下载好啦,下次启动自动升级`, 'cheer', 6500);
  });
  autoUpdater.on('error', () => { /* swallow — network blips shouldn't bug user */ });
  // First check after 30s (give the user some breathing room post-launch)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 30_000);
  // Then every 4 hours
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600_000);
}

async function manualCheckForUpdates() {
  if (isDev) {
    dialog.showMessageBox({ message: 'Dev 模式下不检查更新', type: 'info' });
    return;
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    if (!r || !r.updateInfo) {
      showBubble('✓ 已经是最新版', 'idle', 4000);
      return;
    }
    const cur = app.getVersion();
    if (r.updateInfo.version === cur) {
      showBubble(`✓ 已经是最新版 v${cur}`, 'idle', 4000);
    }
    // else update-available handler will fire its own bubble
  } catch {
    showBubble('⚠️ 检查更新失败,网络可能不太好', 'sad', 4500);
  }
}

function buildTray() {
  // Always load from embedded base64 — disk fallback was unreliable inside asar.
  const img = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_B64, 'base64'));
  // macOS menu bar items are 22pt high; @2x retina = 44px. The PNG is 44x44.
  const trayImage = img.resize({ width: 22, height: 22 });
  tray = new Tray(trayImage);
  tray.setTitle(' 🦐');  // adds visible text next to icon in menu bar
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const cfg = loadConfig();
  const menu = Menu.buildFromTemplate([
    { label: `🦐 世界杯 Buddy  ·  ${cfg.mode === 'replay' ? 'Replay 模式' : 'Live 模式'}`, enabled: false },
    { type: 'separator' },
    { label: '🙈 显示/隐藏虾仔（⌘⇧X）', click: () => toggleShrimp() },
    { label: '⚙️ 设置', click: () => createSettingsWindow() },
    { label: '📸 保存今日战报卡片', click: () => saveDailyCard().catch(() => {}) },
    { label: '🔁 戳一下虾仔', click: () => triggerDemoEvent() },
    { label: '🔄 检查更新', click: () => manualCheckForUpdates() },
    { type: 'separator' },
    { label: '🦐💔 含泪告别（退出）', click: () => app.quit() },
  ]);
  tray.setToolTip('世界杯 Buddy（双击虾仔即可退出）');
  tray.setContextMenu(menu);
}

const HOTKEY = 'CommandOrControl+Shift+X';

function toggleShrimp() {
  if (!shrimpWindow) {
    createShrimpWindow();
    if (process.platform === 'darwin') app.dock?.hide();
    return;
  }
  if (shrimpWindow.isVisible()) {
    shrimpWindow.hide();
    // Surface Dock icon as a visible "call me back" handle (tray hides on notched Macs)
    if (process.platform === 'darwin') app.dock?.show().catch(() => {});
  } else {
    shrimpWindow.showInactive();
    if (process.platform === 'darwin') app.dock?.hide();
  }
}

function hideShrimpWithTip() {
  if (!shrimpWindow || !shrimpWindow.isVisible()) return;
  showBubble('🙈 虾仔藏好啦！⌘⇧X 召回 / 或点 Dock 上的虾仔', 'sleep', 4500);
  setTimeout(() => {
    if (shrimpWindow?.isVisible()) {
      shrimpWindow.hide();
      if (process.platform === 'darwin') app.dock?.show().catch(() => {});
    }
  }, 1500);
}

// Companion chitchat — never fakes a game result. Pure emotional value + small talk.
// Each line pairs a mood with a tone-matching message.
const CHITCHAT: { mood: string; message: string }[] = [
  // idle — chill 摸鱼
  { mood: 'idle', message: '🦐 摸鱼是基本权利,别太卷' },
  { mood: 'idle', message: '🦐 虾仔在角落安静地陪你' },
  { mood: 'idle', message: '🍃 偶尔走神也没关系' },
  { mood: 'idle', message: '☕ 喝口水再继续吧' },
  { mood: 'idle', message: '🪟 看看窗外,世界很大' },
  { mood: 'idle', message: '🦐 戳虾仔会变快乐(也许)' },

  // watch — 关心你的状态
  { mood: 'watch', message: '👀 虾仔在偷偷盯着你工作哦' },
  { mood: 'watch', message: '🔍 写代码呢? 虾仔虽然看不懂但很佩服' },
  { mood: 'watch', message: '📖 虾仔陪读模式 on' },
  { mood: 'watch', message: '⌨️ 噼里啪啦,键盘的声音真好听' },
  { mood: 'watch', message: '🧠 这道题难住你了? 站起来走两步' },

  // cheer — 给你打气
  { mood: 'cheer', message: '💪 你今天已经很棒了!' },
  { mood: 'cheer', message: '🌟 又解决一个 bug? 虾仔为你欢呼!' },
  { mood: 'cheer', message: '🎉 一个小进展也值得开心~' },
  { mood: 'cheer', message: '💯 工作做得不错,虾仔点赞' },
  { mood: 'cheer', message: '🥳 加油! 虾仔在身后撑你' },
  { mood: 'cheer', message: '✨ 你比昨天的自己更厉害一点点' },

  // sad — 共情陪伴
  { mood: 'sad', message: '🥺 累了就歇会儿,没关系的' },
  { mood: 'sad', message: '🫂 虾仔抱抱你' },
  { mood: 'sad', message: '🌧️ 不开心的时候,深呼吸一下' },
  { mood: 'sad', message: '🦐 烦躁就戳戳虾仔出气也行' },

  // flag — 期待 / 仪式感
  { mood: 'flag', message: '🚩 周末快来吧! 虾仔想躺平' },
  { mood: 'flag', message: '🎯 今天的目标: 把工作做到自己满意' },
  { mood: 'flag', message: '⚽ 等会儿要不要看球休息一下?' },
  { mood: 'flag', message: '📅 今天也是值得纪念的一天' },

  // sleep — 关心健康
  { mood: 'sleep', message: '💤 虾仔有点困了... 你也困吧?' },
  { mood: 'sleep', message: '🛌 别熬夜了,睡觉是正经事' },
  { mood: 'sleep', message: '😴 再坚持下,马上下班' },
  { mood: 'sleep', message: '🌙 困了就趴一会儿,不丢人' },

  // dance — 俏皮
  { mood: 'dance', message: '🎵 摸鱼专属 BGM 已开启' },
  { mood: 'dance', message: '💃 虾仔在偷偷跳舞,别看!' },
  { mood: 'dance', message: '🎉 庆祝今天还活着,先蹦个迪' },
  { mood: 'dance', message: '🦐 我跳的不是舞,是寂寞' },
  { mood: 'dance', message: '🌈 心情不好就摇起来,虾仔陪你' },
];

function triggerDemoEvent() {
  const pick = CHITCHAT[Math.floor(Math.random() * CHITCHAT.length)];
  emitToShrimp({ kind: 'mood', mood: pick.mood as any });
  showBubble(pick.message, pick.mood);
}

function emitToShrimp(payload: any) {
  if (shrimpWindow && !shrimpWindow.isDestroyed()) {
    shrimpWindow.webContents.send('shrimp-event', payload);
  }
}

function onGameEvent(ev: GameEvent) {
  const cfg = loadConfig();
  // Mood emit always (drives shrimp posture + chip animations + optional sound)
  emitToShrimp({ kind: 'mood', mood: ev.mood, playSound: !!cfg.soundEnabled });
  // Bubble respects quiet mode
  if (!cfg.quietMode) {
    showBubble(ev.message, ev.mood, ev.ttl ?? 6000);
  }
}

async function saveDailyCard(): Promise<string | null> {
  // Prefer the live scoreboard snapshot (has logos, live score, status), fall back to last-event snapshot.
  const live = getCurrentScore();
  const snap = getLastGameSnapshot();
  const cfg = loadConfig();
  const my = cfg.favoriteTeams?.[0] ?? 'Argentina';

  type CardPayload = {
    myTeam: string; oppTeam: string;
    myTeamLogo?: string; oppTeamLogo?: string;
    myScore: number; oppScore: number;
    date: string; highlight: string;
    mood: 'cheer' | 'sad' | 'watch';
    status?: string; statusState?: 'pre' | 'in' | 'post'; isPenalties?: boolean;
    period?: number; clock?: string;
    todayMs: number; sessionMs: number;
  };

  let payload: CardPayload;
  if (live) {
    // Penalty shootout keeps the score level; myWinner decides it.
    const won = live.isPenalties ? !!live.myWinner : live.myScore > live.oppScore;
    const draw = !live.isPenalties && live.myScore === live.oppScore;
    const tag = live.statusState === 'post' ? (live.isPenalties ? '点球大战' : '终场') :
                live.statusState === 'in' ? (live.clock || (live.period >= 3 ? '加时' : live.period === 2 ? '下半场' : '上半场')) :
                live.statusState === 'pre' ? '未开赛' : '';
    payload = {
      myTeam: live.myTeam, oppTeam: live.oppTeam,
      myTeamLogo: live.myTeamLogo, oppTeamLogo: live.oppTeamLogo,
      myScore: live.myScore, oppScore: live.oppScore,
      date: new Date().toLocaleDateString('zh-CN'),
      highlight: snap?.highlight ??
        (tag ? `${tag}・${live.myTeam} ${live.myScore}-${live.oppScore} ${live.oppTeam}` :
               `${live.myTeam} vs ${live.oppTeam}`),
      mood: won ? 'cheer' : draw ? 'watch' : 'sad',
      status: live.status, statusState: live.statusState, isPenalties: live.isPenalties,
      period: live.period, clock: live.clock,
      todayMs: getTodayMs(), sessionMs: getSessionMs(),
    };
  } else if (snap) {
    payload = {
      ...snap,
      todayMs: getTodayMs(),
      sessionMs: getSessionMs(),
    };
  } else {
    payload = {
      myTeam: my, oppTeam: '—',
      myScore: 0, oppScore: 0,
      date: new Date().toLocaleDateString('zh-CN'),
      highlight: '今天还没开赛,虾仔先打个盹~',
      mood: 'watch',
      todayMs: getTodayMs(), sessionMs: getSessionMs(),
    };
  }
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const cardWin = new BrowserWindow({
    width: 400,
    height: 680,
    show: false,
    transparent: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
    },
  });

  if (isDev) {
    await cardWin.loadURL(`http://localhost:5173/#/card?data=${encoded}`);
  } else {
    await cardWin.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `/card?data=${encoded}` });
  }
  // Wait longer when we have remote logo URLs so the images finish loading
  const waitMs = (payload.myTeamLogo || payload.oppTeamLogo) ? 1800 : 600;
  await new Promise(resolve => setTimeout(resolve, waitMs));
  const image = await cardWin.webContents.capturePage();
  const png = image.toPNG();
  const filename = `世界杯Buddy-战报-${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}.png`;
  const filepath = path.join(app.getPath('downloads'), filename);
  fs.writeFileSync(filepath, png);
  cardWin.close();
  shell.showItemInFolder(filepath);
  showBubble(`✨ 战报已存到下载文件夹啦：${filename}`, 'cheer', 6000);
  return filepath;
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  ensureCharactersDir();
  seedBuiltinPacks();   // copy bundled 🇧🇷 pack + 48 flag avatars on first run
  const cfg = loadConfig();

  createShrimpWindow();
  buildTray();
  setupAutoUpdater();

  // Global hotkey: summon / hide the shrimp from anywhere (fallback when tray is invisible)
  const registered = globalShortcut.register(HOTKEY, () => toggleShrimp());
  if (!registered) {
    // hotkey conflict — bubble will still mention it but at least nothing crashes
  }

  // Welcome bubble so the user has a visible confirmation it launched
  setTimeout(() => {
    showBubble('🦐 虾仔上岗啦！按 ⌘⇧X 可以随时召回我', 'flag', 6000);
  }, 1200);

  startPoller({
    favoriteTeams: cfg.favoriteTeams,
    mode: cfg.mode,
    onEvent: onGameEvent,
    onScore: (s) => emitToShrimp({ kind: 'score', score: s, showWinProb: !!loadConfig().showWinProb }),
    onWinProb: (points) => emitToShrimp({ kind: 'winprob', points }),
  });

  // IPC: renderer asks for config / known teams / updates
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:set', (_e, next: Config) => {
    const prev = loadConfig();
    saveConfig(next);
    setFavoriteTeams(next.favoriteTeams);
    rebuildTrayMenu();
    if (prev.characterPack !== next.characterPack) {
      const pack = packById(next.characterPack ?? DEFAULT_PACK_ID);
      emitToShrimp({ kind: 'pack', pack });
    }
    return next;
  });
  ipcMain.handle('teams:list', async () => getKnownTeams());
  ipcMain.handle('shrimp:drag', (_e, dx: number, dy: number) => {
    if (!shrimpWindow) return;
    const [x, y] = shrimpWindow.getPosition();
    shrimpWindow.setPosition(x + dx, y + dy);
  });
  ipcMain.handle('shrimp:click', async () => {
    triggerDemoEvent();   // instant chitchat so click feels responsive
    const clickAt = Date.now();
    forceTick();          // refresh ESPN; new scoring/status events fire via onGameEvent

    // Wait briefly so a real event from forceTick (if any) takes priority.
    // If nothing real surfaced, pull an info bite (leaders/venue/news/win prob).
    setTimeout(async () => {
      if (getLastRealEventAt() > clickAt) return; // a real event already showed up
      const bite = await fetchInfoBite();
      if (bite) showBubble(bite.message, bite.mood, bite.ttl ?? 6000);
    }, 2800);
  });
  ipcMain.handle('demo:trigger', () => triggerDemoEvent());
  ipcMain.handle('settings:open', () => createSettingsWindow());
  ipcMain.handle('card:save', () => saveDailyCard());
  ipcMain.handle('shrimp:contextMenu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '🦐 世界杯 Buddy', enabled: false },
      { type: 'separator' },
      { label: '⚙️ 设置', click: () => createSettingsWindow() },
      { label: '📸 保存今日战报卡片', click: () => saveDailyCard().catch(() => {}) },
      { label: '🔁 戳一下虾仔', click: () => triggerDemoEvent() },
      { label: '🙈 藏起来一会儿（⌘⇧X 召回）', click: () => hideShrimpWithTip() },
      { type: 'separator' },
      { label: '🦐💔 含泪告别（退出）', click: () => app.quit() },
    ]);
    if (shrimpWindow) menu.popup({ window: shrimpWindow });
  });
  ipcMain.handle('shrimp:farewell', async () => {
    const sessionStr = formatDuration(getSessionMs());
    const todayStr = formatDuration(getTodayMs());
    const parent = shrimpWindow ?? settingsWindow ?? undefined;
    const opts: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['🦐💔 含泪告别', '不行，再陪我一会'],
      defaultId: 1,
      cancelId: 1,
      title: '世界杯 Buddy',
      message: '虾仔: 你今天对我可真好 🥺',
      detail: `本次陪伴：${sessionStr}\n今日累计：${todayStr}\n\n真的要退出吗？`,
    };
    const result = parent
      ? await dialog.showMessageBox(parent, opts)
      : await dialog.showMessageBox(opts);
    if (result.response === 0) app.quit();
  });

  // Character pack APIs
  ipcMain.handle('characters:list', () => listPacks());
  ipcMain.handle('characters:openFolder', () => {
    ensureCharactersDir();
    shell.openPath(charactersDir());
  });
  ipcMain.handle('characters:get', (_e, id: string) => packById(id) ?? packById(DEFAULT_PACK_ID));
  ipcMain.handle('characters:importFlags', async () => {
    ensureCharactersDir();
    const win = settingsWindow ?? undefined;
    const res = await dialog.showOpenDialog(win as any, {
      title: '选择国旗 PNG 所在文件夹',
      properties: ['openDirectory'],
      buttonLabel: '导入',
    });
    if (res.canceled || !res.filePaths[0]) return { imported: 0 };
    const src = res.filePaths[0];
    const dest = charactersDir();
    let count = 0;
    let entries: string[] = [];
    try { entries = fs.readdirSync(src); } catch { return { imported: 0 }; }
    for (const f of entries) {
      if (!/\.png$/i.test(f)) continue;
      // "01_argentina.png" -> "argentina"; "Brazil.png" -> "brazil"
      const slug = f.replace(/\.png$/i, '').replace(/^\d+_?/, '').toLowerCase();
      const display = slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const packDir = path.join(dest, slug);
      try {
        fs.mkdirSync(packDir, { recursive: true });
        fs.copyFileSync(path.join(src, f), path.join(packDir, 'idle.png'));
        fs.writeFileSync(
          path.join(packDir, 'pack.json'),
          JSON.stringify({ name: display, author: 'World Cup Flags' }, null, 2),
        );
        count++;
      } catch {}
    }
    return { imported: count };
  });
});

app.on('window-all-closed', (e: Electron.Event) => {
  e.preventDefault();
});

// macOS: clicking the Dock icon while hidden = bring shrimp back
app.on('activate', () => {
  if (!shrimpWindow) {
    createShrimpWindow();
  } else if (!shrimpWindow.isVisible()) {
    shrimpWindow.showInactive();
  }
  if (process.platform === 'darwin') app.dock?.hide();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  stopPoller();
  // Record this session into today's bucket
  try {
    const u = loadUsage();
    u[todayKey()] = (u[todayKey()] ?? 0) + getSessionMs();
    saveUsage(u);
  } catch { /* swallow */ }
});
