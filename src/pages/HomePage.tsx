import { useEffect, useMemo, useState } from "react";
import type { PublicCatalog, PublicCategory, PublicSoftware } from "../../shared/catalog";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { SoftwareCard } from "../components/SoftwareCard";
import { loadPublicCatalog } from "../lib/api";

export function HomePage() {
  const initial = new URLSearchParams(window.location.search);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [category, setCategory] = useState(initial.get("c") ?? "");

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

  // 分类格按数量分级：最多的两类占 2×1，其余 1×1。
  const wideCategorySlugs = useMemo(() => {
    if (!catalog) return new Set<string>();
    const counts = catalog.categories.map((item) => ({
      slug: item.slug,
      count: catalog.software.filter((entry) => entry.categoryId === item.id).length,
    }));
    counts.sort((a, b) => b.count - a.count);
    return new Set(counts.slice(0, 2).map((item) => item.slug));
  }, [catalog]);

  const countFor = (categoryId: string) =>
    catalog?.software.filter((entry) => entry.categoryId === categoryId).length ?? 0;

  function pickCategory(slug: string) {
    setCategory(slug);
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const total = filtered.reduce((sum, group) => sum + group.software.length, 0);
  const activeCategory = catalog?.categories.find((item) => item.slug === category);

  return (
    <>
      <a className="skip" href="#content">
        跳到内容
      </a>
      <Header query={query} onQuery={setQuery} />
      <main id="content" className="shell">
        <section className="bento hero-bento" aria-label="关于本站">
          <div className="hero">
            <div>
              <p className="eyebrow">Windows 装机</p>
              <h1>常用软件，直达官方页面</h1>
              <p className="lede">
                按分类挑一套干净的装机清单。旧站里的推广包和失效直链已经换成官方下载页，并补上现在常用的工具。
              </p>
            </div>
            <div className="hero-actions">
              <a className="btn primary" href="#catalog">
                开始挑软件
              </a>
            </div>
          </div>
          <div className="stat">
            <p className="stat-num">
              {catalog ? catalog.software.length : "–"}
              <span className="unit"> 款</span>
            </p>
            <p className="stat-label">软件，全部直达官网</p>
          </div>
          <div className="stat">
            <p className="stat-num">
              {catalog ? catalog.categories.length : "–"}
              <span className="unit"> 个</span>
            </p>
            <p className="stat-label">分类，按用途分好</p>
          </div>
          <div className="how">
            <p>按分类挑一套清单，点下载直达官网，安装前自行核对。</p>
            <p className="hint">
              <span className="keycap">/</span> 按下 / 直接搜索
            </p>
          </div>
        </section>

        <div className="section-head">
          <h2>分类</h2>
          <p>
            {category ? (
              <button type="button" className="text-btn" onClick={() => setCategory("")}>
                看全部
              </button>
            ) : (
              "点一块格子，只看这个分类"
            )}
          </p>
        </div>
        <nav className="bento cats-bento" aria-label="软件分类">
          {catalog?.categories.map((item) => {
            const wide = wideCategorySlugs.has(item.slug);
            return (
              <button
                key={item.id}
                type="button"
                className={
                  wide
                    ? category === item.slug
                      ? "cat-tile wide active"
                      : "cat-tile wide"
                    : category === item.slug
                      ? "cat-tile active"
                      : "cat-tile"
                }
                aria-pressed={category === item.slug}
                onClick={() => pickCategory(category === item.slug ? "" : item.slug)}
              >
                {wide ? (
                  <>
                    <span className="cat-count">{countFor(item.id)}</span>
                    <span className="cat-body">
                      <span className="cat-name">{item.name}</span>
                      <span className="cat-desc">{item.description}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="cat-count">{countFor(item.id)}</span>
                    <span className="cat-name">{item.name}</span>
                    <span className="cat-desc">{item.description}</span>
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div id="catalog" className="results">
          <div className="results-bar">
            <p>
              {activeCategory ? activeCategory.name : "全部分类"}
              <span> · {catalog ? `${total} 个软件` : "正在加载"}</span>
            </p>
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
          </div>
          {!catalog && !error ? <SkeletonGrid /> : null}
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
                  <h2 id={`cat-${group.category.slug}`} className={!activeCategory || query ? undefined : "sr-only"}>
                    {group.category.name}
                  </h2>
                  {activeCategory && !query ? null : <p>{group.category.description}</p>}
                </div>
                {activeCategory && !query ? <p className="group-note">{group.category.description}</p> : null}
                {group.software.length === 0 ? (
                  <p className="group-note">这个分类还没有启用的软件。</p>
                ) : (
                  <div className="grid">
                    {group.software.map((item, index) => (
                      <SoftwareCard
                        key={item.id}
                        item={item}
                        wide={index === 0 && group.software.length >= 4}
                        categoryName={query && !activeCategory ? group.category.name : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
            : null}
        </div>
      </main>
      <Footer />
    </>
  );
}

function matches(item: PublicSoftware, category: PublicCategory, keyword: string): boolean {
  if (!keyword) return true;
  return `${item.name} ${item.description} ${category.name}`.toLowerCase().includes(keyword);
}

function SkeletonGrid() {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="card skeleton" />
      ))}
    </div>
  );
}
