# 发布流程

## 一次性 setup

1. **GitHub repo 已就绪** — https://github.com/twonly/NBA-Buddy
2. **Actions 权限** — repo Settings → Actions → General → Workflow permissions, 选 "Read and write permissions" 并勾上 "Allow GitHub Actions to create and approve pull requests"

不用准备签名证书 — 当前发布未签名版, 用户首次启动需绕一下 quarantine / SmartScreen (README 里写了)。后续要签 再加 `CSC_LINK` + `CSC_KEY_PASSWORD` 到 repo secrets 即可。

## 日常发新版

### 1. 改代码 + 测好

本地 dev 或 `npm run package:mac` 验证。

### 2. 版本号 + tag + 推送

```bash
# 选一个:
npm version patch   # 0.1.0 → 0.1.1 (bug fix)
npm version minor   # 0.1.0 → 0.2.0 (新功能)
npm version major   # 0.1.0 → 1.0.0 (重大变更)

# 然后:
git push --follow-tags
```

`npm version` 会:
- 改 `package.json` 的 `version`
- 自动 commit
- 自动打 tag `v0.1.1`

`git push --follow-tags` 会把 commit 和 tag 都推上去。

### 3. 等 Actions

推送 tag 触发 `.github/workflows/release.yml`:

- 同时跑 macOS + Windows 两个 runner
- 每个 runner 跑 `npm ci` + `npm run build` + `electron-builder --publish always`
- 自动把 `.dmg` / `.exe` / `latest-mac.yml` / `latest.yml` 上传到 `v0.1.1` Release

去 https://github.com/twonly/NBA-Buddy/actions 看进度, 一般 5-8 分钟。

### 4. 用户那边

- 已经装了的用户: 应用启动 30s 后自动检测, 后台下载, 退出时自动升级
- 用户也能从托盘菜单手动 "🔄 检查更新"
- 新用户: 去下载页或 Releases 拉最新

## 故障排查

### Actions build 失败

最常见: macOS runner 上 `npm ci` 失败因为 lockfile 过期。本地跑 `npm install --legacy-peer-deps` 然后 commit lockfile。

### auto-updater 不工作

- 确认 `package.json` 的 `version` 和 tag 一致 (`v0.1.1` ↔ `"0.1.1"`)
- 确认 Release 里有 `latest-mac.yml` 和 `latest.yml`(没有就是 Action 没跑 `--publish always`)
- 用户那边日志: `~/Library/Logs/篮球虾仔/main.log` (macOS) / `%APPDATA%\篮球虾仔\logs\main.log` (Win)

### 想发预览版不通知用户

打 tag 时加 prerelease 后缀: `v0.2.0-beta.1`。但 electron-updater 默认会 skip prerelease, 所以静默。

## 回滚

把 Release 标记为 prerelease 或删除即可, electron-updater 默认只看 `latest.yml`。

## 后续可以加

- [ ] Apple 开发者证书 + notarize → `xattr` 步骤就不用了
- [ ] Windows 代码签名 → SmartScreen 不再警告
- [ ] Linux AppImage target
- [ ] beta 通道 (autoUpdater.channel = 'beta')
