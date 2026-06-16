# World Cup Buddy v1.4.0

## macOS 下载后打不开?

当前 macOS 版还没有 Apple Developer ID 签名和 notarization。从 GitHub 下载后,macOS 可能提示:

> Apple 无法验证 "World Cup Buddy" 是否包含可能危害 Mac 安全或泄漏隐私的恶意软件。

这是 Gatekeeper 对未签名互联网下载软件的拦截,不是下载坏了。请先把 app 从 DMG 拖到"应用程序",然后在终端执行:

```bash
xattr -dr com.apple.quarantine "/Applications/World Cup Buddy.app"
```

再重新打开。

如果你直接在 Downloads 里运行,把路径换成:

```bash
xattr -dr com.apple.quarantine "$HOME/Downloads/World Cup Buddy.app"
```

## Windows SmartScreen 提示?

Windows 版目前也未签名。看到 SmartScreen 时点"更多信息" -> "仍要运行"即可。

## 本次更新

- **点开记分牌看关键事件**: 点击常驻记分牌即可展开 / 收起当前比赛的关键事件流 —— 进球(球员 + 时间 + 比分)、红黄牌(球员 + 时间)、乌龙球、点球, 一目了然。记分牌带 ▼ 提示可点。
- **形象升级**: 默认形象从虾仔换成足球 ⚽, 应用 / 托盘图标、文案同步更新。

### v1.3.0 起的能力
- **自动追当前比赛**: 不用选主队也能看球! 世界杯一个时段就一场, Buddy 自动加载进行中 / 即将开始的那场, 赛前 30 分钟自动切到下一场。
- **中立解说**: 没选主队时, 关键事件按球队名播报 (进球依旧蹦迪), 不再用"我方/对方"视角。
- **控球比例双方占比**: 控球改为分段条 + 队名缩写标注 (如 `ARG 56% — 44% FRA`), 一眼看清谁在控场。
- 设置支持中文 / 缩写搜索球队 (如输入"阿根廷"或"arg")。
