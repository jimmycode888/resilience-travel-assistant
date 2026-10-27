# D 第二阶段交接 · v2.0 · 2026-10-10

最新基线：`/workspace/八校黑客松/A部分/app`。本次直接在此项目内开发，没有复制新应用，没有覆盖旧交付或 5173/5180/8455 服务。新入口 `/journey-team`；A 原 `/journey` 演示保留。预览端口 5191。

## 已完成

直接消费 A `TeamJourneyResult` 的路线卡/地图/分段/口岸/排队、五因子证据、ETA/定性信心/声明、禁用和超时原因、A 基础推荐及 C 决策各状态、来源/品质/更新/过期提示。Leaflet 转换 [lon,lat]→[lat,lon]；卡片、地图路段及键盘控件联动。不可行卡仅能查看，不表示执行。

按 E v2 + JourneyVisualSpec 落实三档路线风险、几何符号、跨境紫虚线7 7、不可行灰点线2 5、选中7px/非选中4px、非颜色文案、44px控件、12px最小字级。critical 只用于人流。没有增加风险算法等级。

表单香港时间、非法日期、重复提交锁、取消旧请求及世代检查、改输入清空旧结果、15秒超时、网络/HTTP/非法响应错误及重试。A 演示页同类请求竞争也已修复。保存自动化证据及当前五人任务材料；未生成真人记录。

## 文件及接入

- 新增 `src/components/d-team/`：contract.ts、client.ts、fixtures.ts、scenarios.ts、presentation.ts、TeamPlanner.tsx、TeamMap.tsx、TeamResults.tsx。
- 新增 `src/app/journey-team/page.tsx`、team.css；`src/app/api/d-team-fixture/route.ts`。
- 新增 `src/test/d-team.test.ts`、d-team-upstream-review.test.ts、d-team.e2e.mjs。
- 修改 `src/components/JourneyPlanner.tsx`（D 请求/展示修复）；`eslint.config.mjs`（仅将独立 E 静态原型排除出 Next 应用 lint）。
- 文档、截图、日志、响应复现、SHA清单、测试脚本/任务/空表：`docs/d-phase2-2026-10-10/`。具体清单见 delivery-manifest.json。A/B/C共享类型、算法、数据、E 原型内容没有修改。

`TeamPlanner` 默认调用显式 `/api/d-team-fixture`，包装 `{kind:'d-team-fixture-v1', result:TeamJourneyResult}`。正常 decision=null；其他 C 状态/窗口为 D mock。fixture 数据由 A 服务计算风险和 ETA，但不是正式 B/C 联调；模拟上游逾时仅用于提示测试。回放 evaluatedAt 为输入出发前一分钟，不是当前实况更新时间。

正式模式只调用 `/api/team-journey` 并严格解码直接 `TeamJourneyResult`；目前 404，明示待接线，不自动换演示响应。A 可在服务端校验 TeamJourneyRequest、调用 createTeamJourneyService（注入正式 B/C）并返回结果，设置 Cache-Control:no-store、捕获异常、保持凭证服务端。D schema 是消费端验证，不替代 B 的外部数据清洗。`/api/journey` 仍是 JourneyAnalysis，不能强转。

C decision=null 明示未接入；不生成行动窗口/切换期限。C go、备选或 A 排序若 meetsDeadline=false 会标明超时，不能当准时承诺。未显示 ruleScore/rankScore 百分比或额外费用预测。仅匹配口岸的 envelope 排队覆盖 segment 队列，与 A ETA 使用相同优先级。

## 给 A 的合并步骤

1. 保留当前应用；对照 baseline-sha256.json 与新增文件清单检查冲突。交付 ZIP 只含 D 的新增/修改文件及证据，不能作为整包替换应用。
2. 新文件按 ZIP 的 app/ 下相对路径合入；两个已有文件优先审阅 `D_PHASE2_EXISTING.patch`。基线已变化时手动合并，不盲目覆盖。
3. 依赖清单未修改，不额外安装应用包。执行 typecheck、团队/D测试、verify、smoke、浏览器脚本。浏览器 QA 用环境已有 Playwright/axe，不进入应用依赖。
4. A 服务端正式 API 就绪后再选择正式模式验证；不要把 fixture 包装响应放到正式端点，不把例子中的保守 mock decide 当 C 正式模型。
5. 源目录启动：`npm run start -- --hostname 0.0.0.0 --port 5191`。端口已占用则使用现有 D 服务；未知服务不停止。Tutti 保存命令见 VERSION.json。

## 界面范围与 E 原型差异

8455 为已核对的固定值设计原型。D 新正式契约界面没有照搬其固定路线、风险值、排队、连续回放、Best Departure/Plan C 等扩展。正式契约仅支持 C departureWindow、backupRouteIds、explanations/notices；不支持旧 action/switchDeadline/basis/uncertainty 的整包套用。A 演示页仍保留搜索/定位/选点/回放作为对照，没有称这些为正式 B/C 界面接入。

验证与限制见 QA_RESULTS.md；问题与分工见 ISSUES.md；真人准入和操作步骤见 USER_TEST_SCRIPT.md。正式联调及真人验证未完成，D 整体任务不能标“全部验收完成”。
