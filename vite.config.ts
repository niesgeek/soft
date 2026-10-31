import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import { handleApi, type CatalogStore } from "./server/handle";
import { toPublicCatalog } from "./shared/catalog";
import { getSeedCatalog } from "./shared/seed";

const seed = getSeedCatalog();
if (seed.software.length < 40 || seed.software.length > 80) {
  throw new Error(`种子软件数量应为 40–80，当前 ${seed.software.length}`);
}

function loadDevPassword(): string | undefined {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const file = path.resolve(".dev.vars");
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== "ADMIN_PASSWORD") continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

function fileStore(): CatalogStore {
  const file = path.resolve(".data/catalog.json");
  return {
    backend: "file",
    available: true,
    async get() {
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, "utf8");
    },
    async put(value: string) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value);
    },
  };
}

function attachApi(middlewares: Connect.Server) {
  const store = fileStore();
  const adminPassword = loadDevPassword();
  middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const pathname = (req.url || "/").split("?")[0] ?? "/";
    if (pathname === "/software.json") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(toPublicCatalog(getSeedCatalog())));
      return;
    }
    if (!pathname.startsWith("/api/")) {
      next();
      return;
    }
    try {
      const request = await toRequest(req);
      const response = await handleApi(request, { store, adminPassword });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  });
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || "127.0.0.1";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
  }
  const method = req.method || "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(`http://${host}${req.url}`, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Request(`http://${host}${req.url}`, {
    method,
    headers,
    body: Buffer.concat(chunks),
  });
}

function apiPlugin(): Plugin {
  return {
    name: "soft-api",
    configureServer(server: ViteDevServer) {
      attachApi(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attachApi(server.middlewares);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "software.json",
        source: JSON.stringify(toPublicCatalog(getSeedCatalog())),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
});
