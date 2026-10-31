import { getSeedCatalog } from "../shared/seed";
import {
  toPublicCatalog,
  validateCatalog,
  type Catalog,
  type StorageKind,
} from "../shared/catalog";

export type CatalogStore = {
  backend: "kv" | "file";
  available: boolean;
  get(): Promise<string | null>;
  put(value: string): Promise<void>;
};

export type ApiDeps = {
  store: CatalogStore;
  adminPassword: string | undefined;
};

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const BODY_LIMIT = 512 * 1024;
const encoder = new TextEncoder();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type LoadedCatalog = {
  catalog: Catalog;
  storage: StorageKind;
  persistent: boolean;
  warning?: string;
};

export async function handleApi(request: Request, deps: ApiDeps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const started = Date.now();
  try {
    const response = await route(path, request, deps);
    logRequest(request, path, response.status, started);
    return response;
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "服务器内部错误";
    if (!(error instanceof HttpError)) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "api.unhandled",
          path,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
    const response = json({ error: message }, status);
    logRequest(request, path, status, started);
    return response;
  }
}

async function route(path: string, request: Request, deps: ApiDeps): Promise<Response> {
  if (path === "/api/catalog" && request.method === "GET") {
    const loaded = await loadCatalog(deps.store);
    return json(toPublicCatalog(loaded.catalog), 200, {
      "cache-control": "no-store",
    });
  }
  if (path === "/api/admin/session" && request.method === "POST") {
    return createSession(request, deps);
  }
  if (path === "/api/admin/catalog" && request.method === "GET") {
    await assertAdmin(request, deps);
    return json(await loadCatalog(deps.store), 200, { "cache-control": "no-store" });
  }
  if (path === "/api/admin/catalog" && request.method === "PUT") {
    await assertAdmin(request, deps);
    return writeCatalog(request, deps);
  }
  if (path === "/api/admin/import" && request.method === "POST") {
    await assertAdmin(request, deps);
    return writeCatalog(request, deps);
  }
  if (path === "/api/admin/export" && request.method === "GET") {
    await assertAdmin(request, deps);
    const loaded = await loadCatalog(deps.store);
    return new Response(JSON.stringify(loaded.catalog, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="software.json"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  if (path === "/api/admin/reset" && request.method === "POST") {
    await assertAdmin(request, deps);
    assertPersistent(deps.store);
    const catalog = getSeedCatalog();
    await deps.store.put(JSON.stringify(catalog));
    return json(
      {
        catalog,
        storage: deps.store.backend,
        persistent: true,
      },
      200,
      { "cache-control": "no-store" },
    );
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  return json({ error: "未找到接口" }, 404);
}

async function createSession(request: Request, deps: ApiDeps): Promise<Response> {
  const password = deps.adminPassword?.trim();
  if (!password) {
    throw new HttpError(503, "尚未配置 ADMIN_PASSWORD，管理后台暂时无法登录。");
  }
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    throw new HttpError(429, "尝试过于频繁，请稍后再试。");
  }
  const body = await readJson(request);
  const provided = isRecord(body) && typeof body.password === "string" ? body.password : "";
  if (provided.length < 1 || provided.length > 256) {
    noteFailure(ip);
    throw new HttpError(401, "密码不正确");
  }
  const matches = await passwordsEqual(provided, password);
  if (!matches) {
    noteFailure(ip);
    throw new HttpError(401, "密码不正确");
  }
  loginAttempts.delete(ip);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const token = await createToken(password, expiresAt);
  return json({ token, expiresAt }, 200, { "cache-control": "no-store" });
}

async function writeCatalog(request: Request, deps: ApiDeps): Promise<Response> {
  assertPersistent(deps.store);
  const body = await readJson(request);
  const result = validateCatalog(body);
  if (!result.ok) {
    throw new HttpError(400, result.errors.slice(0, 8).join("；"));
  }
  const catalog: Catalog = {
    ...result.catalog,
    updatedAt: new Date().toISOString(),
  };
  await deps.store.put(JSON.stringify(catalog));
  return json(
    { catalog, storage: deps.store.backend, persistent: true },
    200,
    { "cache-control": "no-store" },
  );
}

async function loadCatalog(store: CatalogStore): Promise<LoadedCatalog> {
  if (!store.available) {
    return {
      catalog: getSeedCatalog(),
      storage: "seed",
      persistent: false,
      warning: "未绑定 SOFTWARE_KV，当前展示种子数据，修改无法保存。",
    };
  }
  try {
    const raw = await store.get();
    if (!raw) {
      return {
        catalog: getSeedCatalog(),
        storage: "seed",
        persistent: true,
        warning: "存储里还没有目录。保存后会写入，并从此以存储为准。",
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const result = validateCatalog(parsed);
    if (!result.ok) {
      console.error(
        JSON.stringify({ level: "error", msg: "catalog.invalid", errors: result.errors }),
      );
      return {
        catalog: getSeedCatalog(),
        storage: "seed",
        persistent: true,
        warning: "存储中的数据无法解析，当前展示种子数据。保存将覆盖存储。",
      };
    }
    return { catalog: result.catalog, storage: store.backend, persistent: true };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "catalog.read_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      catalog: getSeedCatalog(),
      storage: "seed",
      persistent: store.available,
      warning: "读取存储失败，当前展示种子数据。",
    };
  }
}

function assertPersistent(store: CatalogStore): void {
  if (!store.available) {
    throw new HttpError(503, "未绑定 SOFTWARE_KV，当前只能读取种子数据，无法保存。");
  }
}

async function assertAdmin(request: Request, deps: ApiDeps): Promise<void> {
  const password = deps.adminPassword?.trim();
  if (!password) {
    throw new HttpError(503, "尚未配置 ADMIN_PASSWORD，管理后台暂时无法使用。");
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const token = match?.[1] ?? "";
  if (token.length < 16 || token.length > 512 || !(await verifyToken(token, password))) {
    throw new HttpError(401, "登录已失效，请重新输入密码。");
  }
}

async function createToken(secret: string, expiresAt: number): Promise<string> {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ exp: expiresAt })));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = await sign(payload, secret);
  if (!(await fixedEqual(signature, expected))) return false;
  try {
    const json = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as {
      exp?: unknown;
    };
    return typeof json.exp === "number" && json.exp > Date.now();
  } catch {
    return false;
  }
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function passwordsEqual(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(left), new Uint8Array(right));
}

async function fixedEqual(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(left), new Uint8Array(right));
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  const subtle = crypto.subtle as unknown as {
    timingSafeEqual?: (a: Uint8Array, b: Uint8Array) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(left, right);
  }
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await readLimitedText(request, BODY_LIMIT);
  if (!text) throw new HttpError(400, "请求体为空");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "JSON 无法解析");
  }
}

async function readLimitedText(request: Request, limit: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "请求体过大");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

function isRateLimited(ip: string): boolean {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= 8;
}

function noteFailure(ip: string): void {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    current.count += 1;
  }
  if (loginAttempts.size > 1000) {
    for (const [key, value] of loginAttempts) {
      if (value.resetAt < now) loginAttempts.delete(key);
    }
  }
}

function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(JSON.stringify(data), { status, headers });
}

function logRequest(request: Request, path: string, status: number, started: number): void {
  console.log(
    JSON.stringify({
      level: status >= 500 ? "error" : "info",
      msg: "api.request",
      method: request.method,
      path,
      status,
      ms: Date.now() - started,
    }),
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
