import type { Slug } from "./types";

export function slugKey(slug: Slug): string {
  return slug.join("/");
}

export function routeFromSlug(slug: Slug): string {
  return `/read/${slug.map((segment) => encodeURIComponent(segment)).join("/")}/`;
}
