"use client";

import { useEffect, useState } from "react";

import type { NavNode } from "../lib/types";
import { SidebarTree } from "./sidebar-tree";

let cachedToc: NavNode[] | null = null;
let tocRequest: Promise<NavNode[]> | null = null;

async function loadToc() {
  if (cachedToc) {
    return cachedToc;
  }

  if (!tocRequest) {
    tocRequest = fetch("/generated/toc.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load table of contents.");
        }

        const payload = (await response.json()) as NavNode[];
        cachedToc = payload;
        return payload;
      })
      .catch((error: unknown) => {
        tocRequest = null;
        throw error;
      });
  }

  return tocRequest;
}

export function SidebarNav({
  activeSlugKey,
  activeTrailIds = [],
}: Readonly<{
  activeSlugKey?: string;
  activeTrailIds?: string[];
}>) {
  const [nodes, setNodes] = useState<NavNode[] | null>(() => cachedToc);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (nodes || loadError) {
      return;
    }

    let cancelled = false;

    loadToc()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setNodes(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, loadError, nodes]);

  if (nodes) {
    return (
      <SidebarTree
        nodes={nodes}
        activeSlugKey={activeSlugKey}
        activeTrailIds={activeTrailIds}
      />
    );
  }

  if (loadError) {
    return (
      <div className="sidebar-tree sidebar-tree--status">
        <div className="sidebar-tree__header">
          <p>Table of Contents</p>
          <h2>Codex Index</h2>
        </div>

        <div className="sidebar-tree__status">
          <p>Table of contents failed to load.</p>
          <button
            type="button"
            className="shell-button shell-button--ghost"
            onClick={() => {
              setLoadError(false);
              setAttempt((current) => current + 1);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-tree sidebar-tree--status">
      <div className="sidebar-tree__header">
        <p>Table of Contents</p>
        <h2>Codex Index</h2>
      </div>

      <div className="sidebar-tree__status sidebar-tree__status--loading">
        <span className="sidebar-tree__pulse" aria-hidden="true" />
        <p>Loading table of contents...</p>
      </div>
    </div>
  );
}
