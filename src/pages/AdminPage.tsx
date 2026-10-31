import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  slugify,
  type Catalog,
  type Category,
  type Software,
  type StorageKind,
} from "../../shared/catalog";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ApiError, api, clearToken, getToken, setToken, type AdminPayload } from "../lib/api";
import { TextLink } from "../lib/router";

type CategoryDraft = {
  creating: boolean;
  id: string;
  name: string;
  slug: string;
  description: string;
  sort: string;
  enabled: boolean;
};

type SoftwareDraft = {
  creating: boolean;
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  icon: string;
  downloadUrl: string;
  homepage: string;
  sort: string;
  enabled: boolean;
};

export function AdminPage() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [password, setPassword] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [meta, setMeta] = useState<Pick<AdminPayload, "storage" | "persistent" | "warning"> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [softwareDraft, setSoftwareDraft] = useState<SoftwareDraft | null>(null);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    api<AdminPayload>("/api/admin/catalog")
      .then((payload) => {
        if (cancelled) return;
        applyPayload(payload);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 401) {
          clearToken();
          setAuthed(false);
          return;
        }
        setError(reason instanceof Error ? reason.message : "目录加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function applyPayload(payload: AdminPayload) {
    setCatalog(payload.catalog);
    setMeta({ storage: payload.storage, persistent: payload.persistent, warning: payload.warning });
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string }>("/api/admin/session", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ password }),
      });
      setToken(result.token);
      setPassword("");
      setAuthed(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function persist(next: Catalog, success: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await api<AdminPayload>("/api/admin/catalog", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      applyPayload(payload);
      setNotice(success);
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearToken();
        setAuthed(false);
      }
      setError(reason instanceof Error ? reason.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!catalog || !categoryDraft) return;
    const name = categoryDraft.name.trim();
    const slug = slugify(categoryDraft.slug || categoryDraft.name);
    const description = categoryDraft.description.trim();
    const sort = Number(categoryDraft.sort);
    if (!name || !slug || !Number.isInteger(sort)) {
      setError("请填写名称、合法的 slug 和整数排序。");
      return;
    }
    const id = categoryDraft.creating ? slug : categoryDraft.id;
    if (
      catalog.categories.some(
        (item) => item.id !== categoryDraft.id && (item.id === id || item.slug === slug),
      )
    ) {
      setError("分类 slug 已存在。");
      return;
    }
    const nextCategory: Category = {
      id,
      name,
      slug,
      description,
      sort,
      enabled: categoryDraft.enabled,
    };
    const categories = categoryDraft.creating
      ? [...catalog.categories, nextCategory]
      : catalog.categories.map((item) => (item.id === id ? nextCategory : item));
    const ok = await persist({ ...catalog, categories }, categoryDraft.creating ? "已新增分类" : "已更新分类");
    if (ok) setCategoryDraft(null);
  }

  async function saveSoftware(event: FormEvent) {
    event.preventDefault();
    if (!catalog || !softwareDraft) return;
    const name = softwareDraft.name.trim();
    const slug = slugify(softwareDraft.slug || softwareDraft.name);
    const description = softwareDraft.description.trim();
    const sort = Number(softwareDraft.sort);
    if (!name || !slug || !softwareDraft.downloadUrl.trim() || !Number.isInteger(sort)) {
      setError("请填写名称、slug、下载地址和整数排序。");
      return;
    }
    const id = softwareDraft.creating ? uniqueId(slug, catalog.software.map((item) => item.id)) : softwareDraft.id;
    if (catalog.software.some((item) => item.id !== id && item.slug === slug)) {
      setError("软件 slug 已存在。");
      return;
    }
    const nextItem: Software = {
      id,
      name,
      slug,
      description,
      categoryId: softwareDraft.categoryId,
      icon: softwareDraft.icon.trim(),
      downloadUrl: softwareDraft.downloadUrl.trim(),
      homepage: softwareDraft.homepage.trim(),
      sort,
      enabled: softwareDraft.enabled,
    };
    const software = softwareDraft.creating
      ? [...catalog.software, nextItem]
      : catalog.software.map((item) => (item.id === id ? nextItem : item));
    const ok = await persist({ ...catalog, software }, softwareDraft.creating ? "已新增软件" : "已更新软件");
    if (ok) setSoftwareDraft(null);
  }

  async function removeCategory(category: Category) {
    if (!catalog) return;
    const used = catalog.software.filter((item) => item.categoryId === category.id).length;
    if (used > 0) {
      setError(`「${category.name}」下面还有 ${used} 个软件，请先移走或删除。`);
      return;
    }
    if (!window.confirm(`删除分类「${category.name}」？`)) return;
    await persist(
      { ...catalog, categories: catalog.categories.filter((item) => item.id !== category.id) },
      "已删除分类",
    );
  }

  async function removeSoftware(item: Software) {
    if (!catalog) return;
    if (!window.confirm(`删除「${item.name}」？`)) return;
    await persist(
      { ...catalog, software: catalog.software.filter((entry) => entry.id !== item.id) },
      "已删除软件",
    );
  }

  async function toggleCategory(category: Category) {
    if (!catalog) return;
    await persist(
      {
        ...catalog,
        categories: catalog.categories.map((item) =>
          item.id === category.id ? { ...item, enabled: !item.enabled } : item,
        ),
      },
      category.enabled ? "已隐藏分类" : "已显示分类",
    );
  }

  async function toggleSoftware(item: Software) {
    if (!catalog) return;
    await persist(
      {
        ...catalog,
        software: catalog.software.map((entry) =>
          entry.id === item.id ? { ...entry, enabled: !entry.enabled } : entry,
        ),
      },
      item.enabled ? "已下架" : "已上架",
    );
  }

  async function onExport() {
    setError("");
    try {
      const response = await fetch("/api/admin/export", {
        headers: { authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new ApiError(payload.error || "导出失败", response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "software.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导出失败");
    }
  }

  async function onImport(file: File) {
    setError("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch {
      setError("文件不是有效的 JSON。");
      return;
    }
    if (!window.confirm("用这个文件覆盖全部分类和软件？")) return;
    setBusy(true);
    try {
      const payload = await api<AdminPayload>("/api/admin/import", {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      applyPayload(payload);
      setNotice("已导入");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearToken();
        setAuthed(false);
      }
      setError(reason instanceof Error ? reason.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!window.confirm("恢复为仓库里的初始目录？当前保存的修改会被覆盖。")) return;
    setBusy(true);
    setError("");
    try {
      const payload = await api<AdminPayload>("/api/admin/reset", { method: "POST" });
      applyPayload(payload);
      setNotice("已恢复初始数据");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }

  const visibleSoftware = useMemo(() => {
    if (!catalog) return [];
    const keyword = filter.trim().toLowerCase();
    return [...catalog.software]
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-CN"))
      .filter((item) => {
        if (!keyword) return true;
        return `${item.name} ${item.slug} ${item.description}`.toLowerCase().includes(keyword);
      });
  }, [catalog, filter]);

  return (
    <>
      <Header extra={<TextLink href="/">返回目录</TextLink>} />
      <main className="shell admin-shell">
        {!authed ? (
          <form className="gate" onSubmit={onLogin}>
            <p className="eyebrow">管理</p>
            <h1>编辑这套装机目录</h1>
            <p className="lede">密码只存在服务端的 ADMIN_PASSWORD 里，登录状态保存在当前标签页。</p>
            <label>
              管理密码
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "正在核对…" : "进入后台"}
            </button>
          </form>
        ) : null}

        {authed && !catalog ? (
          <div className="empty">
            <p>{error || "正在读取目录…"}</p>
          </div>
        ) : null}

        {authed && catalog && meta ? (
          <>
            <div className="admin-top">
              <div>
                <p className="eyebrow">后台</p>
                <h1>分类和软件</h1>
                <p className="status">{storageText(meta.storage, meta.persistent)}</p>
                {meta.warning ? <p className="warning">{meta.warning}</p> : null}
              </div>
              <div className="admin-actions">
                <button type="button" className="btn ghost" onClick={() => void onExport()} disabled={busy}>
                  导出 JSON
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  导入 JSON
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void onImport(file);
                  }}
                />
                <button type="button" className="btn ghost" onClick={() => void onReset()} disabled={busy}>
                  恢复初始数据
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    clearToken();
                    setAuthed(false);
                    setCatalog(null);
                  }}
                >
                  退出
                </button>
              </div>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            {notice ? <p className="form-ok">{notice}</p> : null}

            <section className="panel">
              <div className="panel-head">
                <h2>分类</h2>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    setCategoryDraft({
                      creating: true,
                      id: "",
                      name: "",
                      slug: "",
                      description: "",
                      sort: String(nextSort(catalog.categories.map((item) => item.sort))),
                      enabled: true,
                    })
                  }
                >
                  新增分类
                </button>
              </div>
              <div className="admin-list">
                {[...catalog.categories]
                  .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-CN"))
                  .map((category) => (
                    <article key={category.id} className={category.enabled ? "admin-row" : "admin-row off"}>
                      <div>
                        <strong>{category.name}</strong>
                        <p>
                          {category.slug} · 排序 {category.sort}
                          {category.description ? ` · ${category.description}` : ""}
                        </p>
                      </div>
                      <div className="row-actions">
                        <button type="button" className="text-btn" onClick={() => void toggleCategory(category)}>
                          {category.enabled ? "隐藏" : "显示"}
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() =>
                            setCategoryDraft({
                              creating: false,
                              id: category.id,
                              name: category.name,
                              slug: category.slug,
                              description: category.description,
                              sort: String(category.sort),
                              enabled: category.enabled,
                            })
                          }
                        >
                          编辑
                        </button>
                        <button type="button" className="text-btn danger" onClick={() => void removeCategory(category)}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>软件</h2>
                <div className="panel-tools">
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="筛选名称"
                    aria-label="筛选软件"
                  />
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || catalog.categories.length === 0}
                    onClick={() =>
                      setSoftwareDraft({
                        creating: true,
                        id: "",
                        name: "",
                        slug: "",
                        description: "",
                        categoryId: catalog.categories[0]?.id ?? "",
                        icon: "",
                        downloadUrl: "",
                        homepage: "",
                        sort: String(nextSort(catalog.software.map((item) => item.sort))),
                        enabled: true,
                      })
                    }
                  >
                    新增软件
                  </button>
                </div>
              </div>
              <div className="admin-list">
                {visibleSoftware.map((item) => {
                  const categoryName =
                    catalog.categories.find((category) => category.id === item.categoryId)?.name ??
                    "未分类";
                  return (
                    <article key={item.id} className={item.enabled ? "admin-row" : "admin-row off"}>
                      <div className="admin-software">
                        <div className="icon-plate tiny">
                          <Icon src={item.icon} name={item.name} />
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <p>
                            {categoryName} · {item.slug} · 排序 {item.sort}
                          </p>
                        </div>
                      </div>
                      <div className="row-actions">
                        <button type="button" className="text-btn" onClick={() => void toggleSoftware(item)}>
                          {item.enabled ? "下架" : "上架"}
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() =>
                            setSoftwareDraft({
                              creating: false,
                              id: item.id,
                              name: item.name,
                              slug: item.slug,
                              description: item.description,
                              categoryId: item.categoryId,
                              icon: item.icon,
                              downloadUrl: item.downloadUrl,
                              homepage: item.homepage,
                              sort: String(item.sort),
                              enabled: item.enabled,
                            })
                          }
                        >
                          编辑
                        </button>
                        <button type="button" className="text-btn danger" onClick={() => void removeSoftware(item)}>
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </main>
      <Footer />

      {categoryDraft ? (
        <Modal title={categoryDraft.creating ? "新增分类" : "编辑分类"} onClose={() => setCategoryDraft(null)}>
          <form className="stack" onSubmit={(event) => void saveCategory(event)}>
            <label>
              名称
              <input
                value={categoryDraft.name}
                onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })}
                required
              />
            </label>
            <label>
              Slug
              <input
                value={categoryDraft.slug}
                onChange={(event) => setCategoryDraft({ ...categoryDraft, slug: event.target.value })}
                placeholder="system"
                required
              />
            </label>
            <label>
              简介
              <textarea
                value={categoryDraft.description}
                onChange={(event) =>
                  setCategoryDraft({ ...categoryDraft, description: event.target.value })
                }
                rows={2}
              />
            </label>
            <label>
              排序
              <input
                inputMode="numeric"
                value={categoryDraft.sort}
                onChange={(event) => setCategoryDraft({ ...categoryDraft, sort: event.target.value })}
                required
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={categoryDraft.enabled}
                onChange={(event) =>
                  setCategoryDraft({ ...categoryDraft, enabled: event.target.checked })
                }
              />
              在前台显示
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setCategoryDraft(null)}>
                取消
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                保存
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {softwareDraft && catalog ? (
        <Modal title={softwareDraft.creating ? "新增软件" : "编辑软件"} onClose={() => setSoftwareDraft(null)}>
          <form className="stack" onSubmit={(event) => void saveSoftware(event)}>
            <label>
              名称
              <input
                value={softwareDraft.name}
                onChange={(event) => setSoftwareDraft({ ...softwareDraft, name: event.target.value })}
                required
              />
            </label>
            <label>
              Slug
              <input
                value={softwareDraft.slug}
                onChange={(event) => setSoftwareDraft({ ...softwareDraft, slug: event.target.value })}
                required
              />
            </label>
            <label>
              简介
              <textarea
                value={softwareDraft.description}
                onChange={(event) =>
                  setSoftwareDraft({ ...softwareDraft, description: event.target.value })
                }
                rows={2}
              />
            </label>
            <label>
              分类
              <select
                value={softwareDraft.categoryId}
                onChange={(event) =>
                  setSoftwareDraft({ ...softwareDraft, categoryId: event.target.value })
                }
              >
                {catalog.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              图标地址
              <input
                value={softwareDraft.icon}
                onChange={(event) => setSoftwareDraft({ ...softwareDraft, icon: event.target.value })}
                placeholder="https:// 或 /icons/..."
              />
            </label>
            <label>
              下载地址
              <input
                value={softwareDraft.downloadUrl}
                onChange={(event) =>
                  setSoftwareDraft({ ...softwareDraft, downloadUrl: event.target.value })
                }
                required
              />
            </label>
            <label>
              官网（可选）
              <input
                value={softwareDraft.homepage}
                onChange={(event) => setSoftwareDraft({ ...softwareDraft, homepage: event.target.value })}
              />
            </label>
            <label>
              排序
              <input
                inputMode="numeric"
                value={softwareDraft.sort}
                onChange={(event) => setSoftwareDraft({ ...softwareDraft, sort: event.target.value })}
                required
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={softwareDraft.enabled}
                onChange={(event) =>
                  setSoftwareDraft({ ...softwareDraft, enabled: event.target.checked })
                }
              />
              在前台显示
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setSoftwareDraft(null)}>
                取消
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                保存
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function storageText(storage: StorageKind, persistent: boolean): string {
  if (!persistent) return "只读种子数据，保存需要绑定 SOFTWARE_KV。";
  if (storage === "kv") return "更改会写入 Cloudflare KV。";
  if (storage === "file") return "本地开发：更改写入 .data/catalog.json。";
  return "当前展示种子数据。下一次保存会写入存储。";
}

function nextSort(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0) + 10;
}

function uniqueId(slug: string, ids: string[]): string {
  if (!ids.includes(slug)) return slug;
  let index = 2;
  while (ids.includes(`${slug}-${index}`)) index += 1;
  return `${slug}-${index}`;
}
