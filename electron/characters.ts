import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import { app } from 'electron';

export type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';
const ALL_MOODS: Mood[] = ['idle','watch','cheer','sad','flag','sleep','dance'];

export type CharacterPack = {
  id: string;                        // folder name
  name: string;                      // display name
  author?: string;
  builtin?: boolean;
  // file URL for each mood; if missing, renderer falls back to default emoji
  frames: Partial<Record<Mood, string>>;
};

export const DEFAULT_PACK_ID = 'default-shrimp';

export function charactersDir(): string {
  return path.join(app.getPath('userData'), 'characters');
}

export function ensureCharactersDir(): void {
  const dir = charactersDir();
  fs.mkdirSync(dir, { recursive: true });

  // Drop a README the first time so the user knows the spec
  const readme = path.join(dir, 'README.txt');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme,
`世界杯 Buddy · 自定义角色包格式
=================================

每个角色包是这个文件夹里的一个子文件夹。
可以放球星公仔 / 国家队吉祥物 / 任意 PNG。

子文件夹结构（最简单的版本）：

  my-character/
    pack.json
    idle.png
    watch.png
    cheer.png
    sad.png
    flag.png
    sleep.png
    dance.png

pack.json 示例：
{
  "name": "梅西公仔",
  "author": "你的名字"
}

PNG 规范：
  - 推荐尺寸: 220×220 (与窗口同尺寸；任意尺寸都会被居中缩放)
  - 必须是 PNG 且透明背景
  - 角色应该居中
  - 缺哪张图就会 fallback 回默认 Buddy 表情

七种心情对应场景：
  idle  - 待机摸鱼
  watch - 看球中（专注）
  cheer - 庆祝（兴奋、举手）
  sad   - 难过（低头、流泪）
  flag  - 摇旗呐喊（开赛 / 进球前）
  sleep - 打盹（中场 / 半场休息）
  dance - 蹦迪（进球 / 胜利狂欢）

提示：可以只画 1 张 idle.png，其他不放，系统会用默认 emoji 顶上。
`);
  }
}

// Bundled packs that ship inside the app (app.asar in prod, project root in dev).
export function builtinPacksDir(): string {
  return path.join(app.getAppPath(), 'character-packs');
}

// Copy bundled packs into the user's characters dir on first run. Idempotent:
// existing folders are left alone so user edits / uploads always win.
export function seedBuiltinPacks(): void {
  const srcRoot = builtinPacksDir();
  let entries: string[] = [];
  try { entries = fs.readdirSync(srcRoot); } catch { return; }
  ensureCharactersDir();
  const destRoot = charactersDir();
  cleanupSeededFlagPacks(destRoot);

  for (const entry of entries) {
    const srcDir = path.join(srcRoot, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(srcDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    if (entry.startsWith('_')) continue;

    // Full multi-mood pack (e.g. brazil) — copy verbatim if not present.
    const destDir = path.join(destRoot, entry);
    if (fs.existsSync(destDir)) continue;
    try {
      fs.mkdirSync(destDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
      }
    } catch { /* skip on error */ }
  }
}

// Remove old automatically seeded flag-only packs now that full character packs ship.
function cleanupSeededFlagPacks(destRoot: string): void {
  let entries: string[] = [];
  try { entries = fs.readdirSync(destRoot); } catch { return; }

  for (const entry of entries) {
    if (!entry.startsWith('flag-')) continue;

    const packDir = path.join(destRoot, entry);
    const metaPath = path.join(packDir, 'pack.json');
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta?.author === 'World Cup 2026' || meta?.author === 'World Cup Flags') {
        fs.rmSync(packDir, { recursive: true, force: true });
      }
    } catch { /* leave user-created folders alone */ }
  }
}

export function listPacks(): CharacterPack[] {
  ensureCharactersDir();
  const dir = charactersDir();
  const packs: CharacterPack[] = [{
    id: DEFAULT_PACK_ID,
    name: '⚽ 默认 Buddy（emoji）',
    builtin: true,
    frames: {},
  }];

  let entries: string[] = [];
  try { entries = fs.readdirSync(dir); } catch { return packs; }

  for (const entry of entries) {
    const folder = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(folder); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const metaPath = path.join(folder, 'pack.json');
    let meta: any = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { /* optional */ }

    const frames: Partial<Record<Mood, string>> = {};
    for (const mood of ALL_MOODS) {
      const candidate = path.join(folder, `${mood}.png`);
      if (fs.existsSync(candidate)) {
        // Use url.pathToFileURL for cross-platform compatibility (Windows backslash paths)
        frames[mood] = url.pathToFileURL(candidate).href;
      }
    }
    // Allow single-image packs (e.g. country flags): any .png in folder becomes idle.
    if (!frames.idle) {
      const anyPng = (fs.readdirSync(folder).find(f => f.toLowerCase().endsWith('.png')));
      if (anyPng) frames.idle = url.pathToFileURL(path.join(folder, anyPng)).href;
    }
    if (Object.keys(frames).length === 0) continue;
    // Fill missing moods with idle as fallback so the renderer always has something.
    if (frames.idle) {
      for (const mood of ALL_MOODS) {
        if (!frames[mood]) frames[mood] = frames.idle;
      }
    }

    packs.push({
      id: entry,
      name: meta.name ?? entry,
      author: meta.author,
      frames,
    });
  }
  return packs;
}

export function packById(id: string): CharacterPack | null {
  return listPacks().find(p => p.id === id) ?? null;
}
