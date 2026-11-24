
const API = import.meta.env.VITE_API_URL || "";
const SESSION_KEY = "medbridge.session";

export function getToken() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(SESSION_KEY, token);
  else sessionStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const apiUnavailable = "The MedBridge API is unavailable. Restart FastAPI and Vite using the run instructions in README.md.";

function hasJson(response: Response) {
  return response.headers.get("content-type")?.includes("application/json") ?? false;
}

function validationMessage(detail: unknown): string {
  if (!Array.isArray(detail)) return "";
  const messages = detail.flatMap((issue: { loc?: unknown; msg?: unknown } | null) => {
    if (typeof issue?.msg !== "string") return [];
    const field = Array.isArray(issue.loc) ? issue.loc[issue.loc.length - 1] : undefined;
    return typeof field === "string" && field !== "body"
      ? [field.replace(/_/g, " ") + " ? " + issue.msg]
      : [issue.msg];
  });
  return [...new Set(messages)].join(". ");
}

async function request(path: string, options?: RequestInit, token = getToken()) {
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", "Bearer " + token);
  let response: Response;
  try {
    response = await fetch(API + path, { ...options, headers });
  } catch (failure) {
    if (options?.signal?.aborted || !(failure instanceof TypeError)) throw failure;
    throw new ApiError(0, apiUnavailable);
  }
  if (!response.ok) {
    const body: { detail?: unknown } = hasJson(response) ? await response.json().catch(() => ({})) : {};
    const detail = typeof body?.detail === "string" ? body.detail : "";
    if (!hasJson(response) || (response.status === 404 && path.startsWith("/api/auth/") && (!detail || detail === "Not Found"))) {
      throw new ApiError(response.status, apiUnavailable);
    }
    const message = detail || validationMessage(body?.detail) || "The request failed (HTTP " + response.status + ").";
    throw new ApiError(response.status, message);
  }
  return response;
}

export async function api<T>(path: string, options?: RequestInit, token = getToken()): Promise<T> {
  const response = await request(path, options, token);
  if (!hasJson(response)) throw new ApiError(response.status, apiUnavailable);
  return response.json();
}

export async function fileBlob(path: string): Promise<Blob> {
  return (await request(path)).blob();
}

export function jsonRequest(method: string, payload: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
