/**
 * API 錯誤結構（穩定契約）。
 *
 * 每個錯誤都必須有可讀訊息與穩定結構，前端才不需要猜測失敗原因。
 */
export const API_ERROR_CODES = [
  "INVALID_INPUT",
  "METHOD_NOT_ALLOWED",
  "INTERNAL_ERROR",
  "FAULT_INJECTION_DISABLED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: string[];
  };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details: readonly string[] = [],
): ApiErrorBody {
  return { error: { code, message, details: [...details] } };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate !== "object" || candidate === null) return false;
  const code = (candidate as { code?: unknown }).code;
  return typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code);
}
