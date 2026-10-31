import type { ReactNode } from "react";
import { TextLink } from "../lib/router";
import { useTheme } from "../lib/theme";

export function Header({
  query,
  onQuery,
  extra,
}: {
  query?: string;
  onQuery?: (value: string) => void;
  extra?: ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
  return (
    <header className="site-header">
      <div className="header-inner">
        <TextLink href="/" className="brand">
          <span className="mark" aria-hidden="true">
            装
          </span>
          <span className="brand-text">
            <span className="brand-title">装机必备</span>
            <span className="brand-sub">软件合集</span>
          </span>
        </TextLink>
        {onQuery ? (
          <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label className="sr-only" htmlFor="site-search">
              搜索软件
            </label>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="search-icon">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              id="site-search"
              value={query ?? ""}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="搜索名称或简介"
              autoComplete="off"
            />
          </form>
        ) : (
          <div className="header-note">{extra}</div>
        )}
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={nextLabel}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M18 6l-1.3 1.3M7.3 16.7 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.5 3.8A7.8 7.8 0 1 0 20.2 14 6.2 6.2 0 0 1 15.5 3.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
