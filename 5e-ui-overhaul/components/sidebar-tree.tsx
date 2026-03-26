"use client";

import Link from "next/link";
import { useState } from "react";

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

function SidebarBranch({
  node,
  activeSlugKey,
  activeTrailIds,
  level,
}: Readonly<{
  node: NavNode;
  activeSlugKey?: string;
  activeTrailIds: Set<string>;
  level: number;
}>) {
  const nodeSlugKey = node.slug ? slugKey(node.slug) : null;
  const isActive = nodeSlugKey === activeSlugKey;
  const hasChildren = node.children.length > 0;
  const href = findNavigableHref(node);
  const defaultExpanded =
    activeTrailIds.has(node.id) || (level === 0 && node.order < 5);
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!hasChildren) {
    return (
      <li className="sidebar-tree__item">
        {href ? (
          <Link
            href={href}
            prefetch={false}
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
    <li className="sidebar-tree__item sidebar-tree__item--group">
      <div className={`sidebar-tree__group ${expanded ? "is-expanded" : ""}`}>
        <button
          type="button"
          className={`sidebar-tree__summary ${isActive ? "is-active" : ""}`}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span>{node.title}</span>
          <small>{node.children.length}</small>
        </button>

        {expanded ? (
          <div className="sidebar-tree__branch">
            {node.slug && href ? (
              <Link
                href={href}
                prefetch={false}
                className={`sidebar-tree__link sidebar-tree__overview ${
                  isActive ? "is-active" : ""
                }`}
              >
                {"进入《"}
                {node.title}
                {"》"}
              </Link>
            ) : null}

            <ul>
              {node.children.map((child) => (
                <SidebarBranch
                  key={child.id}
                  node={child}
                  activeSlugKey={activeSlugKey}
                  activeTrailIds={activeTrailIds}
                  level={level + 1}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
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
        {nodes.map((node) => (
          <SidebarBranch
            key={node.id}
            node={node}
            activeSlugKey={activeSlugKey}
            activeTrailIds={trailSet}
            level={0}
          />
        ))}
      </ul>
    </nav>
  );
}
