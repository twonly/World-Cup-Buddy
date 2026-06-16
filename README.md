# ⚽ 世界杯 Buddy · World-Cup-Buddy

桌面挂着一只 Buddy, 帮你追 2026 FIFA 世界杯实时比分。进球他蹦迪, 红牌他瞪眼, 点球大战他抱头, 终场绝杀他起立。

> 数据源: ESPN `fifa.world` 公开 API · 免 key · 完全免费

## ⬇️ 下载

最新版: [Releases](https://github.com/twonly/World-Cup-Buddy/releases/latest)

- **macOS** (Apple Silicon): `WorldCup-Buddy-x.y.z-mac-arm64.dmg`
- **Windows** (x64): `WorldCup-Buddy-x.y.z-win-x64.exe` (portable, 双击即用)

### macOS 打不开 / 提示 Apple 无法验证?

当前 macOS 版还没有 Apple Developer ID 签名和 notarization,从 GitHub 下载后 macOS Gatekeeper 可能提示:

> Apple 无法验证 "World Cup Buddy" 是否包含可能危害 Mac 安全或泄漏隐私的恶意软件。

这是未签名开源小工具常见的拦截,不是下载坏了。请先把 app 从 DMG 拖到"应用程序",然后在终端执行:

```bash
xattr -dr com.apple.quarantine "/Applications/World Cup Buddy.app"
```

再重新打开。如果你直接在 Downloads 里运行,把路径换成:

```bash
xattr -dr com.apple.quarantine "$HOME/Downloads/World Cup Buddy.app"
```

### Windows SmartScreen 警告?

未签名同理。点"更多信息" → "仍要运行"即可,一次性的。

## ✨ 功能

- **常驻比分板** — 两队国旗 + 实时比分 + 67' 比赛时钟, 20s 一刷
- **点开看关键事件** — 点一下记分牌(带 ▼ 提示)展开/收起本场关键事件: 电视直播式中轴时间线, 主队左/客队右, 进球(球员+时间+比分)、红黄牌(球员+时间)、乌龙、点球
- **按时间翻比赛** — 记分牌是一条时间线(最近赛果→直播→接下来几场), ⏮ 上一场 / 下一场 ⏭ 逐场翻看, 与所选主队无关; 默认停在最近赛果, 赛前 30 分钟切到下一场
- **控球比例** — Live 模式显示双方各自占比 + 队名标注, 一眼看清谁在控场
- **小组排名 chip** — 一眼知道关注的国家队在小组里的位置
- **赛前倒计时** — `🕐 2h 13m` 不必盯着等开球
- **事件实时推送** — 进球(带射手名)/射门/射正/角球/犯规/手球/越位/换人/红黄牌/中场/终场
- **点球大战不漏判** — 加时与点球专门处理, 90 分钟打平也能正确告诉你"点球 4-2, 赢了!"
- **公司代理支持** — 可选直连 / 系统代理 / 自定义代理, 支持代理连通性测试
- **战报卡片** — 一键保存当前比分 + 陪伴时长 PNG
- **内置形象** — 多国公仔(7 种心情), 开箱即用
- **自定义形象** — 拖任意 PNG 到 characters 文件夹即可换公仔(球星/吉祥物/自家狗都行)
- **静默模式** — 关气泡只看 chip, 适合工作时
- **8-bit 音效** — 进球/红牌/终场可选音效
- **⌘⇧X 召回** — 隐藏后随时唤回

## 🌐 公司内网代理

右键 Buddy → 设置 → 网络代理:

- **直连**: 不使用代理
- **系统代理**: 使用操作系统代理配置
- **自定义**: 输入 `http://proxy.corp.com:8080` 或 `http://user:pass@proxy.corp.com:8080`

设置页里的"测试连通性"会临时套用当前代理访问 ESPN API,测试结束后恢复已保存配置。

## 🎨 换公仔

内置多国公仔。想换成自己的:

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
