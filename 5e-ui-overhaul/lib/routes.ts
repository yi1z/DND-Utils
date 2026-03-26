import type { Slug } from "./types";

export function slugKey(slug: Slug): string {
  return slug.join("/");
}

export function routeFromSlug(slug: Slug): string {
  return `/read/${slug.map((segment) => encodeURIComponent(segment)).join("/")}/`;
}

export function decodeRouteSlug(slug: Slug): Slug {
  return slug.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

export function canonicalizeTopicHref(slugKeyValue: string): string {
  return routeFromSlug(slugKeyValue.split("/"));
}
