/** Deadline also settles when an upstream ignores AbortSignal. */
export async function withDeadline<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: ((error: Error) => void) | undefined;
  const abort = () => { controller.abort(); rejectAbort?.(new Error("資料請求已取消")); };
  outer?.addEventListener("abort", abort, { once: true });
  try {
    const deadline = new Promise<never>((_, reject) => {
      rejectAbort = reject;
      timer = setTimeout(() => { controller.abort(); reject(new Error("資料來源逾時")); }, timeoutMs);
      if (outer?.aborted) abort();
    });
    return await Promise.race([Promise.resolve().then(() => task(controller.signal)), deadline]);
  } finally { if (timer) clearTimeout(timer); outer?.removeEventListener("abort", abort); }
}
