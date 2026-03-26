"use client";

import type { ReaderTopicRef } from "../lib/types";
import { useReaderState } from "./reader-state-provider";

export function FavoriteToggle({
  topic,
}: Readonly<{
  topic: ReaderTopicRef;
}>) {
  const { isFavorite, toggleFavorite } = useReaderState();
  const active = isFavorite(topic.slugKey);

  return (
    <button
      type="button"
      className={`favorite-toggle ${active ? "is-active" : ""}`}
      onClick={() => toggleFavorite(topic)}
      aria-pressed={active}
    >
      <span>{active ? "已收藏" : "加入收藏"}</span>
      <small>{active ? "Pinned" : "Favorite"}</small>
    </button>
  );
}
