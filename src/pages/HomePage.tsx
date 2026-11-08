import { useEffect, useMemo, useState } from "react";
import type { PublicCatalog, PublicCategory, PublicSoftware } from "../../shared/catalog";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { SoftwareCard } from "../components/SoftwareCard";
import { loadPublicCatalog } from "../lib/api";

type CatalogView = "card" | "list";

const VIEW_KEY = "soft-view";

function readView(): CatalogView {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "card";
  } catch {
    return "card";
  }
}

export function HomePage() {
  const initial = new URLSearchParams(window.location.search);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [category, setCategory] = useState(initial.get("c") ?? "");
  const [view, setView] = useState<CatalogView>(readView);

  useEffect(() => {
    let cancelled = false;
    loadPublicCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "目录暂时没有加载出来");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("c", category);
    if (query) params.set("q", query);
    const search = params.toString();
    const next = search ? `/?${search}` : "/";
    const current = `${window.location.pathname}${window.location.search}`;
    if (window.location.pathname === "/" && current !== next) {
      window.history.replaceState({}, "", next);
    }
  }, [category, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      document.getElementById("site-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const keyword = query.trim().toLowerCase();
    const selected = catalog.categories.find((item) => item.slug === category);
    const categories = selected ? [selected] : catalog.categories;
    return categories
      .map((item) => ({
        category: item,
        software: catalog.software.filter(
          (entry) => entry.categoryId === item.id && matches(entry, item, keyword),
        ),
      }))
      .filter((group) => (keyword ? group.software.length > 0 : true));
  }, [catalog, query, category]);

  const total = filtered.reduce((sum, group) => sum + group.software.length, 0);
  const activeCategory = catalog?.categories.find((item) => item.slug === category);

  function chooseView(next: CatalogView) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Preference is optional when storage is blocked.
    }
  }

  return (
    <>
      <a className="skip" href="#content">
        跳到内容
      </a>
      <Header query={query} onQuery={setQuery} />
      <main id="content" className="shell">
        <section className="intro">
          <h1>新装 Windows，直达官方下载页</h1>
          <p className="lede">
            按分类挑一套干净的装机清单。旧站里的推广包和失效直链已经换成官方下载页，并补上现在常用的工具。
          </p>
        </section>
        <div className="layout">
          <nav className="cats" aria-label="软件分类">
            <button
              type="button"
              className={category ? "cat" : "cat active"}
              aria-pressed={!category}
              onClick={() => setCategory("")}
            >
              <span className="cat-label">全部</span>
              <span className="count">{catalog ? catalog.software.length : ""}</span>
            </button>
            {catalog?.categories.map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === item.slug ? "cat active" : "cat"}
                aria-pressed={category === item.slug}
                onClick={() => setCategory(item.slug)}
              >
                <span className="cat-label">{item.name}</span>
                <span className="count">
                  {catalog.software.filter((entry) => entry.categoryId === item.id).length}
                </span>
              </button>
            ))}
          </nav>
          <div className="results">
            <div className="results-bar">
              <p>
                {catalog ? (
                  <>
                    {activeCategory ? activeCategory.name : "全部"}
                    <span className="results-dot"> · </span>
                    <span className="count">{total}</span> 个软件
                  </>
                ) : (
                  "正在加载"
                )}
              </p>
              <div className="results-tools">
                {query || category ? (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => {
                      setQuery("");
                      setCategory("");
                    }}
                  >
                    清除筛选
                  </button>
                ) : null}
                <ViewSwitch view={view} onChange={chooseView} />
              </div>
            </div>
            {!catalog && !error ? <SkeletonGrid view={view} /> : null}
            {error ? (
              <div className="empty">
                <p>{error}</p>
                <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                  重试
                </button>
              </div>
            ) : null}
            {catalog && total === 0 ? (
              <div className="empty">
                <p>没有找到和「{query.trim() || activeCategory?.name}」相关的软件。</p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setQuery("");
                    setCategory("");
                  }}
                >
                  看全部
                </button>
              </div>
            ) : null}
            {catalog && total > 0
              ? filtered.map((group) => (
                  <section key={group.category.id} className="group" aria-labelledby={`cat-${group.category.slug}`}>
                    <div className="group-head">
                      <h2 id={`cat-${group.category.slug}`}>{group.category.name}</h2>
                      {group.category.description ? <p>{group.category.description}</p> : null}
                    </div>
                    {group.software.length === 0 ? (
                      <p className="group-note">这个分类还没有启用的软件。</p>
                    ) : (
                      <div className={view === "list" ? "soft-list" : "soft-grid"}>
                        {group.software.map((item) => (
                          <SoftwareCard
                            key={item.id}
                            item={item}
                            layout={view}
                            categoryName={query && !activeCategory ? group.category.name : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))
              : null}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function ViewSwitch({ view, onChange }: { view: CatalogView; onChange: (view: CatalogView) => void }) {
  return (
    <div className="view-switch" role="group" aria-label="展示方式">
      <button type="button" aria-pressed={view === "card"} onClick={() => onChange("card")}>
        <GridIcon />
        卡片
      </button>
      <button type="button" aria-pressed={view === "list"} onClick={() => onChange("list")}>
        <RowsIcon />
        列表
      </button>
    </div>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function matches(item: PublicSoftware, category: PublicCategory, keyword: string): boolean {
  if (!keyword) return true;
  return `${item.name} ${item.description} ${category.name}`.toLowerCase().includes(keyword);
}

function SkeletonGrid({ view }: { view: CatalogView }) {
  if (view === "list") {
    return (
      <div className="soft-list" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="soft is-list skeleton" />
        ))}
      </div>
    );
  }
  return (
    <div className="soft-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="soft skeleton" />
      ))}
    </div>
  );
}
