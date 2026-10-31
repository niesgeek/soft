import type { Catalog, PublicCatalog, StorageKind } from "../../shared/catalog";

const TOKEN_KEY = "soft-admin-token";

export type AdminPayload = {
  catalog: Catalog;
  storage: StorageKind;
  persistent: boolean;
  warning?: string;
};

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (init?.auth !== false) {
    const token = getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError("响应无法解析", response.status);
    }
  }
  if (!response.ok) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : `请求失败（${response.status}）`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function loadPublicCatalog(): Promise<PublicCatalog> {
  try {
    return await api<PublicCatalog>("/api/catalog", { auth: false });
  } catch {
    const response = await fetch("/software.json");
    if (!response.ok) throw new ApiError("目录暂时没有加载出来", response.status);
    return (await response.json()) as PublicCatalog;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
