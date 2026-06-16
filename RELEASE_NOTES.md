# World Cup Buddy v1.3.0

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

- **自动追当前比赛**: 不用选主队也能看球! 世界杯一个时段就一场, Buddy 自动加载进行中 / 即将开始的那场, 赛前 30 分钟自动切到下一场。
- **中立解说**: 没选主队时, 关键事件按球队名播报 (进球依旧蹦迪), 不再用"我方/对方"视角。
- **控球比例双方占比**: 控球改为分段条 + 队名缩写标注 (如 `ARG 56% — 44% FRA`), 一眼看清谁在控场, 不会忘记谁是主队。
- 设置支持中文 / 缩写搜索球队 (如输入"阿根廷"或"arg")。
- 关注球队当天无赛事时仍提示其下一场; 未选球队则提示当日是否有世界杯。
- 内置多国国家队公仔替换旧国旗头像, 新增韩国队。

> 关闭本 issue: 关注的球队功能设计的不合理 (#1)。
