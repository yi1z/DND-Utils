import { cache } from "react";
import fs from "node:fs/promises";
import path from "node:path";

import { slugKey } from "./routes";
import type { NavNode, SearchEntry, TopicEntry } from "./types";

const projectRoot = process.cwd();
const generatedRoot = path.join(projectRoot, ".generated");
const htmlRoot = path.join(generatedRoot, "html");

type ReaderDataset = {
  toc: NavNode[];
  topics: TopicEntry[];
  searchIndex: SearchEntry[];
  topicMap: Map<string, TopicEntry>;
};

const readJson = cache(async <T>(filePath: string): Promise<T> => {
  const file = await fs.readFile(filePath, "utf8");
  return JSON.parse(file) as T;
});

export const getReaderData = cache(async (): Promise<ReaderDataset> => {
  const [toc, topics, searchIndex] = await Promise.all([
    readJson<NavNode[]>(path.join(generatedRoot, "toc.json")),
    readJson<TopicEntry[]>(path.join(generatedRoot, "topics.json")),
    readJson<SearchEntry[]>(path.join(generatedRoot, "search-index.json")),
  ]);

  return {
    toc,
    topics,
    searchIndex,
    topicMap: new Map(topics.map((topic) => [topic.slugKey, topic])),
  };
});

export async function getTopicBySlug(slug: string[]): Promise<TopicEntry | null> {
  const { topicMap } = await getReaderData();
  return topicMap.get(slugKey(slug)) ?? null;
}

export const getTopicHtml = cache(async (htmlFile: string): Promise<string> => {
  return fs.readFile(path.join(htmlRoot, htmlFile), "utf8");
});
