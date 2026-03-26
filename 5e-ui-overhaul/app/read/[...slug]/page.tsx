import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../../components/app-shell";
import { FavoriteToggle } from "../../../components/favorite-toggle";
import { TopicVisitTracker } from "../../../components/topic-visit-tracker";
import {
  getTopicBySlug,
  getTopicHtml,
  getTopicMap,
  getTopics,
} from "../../../lib/generated-data";
import { slugKey } from "../../../lib/routes";
import type { ReaderTopicRef } from "../../../lib/types";

type ReaderPageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const topics = await getTopics();
  return topics.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({
  params,
}: ReaderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const topic = await getTopicBySlug(slug);

  if (!topic) {
    return {
      title: "页面不存在",
    };
  }

  return {
    title: topic.title,
    description: topic.excerpt,
  };
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { slug } = await params;
  const decoded = slug.map(s => decodeURIComponent(s));
  const topic = await getTopicBySlug(decoded);

  if (!topic) {
    notFound();
  }

  const topicMap = await getTopicMap();
  const html = await getTopicHtml(topic.htmlFile);
  const previousTopic = topic.prevSlug ? topicMap.get(slugKey(topic.prevSlug)) : null;
  const nextTopic = topic.nextSlug ? topicMap.get(slugKey(topic.nextSlug)) : null;

  const topicRef: ReaderTopicRef = {
    slugKey: topic.slugKey,
    href: topic.href,
    title: topic.title,
    breadcrumbs: topic.breadcrumbs,
    collectionTitle: topic.collectionTitle,
  };

  return (
    <AppShell
      activeSlugKey={topic.slugKey}
      activeTrailIds={topic.navTrailIds}
      meta={
        <div className="meta-stack">
          <div className="meta-card">
            <p className="meta-card__eyebrow">Reader State</p>
            <h2>收藏与章节信息</h2>
            <div className="meta-card__path">{topic.collectionTitle}</div>
            <div className="reader-actions">
              <FavoriteToggle topic={topicRef} />
            </div>
          </div>

          <div className="meta-card">
            <p className="meta-card__eyebrow">Source</p>
            <h2>原始路径</h2>
            <div className="meta-card__path">{topic.sourcePath}</div>
          </div>

          {topic.headings.length > 0 ? (
            <div className="meta-card">
              <p className="meta-card__eyebrow">Outline</p>
              <h2>页内标题</h2>
              <ul>
                {topic.headings.slice(0, 8).map((heading) => (
                  <li key={heading}>{heading}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      }
    >
      <div className="reader-view">
        <section className="reader-hero">
          <div className="reader-breadcrumbs">
            <Link href="/">首页</Link>
            {topic.breadcrumbs.map((crumb) => (
              <span key={crumb}>/ {crumb}</span>
            ))}
          </div>

          <h1 className="reader-title">{topic.title}</h1>
          <p className="reader-subtitle">{topic.excerpt}</p>
        </section>

        <section className="reader-article">
          <article
            className="reader-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <div className="reader-pagination">
            {previousTopic ? (
              <Link href={previousTopic.href}>
                <strong>上一篇</strong>
                <span>{previousTopic.title}</span>
              </Link>
            ) : (
              <span>
                <strong>上一篇</strong>
                <span>已到开头</span>
              </span>
            )}

            {nextTopic ? (
              <Link href={nextTopic.href}>
                <strong>下一篇</strong>
                <span>{nextTopic.title}</span>
              </Link>
            ) : (
              <span>
                <strong>下一篇</strong>
                <span>已到结尾</span>
              </span>
            )}
          </div>
        </section>
      </div>

      <TopicVisitTracker topic={topicRef} />
    </AppShell>
  );
}
