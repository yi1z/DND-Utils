import Link from "next/link";

import { routeFromSlug, slugKey } from "../lib/routes";
import type { NavNode } from "../lib/types";

function findNavigableHref(node: NavNode): string | null {
  if (node.slug) {
    return routeFromSlug(node.slug);
  }

  for (const child of node.children) {
    const href = findNavigableHref(child);
    if (href) {
      return href;
    }
  }

  return null;
}

function renderNode({
  node,
  activeSlugKey,
  activeTrailIds,
  level,
}: {
  node: NavNode;
  activeSlugKey?: string;
  activeTrailIds: Set<string>;
  level: number;
}) {
  const nodeSlugKey = node.slug ? slugKey(node.slug) : null;
  const isActive = nodeSlugKey === activeSlugKey;
  const hasChildren = node.children.length > 0;
  const defaultOpen = activeTrailIds.has(node.id) || (level === 0 && node.order < 5);
  const href = findNavigableHref(node);

  if (!hasChildren) {
    return (
      <li key={node.id} className="sidebar-tree__item">
        {href ? (
          <Link
            href={href}
            className={`sidebar-tree__link ${isActive ? "is-active" : ""}`}
          >
            {node.title}
          </Link>
        ) : (
          <span className="sidebar-tree__link is-static">{node.title}</span>
        )}
      </li>
    );
  }

  return (
    <li key={node.id} className="sidebar-tree__item sidebar-tree__item--group">
      <details open={defaultOpen}>
        <summary className={isActive ? "is-active" : undefined}>
          <span>{node.title}</span>
          <small>{node.children.length}</small>
        </summary>
        <div className="sidebar-tree__branch">
          {node.slug && href ? (
            <Link
              href={href}
              className={`sidebar-tree__link sidebar-tree__overview ${
                isActive ? "is-active" : ""
              }`}
            >
              进入「{node.title}」
            </Link>
          ) : null}
          <ul>
            {node.children.map((child) =>
              renderNode({
                node: child,
                activeSlugKey,
                activeTrailIds,
                level: level + 1,
              }),
            )}
          </ul>
        </div>
      </details>
    </li>
  );
}

export function SidebarTree({
  nodes,
  activeSlugKey,
  activeTrailIds = [],
}: Readonly<{
  nodes: NavNode[];
  activeSlugKey?: string;
  activeTrailIds?: string[];
}>) {
  const trailSet = new Set(activeTrailIds);

  return (
    <nav className="sidebar-tree" aria-label="站点目录">
      <div className="sidebar-tree__header">
        <p>Table of Contents</p>
        <h2>典籍总览</h2>
      </div>
      <ul>
        {nodes.map((node) =>
          renderNode({
            node,
            activeSlugKey,
            activeTrailIds: trailSet,
            level: 0,
          }),
        )}
      </ul>
    </nav>
  );
}
