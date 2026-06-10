# ⚽ 世界杯 Buddy · World-Cup-Buddy

桌面挂着一只 Buddy, 帮你追 2026 FIFA 世界杯实时比分。进球他蹦迪, 红牌他瞪眼, 点球大战他抱头, 终场绝杀他起立。

> 数据源: ESPN `fifa.world` 公开 API · 免 key · 完全免费

## ⬇️ 下载

最新版: [Releases](https://github.com/twonly/World-Cup-Buddy/releases/latest)

- **macOS** (Apple Silicon): `WorldCup-Buddy-x.y.z-mac-arm64.dmg`
- **Windows** (x64): `WorldCup-Buddy-x.y.z-win-x64.exe` (portable, 双击即用)

### macOS 装好提示"已损坏"?

未签名所以系统多疑。终端跑一行:

```bash
xattr -dr com.apple.quarantine "/Applications/World Cup Buddy.app"
```

### Windows SmartScreen 警告?

未签名同理。点"更多信息" → "仍要运行"即可,一次性的。

## ✨ 功能

- **常驻比分板** — 两队国旗 + 实时比分 + 67' 比赛时钟, 20s 一刷
- **小组排名 chip** — 一眼知道关注的国家队在小组里的位置
- **赛前倒计时** — `🕐 2h 13m` 不必盯着等开球
- **事件实时推送** — 进球(带射手名)/红黄牌/乌龙球/中场/终场
- **点球大战不漏判** — 加时与点球专门处理, 90 分钟打平也能正确告诉你"点球 4-2, 赢了!"
- **战报卡片** — 一键保存当前比分 + 陪伴时长 PNG
- **内置形象** — 🇧🇷 巴西公仔(7 种心情)+ 48 国国旗头像, 开箱即用
- **自定义形象** — 拖任意 PNG 到 characters 文件夹即可换公仔(球星/吉祥物/自家狗都行)
- **静默模式** — 关气泡只看 chip, 适合工作时
- **8-bit 音效** — 进球/红牌/终场可选音效
- **⌘⇧X 召回** — 隐藏后随时唤回

## 🎨 换公仔

内置巴西公仔 + 48 国国旗。想换成自己的:

1. 右键 Buddy → 设置 → 角色形象 → 📂 素材文件夹
2. 新建子文件夹放 `idle.png` (220×220 透明 PNG 最佳)
3. 刷新, 设置里选你的包

7 种心情对应文件名: `idle.png` / `watch.png` / `cheer.png` / `sad.png` / `flag.png` / `sleep.png` / `dance.png`。只放 idle.png 也能用, 其他自动 fallback。

## 🛠 开发

```bash
npm i
npm run dev          # vite + electron 开发模式
npm run package:mac  # 出 macOS dmg
npm run package:win  # 出 Windows portable.exe
```

## 🙏 致谢

- 数据: [ESPN](https://www.espn.com/) `fifa.world` 公开 API
- 引擎: [Electron](https://www.electronjs.org/) + [Vite](https://vitejs.dev/) + React
- Powered by **WorkBuddy**
