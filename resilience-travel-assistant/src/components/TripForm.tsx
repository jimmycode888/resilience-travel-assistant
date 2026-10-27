"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { DESTINATIONS, ORIGINS } from "@/lib/corridor";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { parseArriveBy, zonedPartsFromEpoch } from "@/lib/time";
import { SCENARIO_LABELS } from "@/lib/labels";
import { buildResultPath } from "@/lib/url-params";
import { MAX_ALLOWED_TRANSFERS, MAX_EXTRA_COST_HKD } from "@/lib/validation";
import type { Scenario, TripRequest } from "@/lib/types";
import { ScenarioSwitcher } from "./ScenarioSwitcher";

/**
 * 行程輸入頁（成員 D 的模組）。
 * 提交後把 TripRequest 編進 URL 並前往結果頁，因此結果永遠可重現、可分享。
 */
export function TripForm({ initialRequest = DEMO_REQUEST }: { initialRequest?: TripRequest }) {
  const router = useRouter();
  const [origin, setOrigin] = useState(initialRequest.origin);
  const [destination, setDestination] = useState(initialRequest.destination);
  const parsedInitial = parseArriveBy(initialRequest.arriveBy);
  const initialParts = parsedInitial.ok ? zonedPartsFromEpoch(parsedInitial.epochMs) : null;
  const [arriveBy, setArriveBy] = useState(initialParts ? `${initialParts.date}T${initialParts.time}` : initialRequest.arriveBy);
  const [maxExtraCost, setMaxExtraCost] = useState(String(initialRequest.constraints.maxExtraCost));
  const [maxTransfers, setMaxTransfers] = useState(String(initialRequest.constraints.maxTransfers));
  const [scenario, setScenario] = useState<Scenario>(initialRequest.scenario);
  const [errors, setErrors] = useState<string[]>([]);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const issues: string[] = [];
    const fields: string[] = [];
    const parsedTime = parseArriveBy(arriveBy);

    if (!parsedTime.ok) {
      issues.push("請輸入有效的最遲到達時間（香港時間）。");
      fields.push("arriveBy");
    }

    const cost = Number(maxExtraCost);
    if (maxExtraCost.trim() === "" || !Number.isInteger(cost) || cost < 0 || cost > MAX_EXTRA_COST_HKD) {
      issues.push(`額外車費上限必須是 0–${MAX_EXTRA_COST_HKD} 的整數（必填）。`);
      fields.push("maxExtraCost");
    }

    const transfers = Number(maxTransfers);
    if (maxTransfers.trim() === "" || !Number.isInteger(transfers) || transfers < 0 || transfers > MAX_ALLOWED_TRANSFERS) {
      issues.push(`轉乘次數上限必須是 0–${MAX_ALLOWED_TRANSFERS} 的整數（必填）。`);
      fields.push("maxTransfers");
    }

    if (issues.length > 0) {
      setErrors(issues);
      setInvalidFields(fields);
      event.currentTarget.querySelector<HTMLInputElement>(`#${fields[0]}`)?.focus();
      return;
    }

    setErrors([]);
    setInvalidFields([]);
    submitting.current = true;
    startTransition(() => router.push(
      buildResultPath({
        origin,
        destination,
        arriveBy: parsedTime.ok ? parsedTime.iso : arriveBy,
        constraints: { maxExtraCost: cost, maxTransfers: transfers },
        scenario,
      }),
    ));
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <section className="card">
        <h1 className="text-lg font-semibold text-slate-900">你的行程</h1>
        <p className="mt-1 text-sm text-slate-600">
          首版只支援一條固定通勤走廊。選擇起點、終點與最遲到達時間，系統會直接告訴你幾點走、走哪條、
          什麼時候切換。
        </p>
      </section>

      <section className="card">
        <fieldset>
          <legend className="field-label">起點</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ORIGINS.map((place) => (
              <label
                key={place.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm ${
                  origin === place.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="origin"
                  value={place.id}
                  checked={origin === place.id}
                  onChange={() => setOrigin(place.id)}
                  className="h-4 w-4"
                />
                <span>{place.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card">
        <fieldset>
          <legend className="field-label">終點</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DESTINATIONS.map((place) => (
              <label
                key={place.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm ${
                  destination === place.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="destination"
                  value={place.id}
                  checked={destination === place.id}
                  onChange={() => setDestination(place.id)}
                  className="h-4 w-4"
                />
                <span>{place.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="arriveBy">
            最遲到達時間（香港時間）
          </label>
          <input
            id="arriveBy"
            aria-invalid={invalidFields.includes("arriveBy")}
            aria-describedby={invalidFields.includes("arriveBy") ? "trip-errors" : undefined}
            className="field-input"
            type="datetime-local"
            value={arriveBy}
            onChange={(event) => setArriveBy(event.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            示範資料以 {DEMO_REQUEST.arriveBy.slice(0, 10)} 為服務日樣本；你仍然可以選擇其他日期。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="maxExtraCost">
              可接受的額外車費（HKD）
            </label>
            <input
              id="maxExtraCost"
            aria-invalid={invalidFields.includes("maxExtraCost")}
            aria-describedby={invalidFields.includes("maxExtraCost") ? "trip-errors" : undefined}
              className="field-input"
              type="number"
              min={0}
              max={MAX_EXTRA_COST_HKD}
              step={1}
              inputMode="numeric"
              value={maxExtraCost}
              onChange={(event) => setMaxExtraCost(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">設為 0 會排除需要額外車費的巴士方案。</p>
          </div>

          <div>
            <label className="field-label" htmlFor="maxTransfers">
              可接受的轉乘次數
            </label>
            <input
              id="maxTransfers"
            aria-invalid={invalidFields.includes("maxTransfers")}
            aria-describedby={invalidFields.includes("maxTransfers") ? "trip-errors" : undefined}
              className="field-input"
              type="number"
              min={0}
              max={MAX_ALLOWED_TRANSFERS}
              step={1}
              inputMode="numeric"
              value={maxTransfers}
              onChange={(event) => setMaxTransfers(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">設為 0 只考慮全程免轉乘的路線。</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="field-label">演示情景</h2>
        <ScenarioSwitcher value={scenario} onChange={setScenario} />
        <p className="mt-2 text-xs text-slate-500">
          目前選擇：{SCENARIO_LABELS[scenario]}。三個情景使用固定演示資料，結果可重複驗證。
        </p>
      </section>

      {errors.length > 0 ? (
        <div className="card border-rose-200 bg-rose-50" role="alert" id="trip-errors">
          <h2 className="text-sm font-semibold text-rose-900">請先修正以下問題</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-rose-800">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button className="btn-primary" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "正在前往出行建議…" : "取得出行建議"}
      </button>

      <p className="text-center text-xs text-slate-500">
        結果頁的網址包含完整行程，因此重新整理或分享連結都會得到相同建議。
      </p>
    </form>
  );
}

export function ResultLink({ request }: { request: TripRequest }) {
  return (
    <Link className="btn-secondary inline-flex items-center" href={buildResultPath(request)}>
      查看示範結果
    </Link>
  );
}
