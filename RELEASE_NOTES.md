# World Cup Buddy v1.2.1

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

- 扩展 ESPN 现场动态: 射门、射正、封堵、角球、犯规、手球、越位、换人、暂停/恢复等。
- 新增 ESPN 控球曲线。
- 优化公司内网代理: 系统/自定义代理、bypass、认证代理和连通性测试。
- 修复半场提示误报。
- 新增 Algeria、Argentina、Australia、Austria 国家公仔。
