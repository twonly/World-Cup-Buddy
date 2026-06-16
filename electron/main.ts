import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, dialog, globalShortcut, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { startPoller, stopPoller, setFavoriteTeams, testProxyConnectivity, getKnownTeams, getTeamAliases, getLastGameSnapshot, forceTick, fetchInfoBite, getLastRealEventAt, getCurrentScore, getCurrentMatchKeyEvents, stepMatch, resetMatchPin, type GameEvent, type ScoreState } from './poller';
import { listPacks, ensureCharactersDir, charactersDir, packById, seedBuiltinPacks, DEFAULT_PACK_ID } from './characters';
import { buildSessionProxyConfig, proxyAuthForInput, type ProxyAuth, type ProxyMode } from './proxy';

// Make the process easier to find in Activity Monitor / pkill
process.title = '世界杯 Buddy';

// Windows transparent window fix: enable compositor transparency before app is ready.
// Without this, transparent BrowserWindows show a black background on many Windows machines.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

// Suppress EPIPE on stdio when launched without a terminal (Finder/launchd).
// Without this, any console.* call after the pipe closes throws and crashes the app.
// On Windows, ECONNRESET is the equivalent error for broken pipe scenarios.
const SUPPRESSED_ERR_CODES = new Set(['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED']);
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err && SUPPRESSED_ERR_CODES.has(err.code ?? '')) return;
  });
}
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err && SUPPRESSED_ERR_CODES.has(err.code ?? '')) return;
  // Don't bring up Electron's error dialog for non-fatal stuff
  try { console.error('[uncaught]', err); } catch {}
});

// Tray icon, embedded so it never depends on disk paths inside an asar bundle.
const TRAY_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAFO0lEQVR4nJWVW2wc1R3Gf+fMzM6ud702ybK2k5qQ2CG2wUBKUhJF4RJF3BEIBAKpVOKBiwQSohWCVi0vSEio6lul0juqVKkikQqEXoAISCAkhgBJLHBi1uDE6/i29u56vbuzM3PmVDNr7OSx52VG/3Pm+39zzne+T4DQfD+EQAiBDhT/zxDSAA1aB6u1EFgsg34/YbZ1kMx0IkwLdFgPm4no42it1gg0wldUizO4S5PLvCRaN3maXAAq2zrZ+viL9NywB7stjS00ATEMYTXBm0wiUFO4NBSoxTr5T45w5A+/wJkfXwEXQsiohWhZw55X9tG/82rai6O01Isc9buJCRPLskEKkBEHAnwq2uEmO89CYg3lzCCl46Psf+IOvPJU1NpEGmjlccU9T7N+4ArOnj7NA6X9nPI7qKXX46savhlgxCQKFVGWukEJj1b/JLvMAr+sGsSu2UT2oWfIv/o8wpCYKB9pJMgM7KIn5jNSqTKbGyWdFTwq/81vyzto2Jp6CJTQNFSA1FV+1vYFqjZPuTTOtJrgTEOzefdOjL8kUW4VqdFY8Uuo+0n2dKXY1dvDm+PtdJwb4tzoGBNzkJAOP+ww+fXeH9DX6pKbLDPzbZ6u8RO8cdbm64lF4vMzxFoMjNb21cML5eLXDXL5BrdcZfPfW7fw2oHzDG5w+MndFe69sp/t2W6oO+Svs6ik5ygMVfjzmGTk+nX8fPMw79f7KHkpMOUqsNISIzDpSseYW5hmxBuh965tiO3rqJvDHMu5HPjyc2Ydh6NOnkaqweL1W5jKdPBgYpQn4pcyYTQ4VGsgjEiQ4Tk39VepBHw3vYj0kmxy++i92uJYcYz5nI/vuVyVuYS9l3XzWPcgW9w0XxenMNa1knbaKWqD0yUfbdbQTcLLW4HAqUmGcosMZNq4sj/Lx+Mfc3/6Fp7ZfRuJ1iSEt1EHBErxiHsdvzn+Li+d/JRjl16GMVPgy/mAdQMewYXAAYK4bfLhiSLZZJUj1il6vX6euvZODg6P0p1N0395J55S1F2PUqXKk1tvZih/joNzdQ4VulBZF8fywou6uhWhMqQtWajC7z+YYGy6xt71Wxk+l+fZl//G398+ip1MYAjBP975jLc+OolHQN/aTqpTi5SRyFRAIL0V64kYaxHQsALspEW1HsctS6qOi0gJCsUKHWvTLMwVmZhZ4PYdfcRsiy/Gprm2cxPbe3xOFebxQqlZze26iLFvCHToOXWBqmQ5lD+NHW/hP6/+lLt2D3Lg8AmGcxMICfsOf4VX0zyybQeZ8w6tyiPeJrENPzKqVca+A76JIUIdljEmezncmmPDmWH2bujBrTQY2NyN43uMTJe478atZNpbcJXHbdt7MAvjjHXZ1DwX3fCawEIY6HoBPTdJcs02nEQN5ShK3yj+6J1haKnEYCbLGtOkvFRhbTrBV9/N8Kd9B3npuQcY2LmJ+SWDs+4U4psiwUIp8nQz+rfAY+H479j48H7iugMvCcqXLE0afDI/zbHUOC2WRtVrxHzFjzZuYVa6HJjKYbUkOKXmiHVmKb7+T/BcMMxloxehhypSN75A5s5fUTNdKnKBhiyCO4t2Cmh3EYQLpktLNs7lfV3YKUUjHmDHTWb++h7nX34t8urIj5v6EE2j1Qpz402kdv0YNvbipiW+XUeYNYRsIEwX0/YwDBfwiEuFNTNL+V+HWXz3SNPkVxJmJfPCvAuZ+8upZSGMWLNhaPLhc3lp+BppyffRnrMaS8ugK5l3cTIazfyJAvXiqeXEu6AuIlOPKmo1SMPC/wBGM2PNjKPCRQAAAABJRU5ErkJggg==';

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const HOTKEY_LABEL = isMac ? '⌘⇧X' : 'Ctrl+Shift+X';

/** Show a window without stealing focus on macOS (showInactive), or normally on other platforms. */
function showWithoutFocus(win: BrowserWindow) {
  if (isMac) {
    win.showInactive();
  } else {
    win.show();
  }
}

// =====================================================================
// Network proxy — applies to Electron's Chromium stack: autoUpdater and
// poller net.fetch() both use this session.
// =====================================================================
let activeProxyAuth: ProxyAuth | null = null;

async function applyProxy(cfg: Config) {
  const ses = session.defaultSession;
  activeProxyAuth = proxyAuthForInput(cfg.proxyMode ?? 'direct', cfg.proxyUrl);
  await ses.setProxy(buildSessionProxyConfig(cfg.proxyMode ?? 'direct', cfg.proxyUrl, cfg.proxyBypass));
  try { await ses.closeAllConnections(); } catch { /* older Electron */ }
}

function setupProxyAuthHandler() {
  app.on('login', (event, _webContents, _request, authInfo, callback) => {
    if (!authInfo.isProxy || !activeProxyAuth) return;
    event.preventDefault();
    callback(activeProxyAuth.username, activeProxyAuth.password);
  });
}
const SHRIMP_W = 240;
const SHRIMP_H = 280;
const BUBBLE_W = 320;
const BUBBLE_H = 140;

let shrimpWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let suppressMoveSave = false;   // true while we programmatically resize the buddy window

// Grow/shrink the buddy window to fit its content (so the key-event panel never covers the
// buddy and the window auto-fits whether expanded or collapsed). Anchored at the bottom edge
// so the buddy stays put and the panel expands upward into free screen space.
function resizeShrimpToContent(contentH: number) {
  if (!shrimpWindow || !contentH) return;
  const disp = screen.getDisplayMatching(shrimpWindow.getBounds());
  const wa = disp.workArea;
  const [x, y] = shrimpWindow.getPosition();
  const [w, oldH] = shrimpWindow.getSize();
  const bottom = y + oldH;
  const maxH = Math.max(SHRIMP_H, bottom - wa.y);                 // don't run off the top
  const h = Math.round(Math.max(160, Math.min(contentH, maxH)));
  if (Math.abs(h - oldH) < 2) return;
  const newY = Math.max(wa.y, bottom - h);                        // keep the bottom fixed
  suppressMoveSave = true;
  shrimpWindow.setResizable(true);
  shrimpWindow.setBounds({ x, y: newY, width: w, height: h });
  shrimpWindow.setResizable(false);
  setTimeout(() => { suppressMoveSave = false; }, 60);
}

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
  showPossession?: boolean;  // render ESPN possessionPct curve under chip
  showWinProb?: boolean;     // legacy v1.1 setting name, migrated to showPossession
  // Network proxy — corporate intranets on Windows often block direct HTTPS
  proxyMode?: ProxyMode;     // 'direct' (default), 'system' (use OS proxy), 'custom' (manual URL)
  proxyUrl?: string;         // e.g. 'http://proxy.corp.com:8080'
  proxyBypass?: string;      // comma-separated domains to bypass, e.g. '<local>,*.corp.com'
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
      showPossession: true,
      showWinProb: true,
      proxyMode: 'direct',
      proxyUrl: '',
      proxyBypass: '<local>',
    };
  }
  // Backfill defaults for older configs
  if (cfg.quietMode === undefined) cfg.quietMode = false;
  if (cfg.soundEnabled === undefined) cfg.soundEnabled = false;
  if (cfg.showPossession === undefined) cfg.showPossession = cfg.showWinProb !== false;
  if (cfg.showWinProb === undefined) cfg.showWinProb = true;
  if (cfg.proxyMode === undefined) cfg.proxyMode = 'direct';
  if (cfg.proxyUrl === undefined) cfg.proxyUrl = '';
  if (cfg.proxyBypass === undefined) cfg.proxyBypass = '<local>';
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
  // On Windows with DPI scaling, position values may need adjustment.
  // Use safe defaults that account for taskbar position on both platforms.
  const x = cfg.positionX ?? workArea.x + workArea.width - SHRIMP_W - 40;
  const y = cfg.positionY ?? workArea.y + workArea.height - SHRIMP_H - (isWin ? 20 : 80);

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
    // macOS: focusable:false keeps the window from stealing focus (ideal for an overlay).
    // Windows: focusable:false can block click events entirely, so we keep it focusable
    // and rely on show()/showInactive() + setAlwaysOnTop to avoid stealing focus.
    focusable: !isMac,
    acceptFirstMouse: true, // but still receive clicks immediately
    type: isMac ? 'panel' : undefined, // NSPanel on Mac = floats without activating
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shrimpWindow.setAlwaysOnTop(true, isMac ? 'screen-saver' : 'floating');
  if (isMac) {
    shrimpWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  loadUrl(shrimpWindow, '/shrimp');
  shrimpWindow.once('ready-to-show', () => {
    if (shrimpWindow) showWithoutFocus(shrimpWindow);
  });

  shrimpWindow.on('moved', () => {
    if (!shrimpWindow || suppressMoveSave) return;   // ignore programmatic resizes
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

// Auto-close timers per bubble window; cleared when the user pins a bubble.
const bubbleTimers = new Map<number, NodeJS.Timeout>();

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
    // macOS: focusable:false prevents stealing focus; Windows: must be true for clicks
    focusable: !isMac,
    acceptFirstMouse: true, // but interactive: drag / pin / close
    type: isMac ? 'panel' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  bubble.setAlwaysOnTop(true, isMac ? 'screen-saver' : 'floating');

  const encoded = encodeURIComponent(JSON.stringify({ message, mood }));
  if (isDev) {
    bubble.loadURL(`http://localhost:5173/#/bubble?data=${encoded}`);
  } else {
    bubble.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `/bubble?data=${encoded}` });
  }
  bubble.once('ready-to-show', () => showWithoutFocus(bubble));

  const id = bubble.webContents.id;
  const timer = setTimeout(() => {
    bubbleTimers.delete(id);
    if (!bubble.isDestroyed()) bubble.close();
  }, ttl);
  bubbleTimers.set(id, timer);
  bubble.on('closed', () => {
    const t = bubbleTimers.get(id);
    if (t) clearTimeout(t);
    bubbleTimers.delete(id);
  });
}

// Bubble interactions: any click pins it (cancels auto-close); ✕ closes it;
// dragging moves it; renderer reports its content height so long text fits.
function setupBubbleIpc() {
  ipcMain.handle('bubble:pin', (e) => {
    const t = bubbleTimers.get(e.sender.id);
    if (t) { clearTimeout(t); bubbleTimers.delete(e.sender.id); }
  });
  ipcMain.handle('bubble:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
  });
  ipcMain.handle('bubble:drag', (e, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + Math.round(dx), y + Math.round(dy));
  });
  ipcMain.handle('bubble:resize', (e, contentH: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const [w, h] = win.getSize();
    const newH = Math.min(Math.max(Math.ceil(contentH), 80), 480);
    if (newH === h) return;
    // Keep the bottom edge (speech tail near the buddy) anchored
    win.setBounds({ x, y: y + (h - newH), width: w, height: newH });
  });
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
  // tray.setTitle() is macOS-only — adds visible text next to the menu bar icon.
  if (isMac) tray.setTitle(' ⚽');
  // On Windows, left-click the tray icon to toggle the shrimp (no Dock to fall back to)
  if (isWin) {
    tray.on('click', () => toggleShrimp());
  }
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const cfg = loadConfig();
  const menu = Menu.buildFromTemplate([
    { label: `⚽ 世界杯 Buddy v${app.getVersion()}  ·  ${cfg.mode === 'replay' ? 'Replay 模式' : 'Live 模式'}`, enabled: false },
    { type: 'separator' },
    { label: `🙈 显示/隐藏 Buddy（${HOTKEY_LABEL}）`, click: () => toggleShrimp() },
    { label: '⚙️ 设置', click: () => createSettingsWindow() },
    { label: '📸 保存今日战报卡片', click: () => saveDailyCard().catch(() => {}) },
    { label: '⚽ 看看赛况', click: () => { showMatchInfo().catch(() => {}); } },
    { label: '🔄 检查更新', click: () => manualCheckForUpdates() },
    { type: 'separator' },
    { label: '⚽💔 含泪告别（退出）', click: () => app.quit() },
  ]);
  tray.setToolTip(isWin
    ? `世界杯 Buddy · ${cfg.mode === 'replay' ? 'Replay 模式' : 'Live 模式'} · 左键显示/隐藏`
    : '世界杯 Buddy（双击 Buddy 即可退出）');
  tray.setContextMenu(menu);
}

const HOTKEY = 'CommandOrControl+Shift+X';

function toggleShrimp() {
  if (!shrimpWindow) {
    createShrimpWindow();
    if (isMac) app.dock?.hide();
    return;
  }
  if (shrimpWindow.isVisible()) {
    shrimpWindow.hide();
    // Surface Dock icon as a visible "call me back" handle (tray hides on notched Macs)
    if (isMac) app.dock?.show().catch(() => {});
  } else {
    // Validate position is still within screen bounds (multi-monitor / DPI change guard)
    const displays = screen.getAllDisplays();
    const [cx, cy] = shrimpWindow.getPosition();
    const onScreen = displays.some(d => {
      const { x, y, width, height } = d.workArea;
      return cx >= x && cx < x + width && cy >= y && cy < y + height;
    });
    if (!onScreen) {
      // Reset to bottom-right corner of primary display
      const { workArea } = screen.getPrimaryDisplay();
      shrimpWindow.setPosition(workArea.x + workArea.width - SHRIMP_W - 40, workArea.y + workArea.height - SHRIMP_H - (isWin ? 20 : 80));
    }
    showWithoutFocus(shrimpWindow);
    if (isMac) app.dock?.hide();
  }
}

function hideShrimpWithTip() {
  if (!shrimpWindow || !shrimpWindow.isVisible()) return;
  showBubble(`🙈 Buddy 藏好啦！${HOTKEY_LABEL} 召回 / 或点 Dock 上的 Buddy`, 'sleep', 4500);
  setTimeout(() => {
    if (shrimpWindow?.isVisible()) {
      shrimpWindow.hide();
      if (isMac) app.dock?.show().catch(() => {});
    }
  }, 1500);
}

// Football-only fallbacks for when a click finds nothing new from the API.
// Kept deliberately plain — no work/rest small talk.
const NO_NEWS_TIPS: { mood: string; message: string }[] = [
  { mood: 'watch', message: '⚽ 暂时没有新资讯，Buddy 继续盯着赛场' },
  { mood: 'idle', message: '🥅 场上暂时风平浪静,有动静马上喊你' },
  { mood: 'watch', message: '📡 刚刷新过了,还没有新的比赛动态' },
];

// Instant acknowledgement while the lookup runs — varied so it never feels canned.
const SEARCHING_TIPS: string[] = [
  '📡 正在连线赛场,稍等…',
  '🔭 望远镜对准球门,马上来…',
  '🏃 Buddy 跑去问边裁了，稍等…',
  '🎙️ 正在连线解说席…',
  '🛰️ 卫星对准球场,信号马上回来…',
  '⏱️ 刷新比分中,等我两秒…',
  '📋 翻一下技术统计,很快…',
];
let lastSearchingTip = -1;
function pickSearchingTip(): string {
  // never repeat the previous one back-to-back
  let i = Math.floor(Math.random() * SEARCHING_TIPS.length);
  if (i === lastSearchingTip) i = (i + 1) % SEARCHING_TIPS.length;
  lastSearchingTip = i;
  return SEARCHING_TIPS[i];
}

let infoBiteBusy = false;
let lastInfoDoneAt = 0;
const INFO_COOLDOWN_MS = 1500; // rapid re-clicks right after a result: wiggle only

// Click / "看看赛况": refresh ESPN, then surface a real event or an info bite.
// Nothing from the API → one plain football tip. Never generic chitchat.
// Anti-spam: one in-flight lookup at a time + a short cooldown after each result,
// so hammering the buddy fires at most 1-2 requests.
async function showMatchInfo() {
  if (infoBiteBusy || Date.now() - lastInfoDoneAt < INFO_COOLDOWN_MS) return;
  infoBiteBusy = true;
  const clickAt = Date.now();
  emitToShrimp({ kind: 'mood', mood: 'watch' });
  showBubble(pickSearchingTip(), 'watch', 2600); // gone right before the result lands
  forceTick(); // real scoring/status events fire via onGameEvent

  // Give forceTick a beat so a real event (if any) takes priority.
  setTimeout(async () => {
    try {
      if (getLastRealEventAt() > clickAt) return; // real event already bubbled
      const bite = await fetchInfoBite();
      if (bite) {
        showBubble(bite.message, bite.mood, bite.ttl ?? 6000);
      } else {
        const tip = NO_NEWS_TIPS[Math.floor(Math.random() * NO_NEWS_TIPS.length)];
        showBubble(tip.message, tip.mood, 4500);
      }
    } finally {
      infoBiteBusy = false;
      lastInfoDoneAt = Date.now();
    }
  }, 2800);
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
      highlight: '今天还没开赛，Buddy 先打个盹~',
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

app.whenReady().then(async () => {
  if (isMac) app.dock?.hide();

  // Windows: set AppUserModelId for proper taskbar grouping and toast notifications.
  if (isWin) {
    app.setAppUserModelId('com.worldcupbuddy.app');
  }
  ensureCharactersDir();
  seedBuiltinPacks();   // copy bundled character packs on first run
  const cfg = loadConfig();

  // Apply proxy settings before any network requests start
  await applyProxy(cfg).catch(() => {});
  setupProxyAuthHandler();

  createShrimpWindow();
  buildTray();
  setupAutoUpdater();
  setupBubbleIpc();

  // Global hotkey: summon / hide the shrimp from anywhere (fallback when tray is invisible)
  const registered = globalShortcut.register(HOTKEY, () => toggleShrimp());
  if (!registered) {
    // hotkey conflict — bubble will still mention it but at least nothing crashes
  }

  // Welcome bubble so the user has a visible confirmation it launched
  setTimeout(() => {
    showBubble(`⚽ Buddy 上岗啦！按 ${HOTKEY_LABEL} 可以随时召回我`, 'flag', 6000);
  }, 1200);

  startPoller({
    favoriteTeams: cfg.favoriteTeams,
    mode: cfg.mode,
    onEvent: onGameEvent,
    onScore: (s) => emitToShrimp({ kind: 'score', score: s, showPossession: loadConfig().showPossession !== false }),
    onWinProb: (points) => emitToShrimp({ kind: 'possession', points }),
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
    // Re-apply proxy if proxy settings changed
    if (prev.proxyMode !== next.proxyMode || prev.proxyUrl !== next.proxyUrl || prev.proxyBypass !== next.proxyBypass) {
      applyProxy(next).catch(() => {});
    }
    return next;
  });

  // Proxy connectivity test — tries ESPN API through the specified proxy
  ipcMain.handle('proxy:test', async (_e, mode: ProxyMode, proxyUrl?: string, proxyBypass?: string) => {
    const saved = loadConfig();
    const testCfg: Config = {
      ...saved,
      proxyMode: mode,
      proxyUrl: proxyUrl ?? '',
      proxyBypass: proxyBypass ?? '<local>',
    };
    try {
      await applyProxy(testCfg);
      return await testProxyConnectivity();
    } finally {
      await applyProxy(saved);
    }
  });

  ipcMain.handle('teams:list', async () => getKnownTeams());
  ipcMain.handle('teams:aliases', async () => getTeamAliases());
  ipcMain.handle('score:keyEvents', async () => getCurrentMatchKeyEvents());
  ipcMain.handle('match:step', (_e, delta: number) => { stepMatch(Number(delta) || 0); });
  ipcMain.handle('match:reset', () => { resetMatchPin(); });
  ipcMain.handle('shrimp:resize', (_e, h: number) => { resizeShrimpToContent(Number(h) || 0); });
  ipcMain.handle('shrimp:drag', (_e, dx: number, dy: number) => {
    if (!shrimpWindow) return;
    const [x, y] = shrimpWindow.getPosition();
    shrimpWindow.setPosition(x + dx, y + dy);
  });
  ipcMain.handle('shrimp:click', () => showMatchInfo());
  ipcMain.handle('demo:trigger', () => showMatchInfo());
  ipcMain.handle('settings:open', () => createSettingsWindow());
  ipcMain.handle('card:save', () => saveDailyCard());
  ipcMain.handle('shrimp:contextMenu', () => {
    const menu = Menu.buildFromTemplate([
      { label: `⚽ 世界杯 Buddy v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: '⚙️ 设置', click: () => createSettingsWindow() },
      { label: '📸 保存今日战报卡片', click: () => saveDailyCard().catch(() => {}) },
      { label: '⚽ 看看赛况', click: () => { showMatchInfo().catch(() => {}); } },
      { label: `🙈 藏起来一会儿（${HOTKEY_LABEL} 召回）`, click: () => hideShrimpWithTip() },
      { type: 'separator' },
      { label: '⚽💔 含泪告别（退出）', click: () => app.quit() },
    ]);
    if (shrimpWindow) menu.popup({ window: shrimpWindow });
  });
  ipcMain.handle('shrimp:farewell', async () => {
    const sessionStr = formatDuration(getSessionMs());
    const todayStr = formatDuration(getTodayMs());
    const parent = shrimpWindow ?? settingsWindow ?? undefined;
    const opts: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['⚽💔 含泪告别', '不行，再陪我一会'],
      defaultId: 1,
      cancelId: 1,
      title: '世界杯 Buddy',
      message: 'Buddy: 你今天对我可真好 🥺',
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
  if (isMac) app.dock?.hide();
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
