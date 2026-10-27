# 预览 UI 资源恢复 · 2026-10-15

5191 的 `/journey-team` HTML 返回 200，但引用的 CSS/JS 返回 400。运行进程保留旧构建 `8wTbNgfu0WX2RLcxwkVxE`，其 `.next/static` 已缺失；磁盘当前生产构建位于 `.next-b`。仅检查 HTML 状态无法发现此次故障。

在原目录、原端口恢复 `.next/static` 的生产资源，来源为现有 `.next-b/static`。旧 HTML 引用的共享 chunk `354-d0a2603563b05695.js` 使用当前 chunk `354-d99baa8f6295fdb4.js` 的兼容模块恢复入口；其余首屏资源文件名与当前构建一致。没有终止其他会话进程或创建第二个服务。旧进程重启后应使用 next.config.ts 的默认 `.next-b` 完整构建，不应继续依赖旧入口。

验证：`node scripts/check-preview.mjs http://localhost:5191`，首页、`/journey`、`/journey-team` 的全部首屏 CSS/JS 均返回 200 且 MIME 正确。浏览器实际提交比较成功，显示三条路线，Leaflet 地图与折线正常，未记录 JavaScript 异常。1280px 与 390px 视口无水平溢出。

本次恢复 UI，不代表部署最新正式 API；旧进程的 `/api/team-journey` 仍为 404，测试 fixture 模式仍明确标示。后续构建不要删除正在运行版本的静态资源，发布验收需运行资源检查脚本及浏览器交互检查。

## 底图 403 后续修复

用户截图确认 `/journey` 的 OSM 底图返回 Access blocked，而非地图容器未显示。之前仅验证 `/journey-team` 的本地访问，不能证明用户嵌入式预览可访问 OSM。具体封禁原因未知；OSM 官方要求有效 Referer，不能把嵌入环境限制排除在外。

两个地图组件改为共享 `src/lib/geo/basemap.ts`，使用 Esri World Street Map，并设置 `strict-origin-when-cross-origin` 和完整来源署名。该服务为参考底图，属旧版服务，数据并非实时，官方计划于 2029 年 12 月退役；正式产品需规划维护中的底图服务。

为立即修复原端口运行的旧预览，同步替换 `.next/static/chunks/45.e7cd36c79d06d2bf.js` 与 `811.e8365bb1e2cebc84.js` 内的底图 URL、来源署名及 referrerPolicy。只修改这两个地图组件的底图配置，不改变模块编号及路由逻辑。当前 `.next-b` 原构建未改写；后续重新 build 会从修复后的源码产生完整新构建。已有浏览器需强制刷新，避免 immutable 静态资源缓存。

验证：类型检查与三份修改源码的 ESLint 通过；`/journey` 浏览器实际显示街道底图，15 张可见瓦片正常加载；单独使用 no-referrer 的图片请求仍成功（256px）。验证截图为 `map-source-fixed-2026-10-15.png`。UI 资源检查脚本三页通过。OSM 政策：https://operations.osmfoundation.org/policies/tiles/ 。Esri 服务退役说明：https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/announcements/sunsetting-legacy-basemaps 。
