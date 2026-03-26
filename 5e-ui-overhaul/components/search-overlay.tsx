"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import type { SearchEntry } from "../lib/types";

type SearchOverlayProps = {
  open: boolean;
  onClose: () => void;
};

type LoadedSearchEntry = SearchEntry & {
  normalizedTitle: string;
  normalizedHeadings: string;
  titleTokens: Set<string>;
  headingTokens: Set<string>;
  tokenSet: Set<string>;
};

function normalizeQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\u3400-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(input: string) {
  const normalized = normalizeQuery(input);
  const tokens: string[] = [];
  const seen = new Set<string>();

  const push = (token: string) => {
    if (!token || seen.has(token)) {
      return;
    }
    seen.add(token);
    tokens.push(token);
  };

  const latinTokens = normalized.match(/[a-z0-9][a-z0-9'’_-]*/g) ?? [];
  for (const token of latinTokens) {
    if (token.length >= 2) {
      push(token);
    }
  }

  const cjkChunks = normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? [];
  for (const chunk of cjkChunks) {
    if (chunk.length === 1) {
      push(chunk);
      continue;
    }
    for (let index = 0; index < chunk.length - 1; index += 1) {
      push(chunk.slice(index, index + 2));
    }
  }

  return tokens;
}

function scoreSearchEntry(entry: LoadedSearchEntry, query: string) {
  const normalizedQuery = normalizeQuery(query);
  const queryTokens = tokenizeQuery(query);
  let score = 0;

  if (entry.normalizedTitle === normalizedQuery) {
    score += 180;
  }
  if (entry.normalizedTitle.includes(normalizedQuery)) {
    score += 120;
  }
  if (entry.normalizedHeadings.includes(normalizedQuery)) {
    score += 56;
  }
  if (normalizeQuery(entry.excerpt).includes(normalizedQuery)) {
    score += 16;
  }

  for (const token of queryTokens) {
    if (entry.titleTokens.has(token)) {
      score += 18;
      continue;
    }
    if (entry.headingTokens.has(token)) {
      score += 8;
      continue;
    }
    if (entry.tokenSet.has(token)) {
      score += 3;
    }
  }

  return score;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<LoadedSearchEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || entries || loadError) {
      return;
    }

    const controller = new AbortController();

    fetch("/generated/search-index.json", { signal: controller.signal })
      .then((response) => response.json() as Promise<SearchEntry[]>)
      .then((payload) => {
        setEntries(
          payload.map((entry) => ({
            ...entry,
            normalizedTitle: normalizeQuery(entry.title),
            normalizedHeadings: normalizeQuery(entry.headings.join(" ")),
            titleTokens: new Set(tokenizeQuery(entry.title)),
            headingTokens: new Set(tokenizeQuery(entry.headings.join(" "))),
            tokenSet: new Set(entry.tokens),
          })),
        );
      })
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "AbortError"
        ) {
          return;
        }
        setLoadError(true);
      });

    return () => controller.abort();
  }, [entries, loadError, open]);

  const status = entries
    ? "ready"
    : loadError
      ? "error"
      : open
        ? "loading"
        : "idle";

  if (!open) {
    return null;
  }

  const trimmedQuery = deferredQuery.trim();
  const rankedResults =
    entries && trimmedQuery
      ? entries
          .map((entry) => ({
            entry,
            score: scoreSearchEntry(entry, trimmedQuery),
          }))
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }
            return left.entry.title.length - right.entry.title.length;
          })
          .slice(0, 32)
      : [];

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-overlay-title"
    >
      <button
        type="button"
        className="search-overlay__backdrop"
        onClick={onClose}
        aria-label="关闭搜索"
      />
      <div className="search-overlay__panel">
        <div className="search-overlay__header">
          <div>
            <p className="search-overlay__eyebrow">Local Search</p>
            <h2 id="search-overlay-title">检索整本不全书</h2>
          </div>
          <button
            type="button"
            className="shell-button shell-button--ghost"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="search-input">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入法术、怪物、书名、规则术语……"
            aria-label="搜索不全书"
          />
        </div>

        <div className="search-overlay__body">
          {!trimmedQuery ? (
            <div className="search-overlay__empty">
              <p>输入中文或英文关键词即可开始检索。</p>
              <p>搜索会优先匹配标题与章节标题，再退到正文关键词。</p>
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="search-overlay__empty">
              <p>正在载入本地索引……</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="search-overlay__empty">
              <p>本地索引载入失败，请刷新页面后重试。</p>
            </div>
          ) : null}

          {trimmedQuery && status === "ready" && rankedResults.length === 0 ? (
            <div className="search-overlay__empty">
              <p>没有找到匹配结果。</p>
            </div>
          ) : null}

          {rankedResults.length > 0 ? (
            <div className="search-results">
              {rankedResults.map(({ entry, score }) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="search-result"
                  onClick={onClose}
                >
                  <div className="search-result__meta">
                    <span>{entry.collectionTitle}</span>
                    <span>评分 {score}</span>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.excerpt}</p>
                  <div className="search-result__trail">
                    {entry.breadcrumbs.join(" / ")}
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
