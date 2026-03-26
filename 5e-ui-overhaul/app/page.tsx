import { AppShell } from "../components/app-shell";
import { HomePanels } from "../components/home-panels";
import { SearchTrigger } from "../components/search-trigger";
import { getToc, getTopics } from "../lib/generated-data";
import { routeFromSlug } from "../lib/routes";
import type { NavNode, TopicEntry } from "../lib/types";

function countTopics(node: NavNode): number {
  const selfCount = node.slug ? 1 : 0;
  return selfCount + node.children.reduce((sum, child) => sum + countTopics(child), 0);
}

function findFirstHref(node: NavNode): string | null {
  if (node.slug) {
    return routeFromSlug(node.slug);
  }
  for (const child of node.children) {
    const href = findFirstHref(child);
    if (href) {
      return href;
    }
  }
  return null;
}

function pickFeaturedTopics(topics: TopicEntry[]) {
  const patterns = [/写在前面/, /速查/, /法术/, /怪物/, /玩家手册2024/];
  const featured = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    const topic = topics.find(
      (candidate) =>
        !seen.has(candidate.slugKey) &&
        (pattern.test(candidate.title) || pattern.test(candidate.breadcrumbs.join(" "))),
    );

    if (topic) {
      featured.push(topic);
      seen.add(topic.slugKey);
    }
  }

  for (const topic of topics) {
    if (featured.length >= 4) {
      break;
    }
    if (!seen.has(topic.slugKey)) {
      featured.push(topic);
      seen.add(topic.slugKey);
    }
  }

  return featured.slice(0, 4);
}

export default async function HomePage() {
  const [toc, topics] = await Promise.all([getToc(), getTopics()]);
  const featured = pickFeaturedTopics(topics);
  const topLevelCollections = toc.slice(0, 12);

  return (
    <AppShell>
      <div className="home-view">
        <section className="hero-card">
          <div className="hero-card__copy">
            <p className="hero-card__eyebrow">Modern Codex</p>
            <h1>把 5E 不全书升级成更适合今天阅读的静态典籍站。</h1>
            <p className="hero-card__lede">
              保留原始内容广度，但用新的结构、排版、搜索和阅读状态重建体验。
              目录、正文、速查和深链都直接落在 Next.js 静态页面上。
            </p>
          </div>

          <div className="hero-card__actions">
            <SearchTrigger label="立即搜索整本书" className="shell-button shell-button--hero" />
            <a href={featured[0]?.href ?? "/"} className="shell-button shell-button--ghost">
              从第一章开始
            </a>
          </div>

          <div className="hero-card__stats">
            <div>
              <strong>{topics.length.toLocaleString("en-US")}</strong>
              <span>静态主题页</span>
            </div>
            <div>
              <strong>{topLevelCollections.length}</strong>
              <span>顶层收藏分区</span>
            </div>
            <div>
              <strong>本地索引</strong>
              <span>离线检索</span>
            </div>
          </div>
        </section>

        <section className="featured-grid">
          {featured.map((topic, index) => (
            <a key={topic.slugKey} href={topic.href} className="featured-card">
              <p className="featured-card__index">0{index + 1}</p>
              <h2>{topic.title}</h2>
              <p>{topic.excerpt}</p>
              <span>{topic.breadcrumbs.join(" / ")}</span>
            </a>
          ))}
        </section>

        <HomePanels />

        <section className="collections-section">
          <div className="section-heading">
            <p>Collections</p>
            <h2>按原书目录继续探索</h2>
          </div>

          <div className="collection-grid">
            {topLevelCollections.map((node) => (
              <a
                key={node.id}
                href={findFirstHref(node) ?? "/"}
                className="collection-card"
              >
                <p className="collection-card__eyebrow">Collection</p>
                <h3>{node.title}</h3>
                <strong>{countTopics(node)} 页</strong>
                <span>
                  {node.children
                    .slice(0, 3)
                    .map((child) => child.title)
                    .join(" · ") || "从该分区的首个条目开始阅读"}
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
