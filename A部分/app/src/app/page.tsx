import Link from "next/link";
import { redirect } from "next/navigation";
import { TripForm } from "@/components/TripForm";
export default function HomePage() {
  if (process.env.NEXT_PUBLIC_PHASE1_URL) redirect(process.env.NEXT_PUBLIC_PHASE1_URL);
  return <div className="mx-auto max-w-3xl"><Link href="/journey" className="mb-5 flex items-center justify-between rounded-2xl bg-cyan-950 p-5 text-white"><span><strong>第二階段 · 港深跨境行程</strong><span className="mt-1 block text-sm text-cyan-100">地圖選點、風險比較、出發窗口與 Plan B</span></span><span aria-hidden="true">→</span></Link><TripForm /></div>;
}
