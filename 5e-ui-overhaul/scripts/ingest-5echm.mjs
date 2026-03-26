import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.resolve(
  projectRoot,
  process.env.SOURCE_5ECHM ?? "../5echm_web",
);
const sourceTopicsRoot = path.join(sourceRoot, "topics");
const generatedRoot = path.join(projectRoot, ".generated");
const generatedHtmlRoot = path.join(generatedRoot, "html");
const publicGeneratedRoot = path.join(projectRoot, "public", "generated");
const publicLegacyRoot = path.join(projectRoot, "public", "legacy");

const HTML_EXTENSIONS = new Set([".htm", ".html"]);
const SKIP_DIRS = new Set([".git", ".github", "node_modules"]);
const ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
};

async function main() {
  await assertSource();

  const tocTree = await parseToc();
  const topicFiles = await walkTopicFiles(sourceTopicsRoot);
  const topicDrafts = await buildTopicDrafts(topicFiles);
  const finalToc = attachOrphansToToc(tocTree, topicDrafts);
  const orderedTopics = finalizeTopicMetadata(finalToc, topicDrafts);

  await resetOutputDirs();
  await copyLegacyAssets(sourceRoot, publicLegacyRoot);
  await writeGeneratedArtifacts(finalToc, orderedTopics);

  console.log(
    `5echm ingest complete: ${orderedTopics.length} topics, ${topicFiles.length} source files.`,
  );
}

async function assertSource() {
  const stat = await fs.stat(sourceTopicsRoot).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Missing source topics directory: ${sourceTopicsRoot}`);
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function slugFromTopicsRelative(relativePath) {
  const withoutExtension = toPosix(relativePath).replace(/\.(html?|HTML?)$/i, "");
  return withoutExtension.split("/").filter(Boolean);
}

function slugKey(slug) {
  return slug.join("/");
}

function routeFromSlug(slug) {
  return `/read/${slug.map((segment) => encodeURIComponent(segment)).join("/")}/`;
}

function decodeHtml(input) {
  return input.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (full, entity) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      }
      if (lower.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
      }
      return ENTITY_MAP[lower] ?? full;
    },
  );
}

function stripTags(input) {
  return decodeHtml(input)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(input, limit = 700) {
  const source = stripTags(input).toLowerCase();
  const tokens = [];
  const seen = new Set();

  const push = (token) => {
    if (!token || seen.has(token)) {
      return;
    }
    seen.add(token);
    tokens.push(token);
  };

  const latinMatches = source.match(/[a-z0-9][a-z0-9'’_-]*/g) ?? [];
  for (const match of latinMatches) {
    if (match.length >= 2) {
      push(match);
    }
  }

  const cjkMatches = source.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? [];
  for (const part of cjkMatches) {
    if (part.length === 1) {
      push(part);
      continue;
    }
    for (let index = 0; index < part.length - 1; index += 1) {
      push(part.slice(index, index + 2));
      if (tokens.length >= limit) {
        return tokens;
      }
    }
  }

  return tokens.slice(0, limit);
}

function splitHref(value) {
  const hashIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  const cutIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);

  if (cutIndex === -1) {
    return { pathname: value, suffix: "" };
  }

  return {
    pathname: value.slice(0, cutIndex),
    suffix: value.slice(cutIndex),
  };
}

function encodeWebPath(segments) {
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function isExternalHref(value) {
  return /^(https?:|mailto:|tel:)/i.test(value) || value.startsWith("//");
}

function rewriteUrl(rawValue, currentFilePath) {
  const value = rawValue.trim().replace(/\\/g, "/");
  if (!value || value.startsWith("#") || value.startsWith("data:")) {
    return value;
  }

  if (value.startsWith("javascript:")) {
    return "#";
  }

  if (isExternalHref(value)) {
    return value;
  }

  const { pathname, suffix } = splitHref(value);
  const baseDir = path.dirname(currentFilePath);
  const resolved = value.startsWith("/")
    ? path.join(sourceRoot, pathname)
    : path.resolve(baseDir, pathname);

  if (!resolved.startsWith(sourceRoot)) {
    return value;
  }

  const relativeFromRoot = toPosix(path.relative(sourceRoot, resolved));
  const extension = path.extname(relativeFromRoot).toLowerCase();

  if (resolved.startsWith(sourceTopicsRoot) && HTML_EXTENSIONS.has(extension)) {
    const topicSlug = slugFromTopicsRelative(path.relative(sourceTopicsRoot, resolved));
    return `${routeFromSlug(topicSlug)}${suffix}`;
  }

  return `${encodeWebPath(["legacy", ...relativeFromRoot.split("/")])}${suffix}`;
}

function rewriteAttributes(html, currentFilePath) {
  return html.replace(
    /\b(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, attribute, rawWrapped, doubleQuoted, singleQuoted, bareValue) => {
      const rawValue = doubleQuoted ?? singleQuoted ?? bareValue ?? "";
      const quote = rawWrapped.startsWith("'") ? "'" : '"';
      const rewritten = rewriteUrl(rawValue, currentFilePath);
      return `${attribute}=${quote}${rewritten}${quote}`;
    },
  );
}

function hardenExternalLinks(html) {
  return html.replace(/<a\b([^>]*?\bhref=(["'])(.*?)\2[^>]*)>/gi, (full, attrs, _quote, href) => {
    if (!isExternalHref(href)) {
      return full;
    }

    let nextAttrs = attrs;
    if (!/\btarget=/i.test(nextAttrs)) {
      nextAttrs += ' target="_blank"';
    }
    if (!/\brel=/i.test(nextAttrs)) {
      nextAttrs += ' rel="noreferrer noopener"';
    }
    return `<a${nextAttrs}>`;
  });
}

function rewriteImages(html) {
  return html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    let nextAttrs = attrs;
    if (!/\bloading=/i.test(nextAttrs)) {
      nextAttrs += ' loading="lazy"';
    }
    return `<img${nextAttrs}>`;
  });
}

async function parseToc() {
  const tocFile = await fs.readFile(path.join(sourceRoot, "webhelpcontents.htm"), "utf8");
  const lines = tocFile.split(/\r?\n/);
  const rootNodes = [];
  const stack = [];
  let encounterOrder = 0;

  for (const line of lines) {
    if (!line.includes("<span id=\"l")) {
      continue;
    }

    const titleMatch = line.match(/<span id="l\d+"[^>]*>([\s\S]*?)<\/span>/i);
    if (!titleMatch) {
      continue;
    }

    const title = stripTags(titleMatch[1]);
    const nodeId = line.match(/<span id="l(\d+)"/i)?.[1];
    if (!title || !nodeId) {
      continue;
    }

    const hrefMatch = line.match(/href="(topics\/[^"]+)"/i);
    const slug = hrefMatch
      ? slugFromTopicsRelative(hrefMatch[1].replace(/^topics\//i, ""))
      : null;
    const depth = (line.match(/icons\/line\.gif/gi) ?? []).length;
    const node = {
      id: `toc-${nodeId}`,
      title,
      slug,
      children: [],
      order: encounterOrder,
    };

    if (depth === 0) {
      rootNodes.push(node);
    } else {
      const parent = stack[depth - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    stack[depth] = node;
    stack.length = depth + 1;
    encounterOrder += 1;
  }

  return rootNodes;
}

async function walkTopicFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await walkTopicFiles(entryPath);
      files.push(...nestedFiles);
      continue;
    }

    if (!HTML_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    files.push(entryPath);
  }

  return files.sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

async function buildTopicDrafts(topicFiles) {
  const drafts = [];

  for (const filePath of topicFiles) {
    const relativeFromTopics = path.relative(sourceTopicsRoot, filePath);
    const slug = slugFromTopicsRelative(relativeFromTopics);
    const slugId = slugKey(slug);
    const html = await fs.readFile(filePath, "utf8");
    const titleFromHead = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let body = bodyMatch?.[1] ?? html;

    body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    body = body.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
    body = rewriteAttributes(body, filePath);
    body = hardenExternalLinks(body);
    body = rewriteImages(body);

    const inlineStyles =
      styleBlocks.length > 0 ? `<style>${styleBlocks.join("\n")}</style>\n` : "";
    const transformedHtml = `${inlineStyles}${body}`.trim();
    const plainText = stripTags(transformedHtml);
    const headings = [...transformedHtml.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)]
      .map((match) => stripTags(match[2]))
      .filter(Boolean)
      .slice(0, 18);
    const excerpt = plainText.slice(0, 160);
    const hash = crypto.createHash("sha1").update(slugId).digest("hex");

    drafts.push({
      slug,
      slugKey: slugId,
      href: routeFromSlug(slug),
      sourcePath: toPosix(path.relative(sourceRoot, filePath)),
      title: titleFromHead || slug.at(-1) || "未命名页面",
      headings,
      excerpt,
      plainText,
      transformedHtml,
      htmlFile: `${hash}.html`,
      bodyTokens: tokenizeText(plainText, 320),
      navTrailIds: [],
      breadcrumbs: [],
      collectionTitle: slug[0] ?? "未分类",
      order: Number.MAX_SAFE_INTEGER,
      prevSlug: null,
      nextSlug: null,
      prevHref: null,
      nextHref: null,
    });
  }

  return drafts;
}

function attachOrphansToToc(tocTree, drafts) {
  const tocSlugKeys = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.slug) {
        tocSlugKeys.add(slugKey(node.slug));
      }
      walk(node.children);
    }
  };
  walk(tocTree);

  const orphanDrafts = drafts.filter((draft) => !tocSlugKeys.has(draft.slugKey));
  if (orphanDrafts.length === 0) {
    return tocTree;
  }

  const orphanRoot = {
    id: "toc-orphans",
    title: "未编目页面",
    slug: null,
    children: [],
    order: tocTree.length + 1000,
  };

  const folderMap = new Map();
  let orphanOrder = 0;

  for (const draft of orphanDrafts) {
    let branch = orphanRoot.children;
    let pathKey = "";

    for (let index = 0; index < draft.slug.length - 1; index += 1) {
      const segment = draft.slug[index];
      pathKey = `${pathKey}/${segment}`;
      let node = folderMap.get(pathKey);
      if (!node) {
        node = {
          id: `orphan-${orphanOrder}`,
          title: segment,
          slug: null,
          children: [],
          order: orphanOrder,
        };
        folderMap.set(pathKey, node);
        branch.push(node);
        orphanOrder += 1;
      }
      branch = node.children;
    }

    branch.push({
      id: `orphan-topic-${orphanOrder}`,
      title: draft.title,
      slug: draft.slug,
      children: [],
      order: orphanOrder,
    });
    orphanOrder += 1;
  }

  return [...tocTree, orphanRoot];
}

function finalizeTopicMetadata(tocTree, drafts) {
  const draftMap = new Map(drafts.map((draft) => [draft.slugKey, draft]));
  const orderedTopics = [];
  let navOrder = 0;

  const visitNode = (node, titleTrail, idTrail) => {
    const nextTitleTrail = [...titleTrail, node.title];
    const nextIdTrail = [...idTrail, node.id];

    if (node.slug) {
      const topic = draftMap.get(slugKey(node.slug));
      if (topic && topic.order === Number.MAX_SAFE_INTEGER) {
        topic.title = node.title || topic.title;
        topic.breadcrumbs = nextTitleTrail;
        topic.navTrailIds = nextIdTrail;
        topic.collectionTitle = titleTrail[0] ?? node.title;
        topic.order = navOrder;
        orderedTopics.push(topic);
        navOrder += 1;
      }
    }

    for (const child of node.children) {
      visitNode(child, nextTitleTrail, nextIdTrail);
    }
  };

  for (const node of tocTree) {
    visitNode(node, [], []);
  }

  for (const draft of drafts) {
    if (draft.order !== Number.MAX_SAFE_INTEGER) {
      continue;
    }

    draft.order = navOrder;
    draft.breadcrumbs = draft.slug;
    draft.collectionTitle = draft.slug[0] ?? "未分类";
    orderedTopics.push(draft);
    navOrder += 1;
  }

  for (let index = 0; index < orderedTopics.length; index += 1) {
    const topic = orderedTopics[index];
    const previous = orderedTopics[index - 1] ?? null;
    const next = orderedTopics[index + 1] ?? null;

    topic.prevSlug = previous?.slug ?? null;
    topic.nextSlug = next?.slug ?? null;
    topic.prevHref = previous?.href ?? null;
    topic.nextHref = next?.href ?? null;
  }

  return orderedTopics.map((topic) => ({
    slug: topic.slug,
    slugKey: topic.slugKey,
    href: topic.href,
    sourcePath: topic.sourcePath,
    title: topic.title,
    breadcrumbs: topic.breadcrumbs,
    headings: topic.headings,
    excerpt: topic.excerpt,
    htmlFile: topic.htmlFile,
    prevSlug: topic.prevSlug,
    nextSlug: topic.nextSlug,
    prevHref: topic.prevHref,
    nextHref: topic.nextHref,
    navTrailIds: topic.navTrailIds,
    collectionTitle: topic.collectionTitle,
    transformedHtml: topic.transformedHtml,
    bodyTokens: topic.bodyTokens,
    plainText: topic.plainText,
  }));
}

async function resetOutputDirs() {
  await fs.mkdir(generatedHtmlRoot, { recursive: true });
  await fs.mkdir(publicGeneratedRoot, { recursive: true });
  await fs.mkdir(publicLegacyRoot, { recursive: true });
}

async function copyLegacyAssets(sourceDirectory, targetDirectory) {
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (SKIP_DIRS.has(entry.name)) {
        return;
      }

      const sourcePath = path.join(sourceDirectory, entry.name);
      const targetPath = path.join(targetDirectory, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        await copyLegacyAssets(sourcePath, targetPath);
        return;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (HTML_EXTENSIONS.has(extension)) {
        return;
      }
      if (entry.name.toLowerCase() === "readme.md") {
        return;
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }),
  );
}

async function writeGeneratedArtifacts(tocTree, topicsWithContent) {
  const topics = [];
  const searchEntries = [];

  for (const topic of topicsWithContent) {
    await fs.writeFile(
      path.join(generatedHtmlRoot, topic.htmlFile),
      topic.transformedHtml,
      "utf8",
    );

    const titleTokens = tokenizeText(topic.title, 40);
    const headingTokens = tokenizeText(topic.headings.join(" "), 120);
    const tokens = [...new Set([...titleTokens, ...headingTokens, ...topic.bodyTokens])];

    topics.push({
      slug: topic.slug,
      slugKey: topic.slugKey,
      href: topic.href,
      sourcePath: topic.sourcePath,
      title: topic.title,
      breadcrumbs: topic.breadcrumbs,
      headings: topic.headings,
      excerpt: topic.excerpt,
      htmlFile: topic.htmlFile,
      prevSlug: topic.prevSlug,
      nextSlug: topic.nextSlug,
      prevHref: topic.prevHref,
      nextHref: topic.nextHref,
      navTrailIds: topic.navTrailIds,
      collectionTitle: topic.collectionTitle,
    });

    searchEntries.push({
      href: topic.href,
      title: topic.title,
      breadcrumbs: topic.breadcrumbs,
      collectionTitle: topic.collectionTitle,
      excerpt: topic.excerpt,
      headings: topic.headings,
      tokens,
    });
  }

  const writes = [
    fs.writeFile(path.join(generatedRoot, "toc.json"), JSON.stringify(tocTree), "utf8"),
    fs.writeFile(path.join(generatedRoot, "topics.json"), JSON.stringify(topics), "utf8"),
    fs.writeFile(
      path.join(generatedRoot, "search-index.json"),
      JSON.stringify(searchEntries),
      "utf8",
    ),
    fs.writeFile(path.join(publicGeneratedRoot, "toc.json"), JSON.stringify(tocTree), "utf8"),
    fs.writeFile(
      path.join(publicGeneratedRoot, "search-index.json"),
      JSON.stringify(searchEntries),
      "utf8",
    ),
  ];

  await Promise.all(writes);
}

await main();
