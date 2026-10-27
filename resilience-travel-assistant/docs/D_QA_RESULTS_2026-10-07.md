# D 前端与 QA 实际交付（2026-10-07）

## 源码访问与版本

实际项目：`/workspace/八校黑客松/resilience-travel-assistant`；工作目录不是原任务说明中的 macOS 路径。终端运行 pwd、读取指定 README/API_CONTRACT/INTEGRATION/package/TripForm 成功；test -w 与实际保存 D_HANDOFF 均确认源码可读写。Node v24.18.0，项目0.1.0，Next15.5.27，React19.2.0。无 Git 元数据，不能提供提交号。源文件摘要见 d-qa-2026-10-07/source-sha256.json，构建ID见下方。

附件内容已完整读取，原始压缩包校验为 `5603909e004fc06a3945b3c64beba0e8b27478de1d867fd4c60e15d3dcfbf1e8`。开始时房间 artifact 列表未包含 D 包，复制到项目后只发布这一份。项目 README 未覆盖；附件 README 保存为 D_HANDOFF.md。同名 QA_CHECKLIST/USER_TEST_SCRIPT 先读取并保留全部旧文，再追加准备包；新执行记录按日期追加。既有截图与 A/B/C/E 文档保留。

## 实现与修改范围

- DecisionCard：以锁定状态与时间展示核心建议，附加摘要、数组、来源或请求回显缺失仍安全；Plan B 从锁定步骤展示，无备用路线有明确提示。不推算或编造路线/时间。
- TripForm：空数字不转0；整数、范围、真实日期验证；香港 datetime-local 显示及 ISO +08:00 传输；输入保留、错误关联和首错焦点；提交反馈与重复操作保护。
- ScenarioSwitcher：单一Tab入口，四方向键循环、Home/End；保留文字状态与演示语义。
- DecisionView/use-decision：核心卡前置，避免原始JSON等技术操作抢占第一屏；新请求先显示加载，取消旧请求，状态绑定请求与重查标识，禁用加载期间重复操作。
- 样式与边界：44px按钮及页头/页尾链接、加深时间轴与情景提示小字、长URL换行；保留错误边界但不把内部错误信息显示给用户。HTTP400仍展示字段详情，500/网络/未知异常仅显示可读错误。
- 组件契约回归4项；Vitest启用React自动JSX运行时；浏览器验证脚本可重复运行。没有修改 B 适配器、C 决策规则、A 类型/契约/API客户端、package依赖或E设计文件。

修改文件（13项）：
- `src/components/TripForm.tsx`
- `src/components/DecisionCard.tsx`
- `src/components/ScenarioSwitcher.tsx`
- `src/components/DecisionView.tsx`
- `src/components/use-decision.ts`
- `src/components/RouteTimeline.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `vitest.config.ts`
- `src/test/frontend-card.test.ts`
- `src/test/d-frontend.e2e.mjs`

完整前后差异见 D_FRONTEND.patch；打包时仅选D修改文件、D文档和证据，不含密钥、环境文件、node_modules、.next、tsbuildinfo或构建缓存。

## 实际执行结果

| 检查 | 本次结果与证据 |
|---|---|
| npm run verify | 最终退出0：lint/typecheck/15个测试文件169项/build全部通过；verify-final.log |
| npm run smoke | 退出0：2项测试，3情景各5次规则层调用，共15次稳定；smoke.log |
| 浏览器端到端 | 20组全部通过；browser-results.json/browser.log（这是开发QA自动化，不是真人测试） |
| 页面三情景各连续5次 | 15次正常；包含表单、情景切换、重查、刷新；normal08:09高R1/R2、heavy_rain07:58中R1/R2、disruption07:22低uncertain R2/R3；ETA也与实际API核对 |
| 完整状态 | 实际API正常/暴雨/中断/05:45 unavailable；2.5秒加载、500、最小回应、附加缺失/空数组、空PlanB、非JSON/契约不符在浏览器route注入；400来自实际API错误响应再用于UI验证 |
| 输入与重复操作 | 空日期/空数字、-1/小数/超界/合法0与最大边界；错误焦点/保留值；提交和重查各快速5次各只有一次新请求 |
| 导航与键盘 | 输入页方向键/Home/End、Enter提交；另以真实Tab/Enter键盘事件完成提交→情景→重查500→重试恢复（keyboard-walk.json）；返回/前进/刷新/分享URL；非法URL提示与默认值处理 |
| 响应式 | Chromium视口360/390/768/1280 × 三情景，12组无溢出、核心出发/信心/切换标题在844px首屏内；核心按钮≥44px |
| 长文本 | 实际live响应360px无溢出，修复前scrollWidth410，修复后360 |
| 200% | CSS zoom=2时可操作且无横向溢出；未冒充浏览器原生缩放/实际设备验收 |
| 自动可访问性 | axe WCAG2A/2AA/2.1AA审计输入、正常、uncertain、unavailable页面，0违反、0待人工判定；accessibility.json。不是读屏实测 |
| 浏览器断网 | context.setOffline(true)后重查显示NETWORK_ERROR；恢复在线后重试成功，不声称浏览器无API离线查询可用 |
| 上游回退 | 现有API/适配器测试实际执行：provider失败/逾时/无来源→fixture，有缓存→cached；这是依赖注入测试，未物理断外网或控制真实上游停机 |
| live实时尝试 | 当前环境实际配置了来源，UI显示实时资料与uncertain低信心，源时间来自10月7日；不是文档旧版本的“未配置回退”。详见FRONTEND_CONTRACT_ISSUES |
| 异常 | 全部流程未捕获的浏览器异常0；错误提示不外露注入的内部路径 |

首次 verify 的build失败（旧缓存权限EACCES）保留在verify.log；旧缓存移名为.next-d-before-20261007后重新构建成功。工具定位/JSX测试配置问题与产品复现分开记录，见BASELINE_REPRODUCTION.md。历史165项通过不是本次最终169项结果的替代品。

## 运行与复核

```bash
cd /workspace/八校黑客松/resilience-travel-assistant
npm run verify
npm run smoke
npm run start -- --hostname 0.0.0.0 --port 5180
# Node需要能解析playwright（本VM已有）；axe仅作外部QA工具，不加入应用依赖
npm install --prefix /tmp/d-qa-tools axe-core --no-audit --no-fund
D_QA_URL=http://localhost:5180 D_QA_AXE_PATH=/tmp/d-qa-tools/node_modules/axe-core/axe.min.js node src/test/d-frontend.e2e.mjs
```

本次生产QA服务已运行并HTTP验证：http://localhost:5180/。继续使用原项目同一目录，没有另建应用或正式部署。原房间5173预览保留且仍为旧构建，不能用它声称本次修复已上线；队长集成后自行更新原预览。启动命令若端口已占用不要再启动；当前QA服务保持运行。

## 之前跳过、仍未完成与所需配合

- 原包跳过的源码访问、实现、运行联调、verify/smoke、三情景页面操作与视口/键盘自动检查，本次已补做。
- **你（D）**：邀请五位真实、未参与开发的用户执行10月13日测试，填USER_TEST_RECORDS.csv/USER_TEST_SUMMARY.csv。当前45条任务记录仍为未执行、汇总实际值为空，不能模拟。另需真实手机/平板浏览器触控、原生200%缩放、实际读屏及真人键盘体验；自动化键盘检查不能替代真人验收。
- **A**：统一附加字段的可选类型与isActionable；登记C新增字段，确认额外费用0语义；更新原预览并复核缓存权限；确认现场本机与手机的网络连接和演示备份。接口问题均在FRONTEND_CONTRACT_ISSUES，无代发消息。
- **B**：核对目前live真实来源、混合品质标记与10月7日来源用于未来服务日的说明；提供可控的真实上游失败演练条件。未改数据适配器。
- **C**：和A核对action/switchDeadline/basis/uncertainty字段登记、当前切换截止与未来日期限制文案。未改决策规则和黄金文件。
- **E**：基于现有结构稿与10月6日评审已完成核心顺序调整；需提供/确认最新批准视觉稿及真实设备走查，尤其长切换文案和Plan B理解。未自行建立新视觉系统。
- **A/你/E**：在演示笔记本实际断外网而保留localhost连接的彩排、手机局域网访问、录屏备份、线上正式环境与10月16日彩排未执行。浏览器断网不等同物理断外网；不擅自加ServiceWorker架构。

当前无已知尚未修复的D可复现P0/P1；A的契约及文档确认仍开放。D专属任务整体不能标完成：五人测试、真实设备和现场演练仍未完成。

当前构建ID：`NcKJZyS4pSSPjX2-T6DQt`；浏览器：148.0.7778.96；最终浏览器执行时间：2026-10-07T10:12:28.168Z。
