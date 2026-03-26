"use client";

import Link from "next/link";

import { useReaderState } from "./reader-state-provider";

function TopicList({
  title,
  description,
  items,
}: Readonly<{
  title: string;
  description: string;
  items: {
    slugKey: string;
    href: string;
    title: string;
    breadcrumbs: string[];
  }[];
}>) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="panel-card__eyebrow">{description}</p>
          <h2>{title}</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="panel-card__empty">暂无记录，开始阅读后会出现在这里。</div>
      ) : (
        <div className="topic-list">
          {items.map((item) => (
            <Link key={item.slugKey} href={item.href} className="topic-list__item">
              <strong>{item.title}</strong>
              <span>{item.breadcrumbs.join(" / ")}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function HomePanels() {
  const { isReady, state } = useReaderState();

  if (!isReady) {
    return (
      <section className="panel-card panel-card--loading">
        <div className="panel-card__empty">正在读取本地阅读状态……</div>
      </section>
    );
  }

  return (
    <section className="home-panels">
      <section className="panel-card panel-card--spotlight">
        <div className="panel-card__header">
          <div>
            <p className="panel-card__eyebrow">Continue Reading</p>
            <h2>延续你的冒险进度</h2>
          </div>
        </div>

        {state.lastVisited ? (
          <Link href={state.lastVisited.href} className="spotlight-link">
            <strong>{state.lastVisited.title}</strong>
            <span>{state.lastVisited.breadcrumbs.join(" / ")}</span>
          </Link>
        ) : (
          <div className="panel-card__empty">尚无最近阅读页面。</div>
        )}
      </section>

      <TopicList
        title="最近访问"
        description="Recent History"
        items={state.recentHistory.slice(0, 6)}
      />

      <TopicList
        title="收藏夹"
        description="Favorites"
        items={state.favorites.slice(0, 6)}
      />
    </section>
  );
}
