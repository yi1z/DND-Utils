"use client";

import { useEffect, useRef } from "react";

import type { ReaderTopicRef } from "../lib/types";
import { useReaderState } from "./reader-state-provider";

export function TopicVisitTracker({
  topic,
}: Readonly<{
  topic: ReaderTopicRef;
}>) {
  const { markVisited } = useReaderState();
  const seenSlug = useRef<string | null>(null);

  useEffect(() => {
    if (seenSlug.current === topic.slugKey) {
      return;
    }

    seenSlug.current = topic.slugKey;
    markVisited(topic);
  }, [markVisited, topic]);

  return null;
}
