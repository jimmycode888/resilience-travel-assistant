# D 第二阶段实际 QA · 2026-10-10

测试对象是 A部分/app 当前源码及 5191 新生产构建，不沿用历史314/169等数字。BUILD_ID `8wTbNgfu0WX2RLcxwkVxE`，构建UTC时间 `2026-10-10T15:22:15.772331+00:00`；源码清单摘要见 VERSION.json，无 Git 元数据。

## 已完成/自动化已验证

| 实际命令 | 最终退出/数量 | 证据 |
|---|---|---|
| npm run typecheck | 0 | typecheck-final.log |
| npm test -- src/test/team-integration.test.ts src/test/d-team.test.ts src/test/d-team-upstream-review.test.ts | 0；3文件49项（A7，D行为40，诊断2） | contracts-final.log |
| npm run verify | 0；lint无error/warning，typecheck成功，26文件356项，Next生产构建成功 | verify-final.log |
| npm run smoke | 0；1文件2项，第一阶段3情景各5次共15次调用 | smoke.log；这是旧决策稳定性，不能证明中断数据正确 |
| D_QA_URL=http://localhost:5191 node src/test/d-team.e2e.mjs | 0；31组通过，未捕获浏览器异常0 | 状态、键盘/地图联动、请求竞争、失败及响应式 |
| curl /api/health 与 /journey-team | HTTP200 | health-final.json；服务运行地址已核实 |

新界面模拟13情景：正常/C空、go、hold、unavailable、缺资料、过期、模拟上游超时回退、中断、严重天气、空候选、无备选、到达超时、critical人流。类型测试覆盖三口岸、深夜关闭、确定性、匹配队列、经纬度、非法数据、重复ID、五因子缺失、空白/非法日期、请求世代及HTTP失败。只有fixture/mock界面通过，不能替代正式数据场景联调。

浏览器以纽约时区验证香港输入/显示；正常真实本地fixture HTTP响应验证 no-store及fixture包装标记。go/hold/unavailable为mock，normal为decision=null。卡片Enter、地图DOM点击事件、地图库键盘选择按钮、详情summary键盘操作均自动验证，不称为真人键盘体验。5次重复提交仅1请求；旧请求延迟返回不会覆盖新情景；输入改变清空旧结果；500、非JSON、非法契约、15秒超时、网络断开均可重试。正式HTTP404单独识别，未静默回退。

360×844、390×844、768×1024、1280×1000代表视口检查横向溢出、控件44px、路线关键内容，截图保存viewport-*.png。它们是Chromium视口模拟，不是真机手机/平板测试。

axe对normal/go/hold/unavailable各运行WCAG2A/2AA/2.1AA：确定违规均0。初轮提示地图控件div aria-label没有role，已加group修复；最终仍有color-contrast人工判定项（Unicode符号、地图/图片/遮叠背景无法自动计算），详见accessibility.json；没有声称完整无障碍验收。真人视觉、键盘、读屏仍待验证。

首次verify因E独立原型5个未使用变量lint失败，保留verify.log；将该原型目录排除应用lint后通过，不改E的8455源码。首轮浏览器脚本误匹配Next隐藏播报alert及异步焦点，保留browser-first-attempt.log；最终脚本使用页面错误区域并等焦点稳定。产品发现与测试工具问题分开记录。

## 第一阶段遗留逐项复核

| 项目 | 当前实际结果 |
|---|---|
| 空白数字/日期、负数、小数/超界 | 原TripForm修复已包含，自动浏览器重新检查；新正式契约无数值限制字段，没有将空白变零 |
| 非法日历/香港时间 | 新D schema拒绝非法日期，包括ISO Feb30；A parseArriveBy对带时区Feb30仍归一化，证据iso-reproduction.json，待A |
| 重复提交、竞争、旧结果 | 新页面锁+abort+世代+清空；A演示页改输入取消的缺口本次直接修复；第一阶段use-decision修复原样存在 |
| fallback/缺失/错误 | fixture缺失/过期/模拟上游回退、HTTP/网络/非法响应/超时实际自动验证；不把模拟回退当真实供应商停机演练 |
| 键盘/焦点 | 新界面表单首错、结果焦点、卡片及map替代控件、summary；原ScenarioSwitcher真实role=radio，方向键可用；真人尚未做 |
| 费用0 | 原规则为“额外费用上限0”，不是全程免费；实际API排除额外$6的R2而保留R3。新契约无费用字段，未移植免费文案 |
| live日期/更新时间 | 当前health.liveDataConfigured=false，实际live返回fixture，更新2026-10-13 07:30为样本服务日。没有沿用10/7已有live结论；新页面明确回放评估时钟与各来源更新/过期 |
| 中断主路/备选共享影响 | 第一阶段R3矛盾仍复现；A第二阶段演示排除两东铁且无备选；正式组合mock诊断仍可接受共享东铁主备，需B/C正确服务作用域/独立备选，见ISSUES.md |

第一阶段13个D文件逐项：TripForm、DecisionCard、ScenarioSwitcher、DecisionView、use-decision、RouteTimeline、error.tsx、global-error.tsx、vitest.config、frontend-card.test、d-frontend.e2e.mjs这11个与旧源码相同，修复已在A中；globals.css和layout.tsx因二阶段扩展不同，未整包迁移，当前D新样式独立实现并验证，A layout已保留44px链接。旧C切换截止/费用字段不适用于TeamJourneyResult，旧模板/历史报告保留供对照。

准备包10文件与实际包78文件实际存在且已检查目录；实际报告docs/D_QA_RESULTS_2026-10-07.md已读，不作为本次通过证据。保留旧ZIP、第一阶段源码及旧服务。

## 待正式联调/待真人验证

正式HTTP/B/C未接；D示意坐标不是真导航。所有模拟决策/窗口/排队不证明实况准确。真人五人、读屏、真实触控设备、原生缩放、实际上游停机、现场局域网和物理断外网尚未执行，没有虚构反馈或成功率。后续负责人和阻塞条件见ISSUES.md及USER_TEST_SCRIPT.md。
