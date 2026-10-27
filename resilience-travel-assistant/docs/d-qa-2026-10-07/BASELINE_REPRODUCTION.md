# 本次修复前的运行复现

2026-10-07；现有 5173 生产预览，旧构建 yyOo7uuGFyyKo2uDUfdyp。这些是本次运行观察，不沿用团队历史通过结果。

- F01：浏览器拦截 /api/decision，仅返回 API_CONTRACT 的十个锁定字段。页面进入错误边界，显示 `Cannot read properties of undefined (reading 'length')`，未展示核心建议。合法最小响应已由现有 api-client 接受。
- F03：清空 maxExtraCost 后按提交，实际导航 URL 出现 `maxExtraCost=0`，未提示错误。
- F08：首轮连续切换的检查捕捉到旧结果短暂满足查询条件后被 loading 替换。请求标识保护已补齐，最终 15 次操作及重查回归见 browser-results.json。
- F09：新构建手机布局测得次要按钮 42px；修复 min-height 后最终为 44px。
- F10：实际 live 数据带来源 URL；360px 浏览器的 documentElement.scrollWidth=410。卡片添加 overflow-wrap:anywhere；最终 live-360.png 与测量结果记录回归。
- 对比度：最初时间轴时长使用 text-slate-400；已加深。axe 首轮桌面发现情景提示对比度 4.48；提示字改用 slate-600 并等待加载和过渡结束后复测。

工具问题不计为产品故障：初次浏览器脚本的 role=alert 匹配到了 Next 隐藏路由播报节点；初次组件测试缺 JSX 自动运行时；均已修正。初次 verify 的构建失败是旧缓存目录权限问题，见 verify.log，原 .next 保留为 .next-d-before-20261007 后重建，不删除其他成员缓存。
