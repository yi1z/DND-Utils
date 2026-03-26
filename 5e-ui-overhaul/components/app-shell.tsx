"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { SearchOverlay } from "./search-overlay";
import { SidebarNav } from "./sidebar-nav";

type ShellControlsContextValue = {
  openSearch: () => void;
};

const ShellControlsContext = createContext<ShellControlsContextValue | null>(null);

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

export function AppShell({
  children,
  meta,
  activeSlugKey,
  activeTrailIds = [],
}: Readonly<{
  children: React.ReactNode;
  meta?: React.ReactNode;
  activeSlugKey?: string;
  activeTrailIds?: string[];
}>) {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleGlobalKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setNavOpen(false);
      setSearchOpen(false);
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      setSearchOpen(true);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  return (
    <ShellControlsContext.Provider value={{ openSearch: () => setSearchOpen(true) }}>
      <div className={`app-shell ${navOpen ? "is-nav-open" : ""}`}>
        <button
          type="button"
          className="app-shell__backdrop"
          onClick={() => setNavOpen(false)}
          aria-label="关闭目录"
        />

        <aside className="app-shell__sidebar">
          <div className="app-shell__sidebar-frame">
            <SidebarNav
              activeSlugKey={activeSlugKey}
              activeTrailIds={activeTrailIds}
            />
          </div>
        </aside>

        <div className="app-shell__frame">
          <header className="app-shell__topbar">
            <div className="app-shell__brand">
              <button
                type="button"
                className="shell-button shell-button--menu"
                onClick={() => setNavOpen((current) => !current)}
              >
                目录
              </button>

              <Link href="/" className="brand-mark">
                <span className="brand-mark__crest">5E</span>
                <span>
                  <strong>不全书 Codex</strong>
                  <small>Static Reader Overhaul</small>
                </span>
              </Link>
            </div>

            <div className="app-shell__actions">
              <button
                type="button"
                className="shell-button shell-button--primary"
                onClick={() => setSearchOpen(true)}
              >
                搜索
                <span className="shell-button__hint">Ctrl K</span>
              </button>
            </div>
          </header>

          <div className={`app-shell__body ${meta ? "has-meta" : ""}`}>
            <main className="app-shell__main">{children}</main>
            {meta ? <aside className="app-shell__meta">{meta}</aside> : null}
          </div>
        </div>

        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </ShellControlsContext.Provider>
  );
}

export function useShellControls() {
  const context = useContext(ShellControlsContext);
  if (!context) {
    throw new Error("useShellControls must be used within AppShell.");
  }
  return context;
}
