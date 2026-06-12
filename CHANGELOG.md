# Changelog

## v1.2.0 - 2026-06-12

- 扩展 ESPN 现场动态: 合并 `keyEvents` 和 `commentary.play`, 支持射门、射正、封堵、角球、犯规、手球、越位、换人、暂停/恢复等解说型气泡。
- 新增控球曲线: 从 ESPN `possessionPct` 生成实时走势,设置页可开关。
- 优化公司内网代理: 统一走 Electron `session.setProxy` + `net.fetch`,支持系统/自定义代理、bypass、代理认证和连通性测试后恢复配置。
- 修复半场提示误报: 只有真实中场后进入 `period=2` 才提示"下半场开打/易边再战"。
- 新增国家公仔: Algeria、Argentina、Australia、Austria,均包含 7 个 mood PNG 与 `pack.json`。
- 增加回归测试: 覆盖 ESPN 事件解析、控球曲线、半场状态转换、代理配置与 replay/dedup 行为。

## v1.1.0 - 2026-06-12

- 交互气泡、足球专属话术、墨西哥/南非公仔、新应用图标。

## v1.0.0 - 2026-06-10

- 首个桌面 FIFA World Cup 2026 companion 版本。
