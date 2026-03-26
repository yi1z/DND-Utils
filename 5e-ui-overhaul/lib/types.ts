export type Slug = string[];

export type NavNode = {
  id: string;
  title: string;
  slug: Slug | null;
  children: NavNode[];
  order: number;
};

export type TopicEntry = {
  slug: Slug;
  slugKey: string;
  href: string;
  sourcePath: string;
  title: string;
  breadcrumbs: string[];
  headings: string[];
  excerpt: string;
  htmlFile: string;
  prevSlug: Slug | null;
  nextSlug: Slug | null;
  prevHref: string | null;
  nextHref: string | null;
  navTrailIds: string[];
  collectionTitle: string;
};

export type SearchEntry = {
  href: string;
  title: string;
  breadcrumbs: string[];
  collectionTitle: string;
  excerpt: string;
  headings: string[];
  tokens: string[];
};

export type ReaderTopicRef = {
  slugKey: string;
  href: string;
  title: string;
  breadcrumbs: string[];
  collectionTitle: string;
};

export type ReaderState = {
  favorites: ReaderTopicRef[];
  recentHistory: ReaderTopicRef[];
  lastVisited: ReaderTopicRef | null;
};
