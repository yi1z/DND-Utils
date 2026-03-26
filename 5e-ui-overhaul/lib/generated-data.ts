import { cache } from "react";
import fs from "node:fs/promises";
import path from "node:path";

import { slugKey } from "./routes";
import type { NavNode, SearchEntry, TopicEntry } from "./types";

const projectRoot = process.cwd();
const generatedRoot = path.join(projectRoot, ".generated");
const htmlRoot = path.join(generatedRoot, "html");

const readJson = cache(async <T>(filePath: string): Promise<T> => {
  const file = await fs.readFile(filePath, "utf8");
  return JSON.parse(file) as T;
});

export const getToc = cache(async (): Promise<NavNode[]> => {
  return readJson<NavNode[]>(path.join(generatedRoot, "toc.json"));
});

export const getTopics = cache(async (): Promise<TopicEntry[]> => {
  return readJson<TopicEntry[]>(path.join(generatedRoot, "topics.json"));
});

export const getSearchIndex = cache(async (): Promise<SearchEntry[]> => {
  return readJson<SearchEntry[]>(path.join(generatedRoot, "search-index.json"));
});

export const getTopicMap = cache(async (): Promise<Map<string, TopicEntry>> => {
  const topics = await getTopics();
  return new Map(topics.map((topic) => [topic.slugKey, topic]));
});

export async function getTopicBySlug(slug: string[]): Promise<TopicEntry | null> {
  const topicMap = await getTopicMap();
  return topicMap.get(slugKey(slug)) ?? null;
}

export const getTopicHtml = cache(async (htmlFile: string): Promise<string> => {
  return fs.readFile(path.join(htmlRoot, htmlFile), "utf8");
});
