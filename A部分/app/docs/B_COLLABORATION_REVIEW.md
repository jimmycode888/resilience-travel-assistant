# B 与 C、E 对接核查及数据补齐

角色依用户确认：C 历史契约会话属于 C 负责人；UI 评审属于 E。当前文件核查不代表已发送远端消息或收到双向确认。

## C：能对接，但有需要 A 批准的差异

现行 ContextSnapshot + camelCase 坑口—中环契约可直接供 C 使用。C 的 action、basis、uncertainty、switchDeadline 已在主体实现，交通 unknown 的额外 5 分钟政策、严重天气露天候车 wait 规则已有实现和测试。请以主体代码为准，C 的原稿 snake_case 和屯门—九龙西占位不能直接拼接。

| 问题 | B 可提供什么 | C/A 要决定什么 |
|---|---|---|
| headway_min、ETA | 新增 B 内部 TransportTimeBoard，提供逐站 arrival.at、updatedAt、expiresAt、sourceUrl；没有事实就空数组 | 下一班 ETA 不是未来通勤班距，不直接覆盖 typicalWaitMinutes |
| signal_level / issued_at | HKO warnsum 有 signal code、issueTime，现行 weather.warning 已保留生效警告名称 | 新增结构化 signalLevel/issuedAt 需 A 改共享契约；updatedAt 不等于 issuedAt，旧接入说明“已等价”需修正 |
| pre_announce_at | 当前 warnsum 不提供该字段；不编造、不以 issueTime 代替 | 如确有历史预告需要，应另核对 warningInfo/公告文本并区分发布时间与预计生效时间 |
| incidents 首次报道时间 | TD ANNOUNCEMENT_DATE 是本条公告时间，UPDATED 消息可能变更它 | 不能作为首次事件时间训练；应另设计历史采集与版本保存。本次不保存用户位置 |
| unknown / degraded | route.status=unknown，delayMinutes=0 为契约占位，source 与 note 明示未知 | 目前政策预留 5 分钟不是观测延误；GenAI 必须按 basis 区分 |
| 混合质量 | 天气 live、线路时间 fixture、交通 unknown；有逐来源记录 | A 正式确认顶层质量和逐字段新鲜度，不能把天气刷新理解为交通更新时间 |

## E：可作为设计验收清单，不能作为事实数据表

E 文档对数据质量、时间、异常状态、ETA 区间、切换条件的要求与主体一致，可以供 D 实现；原图和建议草图仍需更新后才能视为完整设计交付。

- 文档中的“692、额外 $12、52 分钟、08:20”是示例，未经本走廊核实，不可复制进真实模式。当前城巴 route/CTB/692 返回空 data；不是一条已核实的现行候选路线。
- 数据徽章需区分“天气实时／交通未确认／行程演示估算”，单独写“实时资料”会误导。
- no_prediction 表示没有预报，不等于停驶；alert 表示上游警示，不等于全线中断。
- action、切换截止时间必须渲染 C 输出，不由前端从公交 ETA 临时计算。

## 已补齐的 B 数据能力

1. 港铁 TKL-HAH 往 NOP、ISL-NOP／ISL-QUB 往 KET 下一班抵站时间；按真实 time 解析香港时区，过滤方向、终点、过去班次和过期响应。官方最新字典将 ttnt、valid 标为 dummy，不用于计算。
2. 城巴 CTB 690S，002910 明德邨，I 方向往中环的 ETA；空值、九巴时段或无资料返回 no_prediction，不虚构班次。只涵盖城巴，仍需九巴数据才能覆盖联营全部班次。
3. 运输署第二代 XML：校验格式，提取走廊关键词相关的非 CLOSED 公告；只报告公告，不根据关键词推算路线停驶或延误。无公告不意味着道路畅通。
4. 独立抵站数据客户端：30 秒复用、2 分钟来源效期、2500ms 超时、缓存→固定无资料回退。主适配器各来源独立超时，不让单源挂起丢掉成功的天气。
5. 官方静态港铁站序／票价核查，存于 docs/data/official-rail-reference.json；实时来源一次实测存于 live-source-check.json。存档有 checkedAt，不能冒充现在。

## 仍需修正的共同问题（具体可审阅）

| 优先级 | 现有假设 | 核查结果／建议 |
|---|---|---|
| P0 | R1 将军澳线坑口—北角中断，R3 经鰂鱼涌仍作 Plan B | 两路线共享坑口—鰂鱼涌区段。若中断覆盖共同区段，R3 同样不可用；仅北角转乘受阻时才是合理替代。请 C 按受影响区段过滤，或把演示事件收窄为北角站局部事件 |
| P1 | R2 坑口北总站直达交易广场 | 690S 官方往中环起站为 002910 明德邨；690 端点为康盛花园。不可只把线路编号填进去。A 需选定 690S 并更新起站、步行段、服务日／班次窗口，再由 B 接入 |
| P1 | R3 坑口→鰂鱼涌 19 分钟，R1 坑口→北角 17 分钟 | 官方站序先到鰂鱼涌再到北角，当前两段时间不一致；需要以官方行程规划或实测修订，不能从 Next Train API 求得行车时间 |
| P1 | 全走廊共用 05:30–23:30 服务窗口 | 各线路／方向不同，港铁坑口官方页面列首末班而非全走廊窗口；690S 是指定时段线路。需按路线和服务日处理，不能把统一窗口当真实时刻表 |
| P1 | 港铁票价与额外费用全部 fixture | 官方 CSV 核查坑口(51)→中环(1)成人八达通 HK$15.80，单程 HK$16.00（以文件核查时刻为准）；公交票价及优惠还需确认，不能据此替换额外费用差值 |
| P1 |黑雨 fixture 的铁路露天段限速描述 | 现行区段性质与该文案尚未核实，演示说明不应暗示真实官方运营事实。请 A/C 将未经核实的事件标为假设，或改为已核查地点 |

## 接入与复现

```ts
import { transportTimeClient } from "@/lib/adapters/transport-times";
const boards = await transportTimeClient.collect(); // 3 个港铁站 + 1 个城巴候选站
```

MTR_NEXT_TRAIN_ENABLED=1 时把铁路抵站观察放入 live snapshot 的 route.note，保留 unknown 状态；未改变决策时间模型。HKO_OPEN_DATA_BASE_URL 和 TD_SPECIAL_TRAFFIC_NEWS_URL 设置官方地址后启用。固定情景始终不联网。

```bash
npx vitest run --config scripts/probe.config.ts
npm run verify
```

数据来源：[港铁 Next Train](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data)、[港铁静态站序票价](https://data.gov.hk/en-data/dataset/mtr-data-routes-fares-barrier-free-facilities)、[城巴 ETA](https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta)、[运输署特别交通消息](https://data.gov.hk/en-data/dataset/hk-td-tis_19-special-traffic-news-v2)、[坑口站服务时间](https://www.mtr.com.hk/en/customer/services/service_hours_search.php?query_type=search&station=51)。本报告没有批准共享契约、修改 A/C/D/E 模块或宣称历史模型已经校准。


## 公交时刻表补充核查

已实际下载并读取 [九巴／城巴 690 官方时刻表（含 690S 特别班次）](https://search.kmb.hk/TD_SS/690S.pdf)，文档日期 2026-03-31。690S 往中环为周一至周五（公众假期除外），明德邨开出 07:30、07:36、07:42、07:48、07:54、08:02、08:10、08:20、08:40、09:00，城巴／九巴交替营运。结构化子集在 official-bus-service-reference.json。

这解释了实测 09:29 后城巴 ETA 为空的可能性，但空 ETA 本身仍不能证明停驶。固定演示 disruption 建议 07:22 出发，与实际首班 07:30 的候车关系需 A/C 在选定起站后重新计算；现有固定 9 分钟候车不是实时事实。


补充：live 天气／下一班抵站只适用于当前短时信息。C/A 应校验行程日期与 snapshot.serviceDate，未来几天的请求不能使用现在的抵站预报或天气当作未来事实。

最终验收：165 项标准测试与 1 项独立联网核查通过；lint、类型检查、生产构建通过，三组情景各连续五次保持稳定。预览已加载公开来源配置，四个 API 情景均 HTTP 200，live 返回 live。
