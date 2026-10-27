import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { parseArriveBy } from "@/lib/time";
import type { Incident } from "@/lib/types";
const messageSchema = z.object({ ID: z.string().min(1), INCIDENT_NUMBER: z.string().min(1), INCIDENT_STATUS_EN: z.enum(["NEW", "UPDATED", "CLOSED"]), ANNOUNCEMENT_DATE: z.string(), INCIDENT_HEADING_CN: z.string(), LOCATION_CN: z.string(), CONTENT_CN: z.string().min(1) });
/** Location/title matching identifies relevant bulletins, never confirms a route delay. */
const corridorTerms = /坑口|將軍澳|北角|鰂魚涌|中環|東區海底隧道|東隧|將藍隧道|寶寧路|干諾道中|落馬洲|羅湖|深圳灣|香園圍|蓮塘|皇崗|文錦渡|東鐵|上水|港珠澳/;
export function normalizeTrafficNews(xml: string): Incident[] {
  if (xml.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported traffic XML");
  if (XMLValidator.validate(xml) !== true) throw new Error("Malformed traffic XML");
  const parser = new XMLParser({ parseTagValue: false, ignoreAttributes: true, processEntities: false, isArray: (name) => name === "message" });
  const raw: unknown = parser.parse(xml);
  const feed = z.object({ list: z.union([z.literal(""), z.object({ message: z.array(messageSchema).optional() })]) }).parse(raw);
  const messages = typeof feed.list === "string" ? [] : feed.list.message ?? [];
  return messages.filter((m) => m.INCIDENT_STATUS_EN !== "CLOSED" && corridorTerms.test(m.LOCATION_CN + m.INCIDENT_HEADING_CN + m.CONTENT_CN)).map((m) => {
    const parsed = parseArriveBy(m.ANNOUNCEMENT_DATE);
    if (!parsed.ok) throw new Error("Invalid traffic announcement time");
    return { id: `TD-${m.INCIDENT_NUMBER}-${m.ID}`, kind: "other" as const, title: m.INCIDENT_HEADING_CN + (m.LOCATION_CN ? `：${m.LOCATION_CN}` : ""), detail: `${m.CONTENT_CN}（運輸署公告；公告時間不等於事件首次發生時間；對候選路線影響未確認。）`, since: parsed.iso };
  });
}
