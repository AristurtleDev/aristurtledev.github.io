import { access, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import { buildBlogRssXml, buildSitemapXml } from './feeds.js';
import { collectTutorialToc } from './tutorial-toc.js';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

const CALLOUT_MARKER_PATTERN = /^\[!([a-z]+)\][ \t]*/iu;
const CALLOUT_TYPES = new Set(['caution', 'important', 'info', 'note', 'success', 'tip', 'warning']);
const DATE_DIRECTORY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TWELVE_HOUR_TIME_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/u;
const TWENTY_FOUR_HOUR_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/u;
const IMAGE_PATTERN = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
const CODE_LANGUAGE_ALIASES = new Map([
  ['c', 'c'],
  ['cpp', 'cpp'],
  ['cs', 'csharp'],
  ['csharp', 'csharp'],
  ['json', 'json'],
  ['xml', 'xml'],
]);

hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);

async function main() {
  const config = await loadConfig();
  const paths = resolvePaths(config);
  const templates = await loadTemplates(paths.templatesDir);

  console.info('[build:info] Starting site build.');
  await prepareOutputDirectory(paths.outputDir);
  await copyStaticDirectory(paths.staticDir, paths.outputDir);
  const customPageRoutes = await renderCustomPages(paths, templates.layout, config.siteBaseUrl);

  const blogEntries = await loadCollectionEntries(paths.blogDir, 'blog');
  const tutorialEntries = await loadCollectionEntries(paths.tutorialDir, 'tutorials');

  const blogRoutes = await renderCollectionEntries(
    blogEntries,
    paths.outputDir,
    templates.layout,
    templates.blog,
    config.siteBaseUrl,
  );
  const tutorialRoutes = await renderCollectionEntries(
    tutorialEntries,
    paths.outputDir,
    templates.layout,
    templates.tutorial,
    config.siteBaseUrl,
  );

  const blogIndexRoute = await renderCollectionIndex(
    blogEntries,
    paths.outputDir,
    templates.layout,
    templates.blogIndex,
    templates.partials,
    config.siteBaseUrl,
  );
  const tutorialIndexRoute = await renderCollectionIndex(
    tutorialEntries,
    paths.outputDir,
    templates.layout,
    templates.tutorialIndex,
    templates.partials,
    config.siteBaseUrl,
  );
  await renderSitemap(
    paths.outputDir,
    config.siteBaseUrl,
    customPageRoutes.concat(blogRoutes, tutorialRoutes, blogIndexRoute, tutorialIndexRoute),
  );
  await renderBlogRss(paths.outputDir, config.siteBaseUrl, blogEntries);

  console.info('[build:info] Site build completed.');
}

async function loadConfig() {
  const configFile = path.resolve(process.cwd(), 'site.config.json');
  const source = await readFile(configFile, 'utf8');
  const config = JSON.parse(source);

  for (const key of ['rootDir', 'siteBaseUrl', 'blogDir', 'tutorialDir', 'siteDir', 'outputDir']) {
    if (typeof config[key] !== 'string' || config[key].trim().length === 0) {
      throw new Error(`site.config.json must define a non-empty "${key}" string.`);
    }
  }

  return {
    ...config,
    siteBaseUrl: config.siteBaseUrl.replace(/\/+$/u, ''),
  };
}

function resolvePaths(config) {
  const rootDir = path.resolve(process.cwd(), config.rootDir);
  const siteDir = path.resolve(rootDir, config.siteDir);

  return {
    blogDir: path.resolve(rootDir, config.blogDir),
    outputDir: path.resolve(rootDir, config.outputDir),
    pagesDir: path.join(siteDir, 'pages'),
    staticDir: path.join(siteDir, 'static'),
    templatesDir: path.join(siteDir, 'templates'),
    tutorialDir: path.resolve(rootDir, config.tutorialDir),
  };
}

async function loadTemplates(templatesDir) {
  const partialsDir = path.join(templatesDir, 'partials');
  const [layout, blog, tutorial, blogIndex, tutorialIndex, indexCard, indexEmpty, indexList] = await Promise.all([
    loadTemplateFile(path.join(templatesDir, 'layout.html')),
    loadTemplateFile(path.join(templatesDir, 'blog.html')),
    loadTemplateFile(path.join(templatesDir, 'tutorial.html')),
    loadTemplateFile(path.join(templatesDir, 'blog-index.html')),
    loadTemplateFile(path.join(templatesDir, 'tutorial-index.html')),
    readFile(path.join(partialsDir, 'index-card.html'), 'utf8'),
    readFile(path.join(partialsDir, 'index-empty.html'), 'utf8'),
    readFile(path.join(partialsDir, 'index-list.html'), 'utf8'),
  ]);

  return {
    blog,
    blogIndex,
    layout,
    partials: {
      indexCard,
      indexEmpty,
      indexList,
    },
    tutorial,
    tutorialIndex,
  };
}

async function loadTemplateFile(file) {
  const parsed = matter(await readFile(file, 'utf8'));
  return {
    content: parsed.content.trim(),
    data: parsed.data ?? {},
    file,
  };
}

async function prepareOutputDirectory(outputDir) {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });
}

async function copyStaticDirectory(staticDir, outputDir) {
  if (!(await pathExists(staticDir))) {
    return;
  }

  await cp(staticDir, outputDir, { recursive: true });
}

async function renderCustomPages(paths, layoutTemplate, siteBaseUrl) {
  if (!(await pathExists(paths.pagesDir))) {
    return [];
  }

  const pageFiles = await collectFiles(paths.pagesDir, '.html');
  const routes = [];

  for (const pageFile of pageFiles) {
    const pageTemplate = await loadTemplateFile(pageFile);
    const relativePath = toPosix(path.relative(paths.pagesDir, pageFile));
    const route = resolveHtmlRoute(relativePath);
    const html = renderLayout(layoutTemplate.content, {
      bodyClass: readOptionalString(pageTemplate.data.bodyClass),
      canonicalUrl: buildCanonicalUrl(siteBaseUrl, route.canonicalPath),
      content: pageTemplate.content,
      currentSection: readOptionalString(pageTemplate.data.currentSection),
      description: readRequiredString(pageTemplate.data.description, 'description', pageFile),
      ogType: readOptionalString(pageTemplate.data.ogType) ?? 'website',
      pageScripts: '',
      title: readRequiredString(pageTemplate.data.title, 'title', pageFile),
    });

    await writeOutputFile(path.join(paths.outputDir, route.outputPath), html);
    routes.push({ lastModified: null, path: route.canonicalPath });
  }

  return routes;
}

async function loadCollectionEntries(collectionDir, collectionName) {
  if (!(await pathExists(collectionDir))) {
    return [];
  }

  const files = await collectFiles(collectionDir, '.md');
  const entries = [];

  for (const file of files) {
    const parsed = matter(await readFile(file, 'utf8'));
    const frontMatter = normalizeFrontMatter(parsed.data, file);
    const body = parsed.content.trim();
    const slug = frontMatter.slug ?? resolveDefaultSlug(file, collectionDir, collectionName);
    const title = frontMatter.title ?? extractMarkdownTitle(body) ?? titleize(slug);
    const description = frontMatter.description ?? extractDescription(body, title);
    const date = frontMatter.date ?? null;
    const time = frontMatter.time ?? null;
    const route = resolveCollectionEntryRoute(collectionName, collectionDir, file, slug, date);

    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(`Invalid slug "${slug}" in ${file}. Use lowercase kebab-case.`);
    }

    entries.push({
      body,
      collectionName,
      date,
      description,
      file,
      href: route.canonicalPath,
      outputPath: route.outputPath,
      publishedAt: buildPublishedAt(date, time),
      slug,
      time,
      title,
    });
  }

  entries.sort((left, right) => {
    if (left.publishedAt && right.publishedAt) {
      const timeComparison = right.publishedAt.localeCompare(left.publishedAt);

      if (timeComparison !== 0) {
        return timeComparison;
      }
    } else if (left.publishedAt) {
      return -1;
    } else if (right.publishedAt) {
      return 1;
    } else if (left.date && right.date) {
      const dateComparison = right.date.localeCompare(left.date);

      if (dateComparison !== 0) {
        return dateComparison;
      }
    } else if (left.date) {
      return -1;
    } else if (right.date) {
      return 1;
    }

    const titleComparison = left.title.localeCompare(right.title);

    if (titleComparison !== 0) {
      return titleComparison;
    }

    return left.href.localeCompare(right.href);
  });

  return entries;
}

async function renderCollectionEntries(entries, outputDir, layoutTemplate, pageTemplate, siteBaseUrl) {
  const routes = [];

  for (const entry of entries) {
    const outputFile = path.join(outputDir, entry.outputPath);

    await copyMarkdownAssets(entry.body, entry.file, path.dirname(outputFile));

    const renderedMarkdown = await renderMarkdown(entry.body);
    const isTutorialEntry = entry.collectionName === 'tutorials';

    const content = applyTemplate(pageTemplate.content, {
      articleMetaClass: entry.date ? 'article-meta' : 'article-meta is-hidden',
      content: renderedMarkdown.html,
      dateDisplay: entry.date ? escapeHtml(formatDate(entry.date)) : '',
      dateIso: entry.date ?? '',
      tutorialToc: isTutorialEntry ? renderTutorialToc(renderedMarkdown.toc) : '',
    });

    const html = renderLayout(layoutTemplate.content, {
      bodyClass: readOptionalString(pageTemplate.data.bodyClass),
      canonicalUrl: buildCanonicalUrl(siteBaseUrl, entry.href),
      content,
      currentSection: readOptionalString(pageTemplate.data.currentSection),
      description: entry.description,
      ogType: readOptionalString(pageTemplate.data.ogType) ?? 'article',
      pageScripts: isTutorialEntry && renderedMarkdown.toc.length > 0 ? buildTutorialPageScripts() : '',
      title: entry.title,
    });

    await writeOutputFile(outputFile, html);
    routes.push({
      lastModified: entry.date,
      path: entry.href,
    });
  }

  return routes;
}

async function renderCollectionIndex(entries, outputDir, layoutTemplate, indexTemplate, partials, siteBaseUrl) {
  const listContent =
    entries.length === 0
      ? applyTemplate(partials.indexEmpty, {
          message: escapeHtml(readRequiredString(indexTemplate.data.emptyMessage, 'emptyMessage', indexTemplate.file)),
        })
      : applyTemplate(partials.indexList, {
          items: entries
            .map((entry, index) => {
              return applyTemplate(partials.indexCard, {
                dateDisplay: entry.date ? escapeHtml(formatDate(entry.date)) : 'Undated',
                dateIso: entry.date ?? '',
                href: escapeHtml(entry.href),
                indexNumber: String(index + 1).padStart(2, '0'),
                summary: escapeHtml(entry.description),
                title: escapeHtml(entry.title),
              });
            })
            .join('\n'),
        });

  const content = applyTemplate(indexTemplate.content, {
    content: listContent,
  });

  const html = renderLayout(layoutTemplate.content, {
    bodyClass: readOptionalString(indexTemplate.data.bodyClass),
    canonicalUrl: buildCanonicalUrl(
      siteBaseUrl,
      readRequiredString(indexTemplate.data.canonicalPath, 'canonicalPath', indexTemplate.file),
    ),
    content,
    currentSection: readOptionalString(indexTemplate.data.currentSection),
    description: readRequiredString(indexTemplate.data.description, 'description', indexTemplate.file),
    ogType: readOptionalString(indexTemplate.data.ogType) ?? 'website',
    pageScripts: '',
    title: readRequiredString(indexTemplate.data.title, 'title', indexTemplate.file),
  });

  const outputPath = readRequiredString(indexTemplate.data.outputPath, 'outputPath', indexTemplate.file);
  const canonicalPath = readRequiredString(indexTemplate.data.canonicalPath, 'canonicalPath', indexTemplate.file);
  await writeOutputFile(path.join(outputDir, outputPath), html);

  return {
    lastModified: entries.find((entry) => entry.date)?.date ?? null,
    path: canonicalPath,
  };
}

async function renderSitemap(outputDir, siteBaseUrl, routes) {
  const sitemapXml = buildSitemapXml(siteBaseUrl, dedupeRoutes(routes));
  await writeOutputFile(path.join(outputDir, 'sitemap.xml'), sitemapXml);
}

async function renderBlogRss(outputDir, siteBaseUrl, blogEntries) {
  const feedXml = buildBlogRssXml(
    siteBaseUrl,
    blogEntries.map((entry) => ({
      date: entry.date,
      description: entry.description,
      path: entry.href,
      publishedAt: entry.publishedAt,
      title: entry.title,
    })),
  );

  await writeOutputFile(path.join(outputDir, 'blog', 'rss.xml'), feedXml);
}

function normalizeFrontMatter(data, file) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Front matter in ${file} must be an object when present.`);
  }

  const normalized = {};

  if (Reflect.has(data, 'title')) {
    normalized.title = readRequiredString(data.title, 'title', file);
  }

  if (Reflect.has(data, 'description')) {
    normalized.description = readRequiredString(data.description, 'description', file);
  }

  if (Reflect.has(data, 'slug')) {
    normalized.slug = readRequiredString(data.slug, 'slug', file);
  }

  if (Reflect.has(data, 'date')) {
    normalized.date = readDateString(data.date, file);
  }

  if (Reflect.has(data, 'time')) {
    normalized.time = readTimeString(data.time, file);
  }

  return normalized;
}

function readRequiredString(value, field, file) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected "${field}" in ${file} to be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readDateString(value, file) {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value;

  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
    throw new Error(`Expected "date" in ${file} to be a valid date string.`);
  }

  return raw.slice(0, 10);
}

function readTimeString(value, file) {
  if (typeof value !== 'string') {
    throw new Error(`Expected "time" in ${file} to be a valid time string.`);
  }

  const trimmed = value.trim();
  const twelveHourMatch = trimmed.match(TWELVE_HOUR_TIME_PATTERN);

  if (twelveHourMatch !== null) {
    const [, hours, minutes, meridiem] = twelveHourMatch;
    return `${hours.padStart(2, '0')}:${minutes} ${meridiem.toUpperCase()}`;
  }

  const twentyFourHourMatch = trimmed.match(TWENTY_FOUR_HOUR_TIME_PATTERN);

  if (twentyFourHourMatch !== null) {
    const [, hours, minutes] = twentyFourHourMatch;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }

  throw new Error(`Expected "time" in ${file} to use "HH:MM", "H:MM", or "HH:MM AM/PM" format.`);
}

async function renderMarkdown(markdown) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkTutorialToc)
    .use(remarkObsidianCallouts)
    .use(remarkHighlightCodeBlocks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true });

  const file = await processor.process(markdown);

  return {
    html: String(file),
    toc: Array.isArray(file.data.toc) ? file.data.toc : [],
  };
}

function remarkTutorialToc() {
  return (tree, file) => {
    file.data.toc = collectTutorialToc(tree);
  };
}

function renderTutorialToc(items) {
  if (items.length === 0) {
    return '';
  }

  return [
    '<aside class="tutorial-toc-shell is-open">',
    '  <button',
    '    class="tutorial-toc-toggle"',
    '    type="button"',
    '    aria-controls="tutorial-toc-panel"',
    '    aria-expanded="true"',
    '    data-tutorial-toc-toggle',
    '  >',
    '    <span>On this page</span>',
    '    <span class="tutorial-toc-toggle-icon" aria-hidden="true"></span>',
    '  </button>',
    '  <nav id="tutorial-toc-panel" class="tutorial-toc" aria-label="Table of contents" data-tutorial-toc>',
    '    <p class="tutorial-toc-label">On this page</p>',
    `    ${renderTutorialTocList(items)}`,
    '  </nav>',
    '</aside>',
  ].join('\n');
}

function renderTutorialTocList(items, isSublist = false) {
  const className = isSublist ? 'tutorial-toc-sublist' : 'tutorial-toc-list';
  const itemMarkup = items
    .map((item) => {
      const children = Array.isArray(item.children) ? item.children : [];
      const childList = children.length === 0 ? '' : `\n${renderTutorialTocList(children, true)}`;

      return [
        '      <li class="tutorial-toc-item">',
        `        <a class="tutorial-toc-link" href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>${childList}`,
        '      </li>',
      ].join('\n');
    })
    .join('\n');

  return [`<ol class="${className}">`, itemMarkup, '</ol>'].join('\n');
}

function buildTutorialPageScripts() {
  return '<script src="/js/site.js" defer></script>';
}

function remarkObsidianCallouts() {
  return (tree) => {
    transformCalloutBlockquotes(tree);
  };
}

function remarkHighlightCodeBlocks() {
  return (tree) => {
    visitMarkdownNodes(tree, (node, index, parent) => {
      if (node.type !== 'code' || parent === null || index === null || !Array.isArray(parent.children)) {
        return;
      }

      parent.children[index] = {
        type: 'html',
        value: renderHighlightedCodeBlock(node.lang, node.value),
      };
    });
  };
}

function transformCalloutBlockquotes(node) {
  if (node === null || typeof node !== 'object' || !Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    transformCalloutBlockquotes(child);

    if (child?.type !== 'blockquote') {
      continue;
    }

    const replacementNodes = transformCalloutBlockquote(child);

    if (replacementNodes === null) {
      continue;
    }

    node.children.splice(index, 1, ...replacementNodes);
    index += replacementNodes.length - 1;
  }
}

function visitMarkdownNodes(node, visitor, parent = null) {
  if (node === null || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node.children)) {
    for (let index = 0; index < node.children.length; index += 1) {
      visitMarkdownNodes(node.children[index], visitor, node);
      visitor(node.children[index], index, node);
    }
  }
}

function renderHighlightedCodeBlock(language, source) {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const highlighted = normalizedLanguage === null ? escapeHtml(source) : highlightCode(source, normalizedLanguage);
  const languageClass = normalizedLanguage === null ? '' : ` language-${normalizedLanguage}`;

  return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`;
}

function normalizeCodeLanguage(language) {
  if (typeof language !== 'string') {
    return null;
  }

  return CODE_LANGUAGE_ALIASES.get(language.trim().toLowerCase()) ?? null;
}

function highlightCode(source, language) {
  return hljs.highlight(source, {
    ignoreIllegals: true,
    language,
  }).value;
}

function transformCalloutBlockquote(node) {
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return null;
  }

  if (parseCalloutParagraph(node.children[0]) === null) {
    return null;
  }

  const calloutNodes = [];
  let startIndex = 0;

  while (startIndex < node.children.length) {
    const parsedCallout = parseCalloutParagraph(node.children[startIndex]);

    if (parsedCallout === null) {
      return null;
    }

    let nextStartIndex = node.children.length;

    for (let index = startIndex + 1; index < node.children.length; index += 1) {
      if (parseCalloutParagraph(node.children[index]) !== null) {
        nextStartIndex = index;
        break;
      }
    }

    calloutNodes.push(
      buildCalloutNode(
        parsedCallout.calloutType,
        parsedCallout.titleChildren,
        parsedCallout.bodyChildren,
        node.children.slice(startIndex + 1, nextStartIndex),
      ),
    );

    startIndex = nextStartIndex;
  }

  return calloutNodes;
}

function parseCalloutParagraph(node) {
  if (node?.type !== 'paragraph' || !Array.isArray(node.children) || node.children.length === 0) {
    return null;
  }

  const [firstChild, ...remainingChildren] = node.children;

  if (firstChild?.type !== 'text') {
    return null;
  }

  const match = CALLOUT_MARKER_PATTERN.exec(firstChild.value);

  if (match === null) {
    return null;
  }

  const calloutType = match[1].toLowerCase();

  if (!CALLOUT_TYPES.has(calloutType)) {
    return null;
  }

  const childrenAfterMarker = [];
  const titleRemainder = firstChild.value.slice(match[0].length);

  if (titleRemainder.length > 0) {
    childrenAfterMarker.push({
      ...firstChild,
      value: titleRemainder,
    });
  }

  childrenAfterMarker.push(...remainingChildren);

  const { bodyChildren, titleChildren } = splitCalloutParagraph(childrenAfterMarker);

  return {
    bodyChildren: trimMarkdownChildren(bodyChildren),
    calloutType,
    titleChildren: trimMarkdownChildren(titleChildren),
  };
}

function splitCalloutParagraph(children) {
  const titleChildren = [];
  const bodyChildren = [];
  let foundBodyStart = false;

  for (const child of children) {
    if (!foundBodyStart && child?.type === 'text') {
      const newlineIndex = child.value.indexOf('\n');

      if (newlineIndex >= 0) {
        const titleText = child.value.slice(0, newlineIndex);
        const bodyText = child.value.slice(newlineIndex + 1);

        if (titleText.length > 0) {
          titleChildren.push({
            ...child,
            value: titleText,
          });
        }

        if (bodyText.length > 0) {
          bodyChildren.push({
            ...child,
            value: bodyText,
          });
        }

        foundBodyStart = true;
        continue;
      }
    }

    if (foundBodyStart) {
      bodyChildren.push(child);
      continue;
    }

    titleChildren.push(child);
  }

  return {
    bodyChildren,
    titleChildren,
  };
}

function trimMarkdownChildren(children) {
  const trimmedChildren = [...children];

  while (trimmedChildren.length > 0) {
    const firstChild = trimTextNode(trimmedChildren[0], 'start');

    if (firstChild === null) {
      trimmedChildren.shift();
      continue;
    }

    trimmedChildren[0] = firstChild;
    break;
  }

  while (trimmedChildren.length > 0) {
    const lastIndex = trimmedChildren.length - 1;
    const lastChild = trimTextNode(trimmedChildren[lastIndex], 'end');

    if (lastChild === null) {
      trimmedChildren.pop();
      continue;
    }

    trimmedChildren[lastIndex] = lastChild;
    break;
  }

  return trimmedChildren;
}

function trimTextNode(node, side) {
  if (node?.type !== 'text') {
    return node;
  }

  const value = side === 'start' ? node.value.replace(/^\s+/u, '') : node.value.replace(/\s+$/u, '');

  if (value.length === 0) {
    return null;
  }

  if (value === node.value) {
    return node;
  }

  return {
    ...node,
    value,
  };
}

function buildCalloutNode(calloutType, titleChildren, bodyChildren, remainingChildren) {
  const children = [
    {
      children: titleChildren.length > 0 ? titleChildren : [{ type: 'text', value: titleize(calloutType) }],
      data: {
        hName: 'p',
        hProperties: {
          className: ['callout-title'],
        },
      },
      type: 'paragraph',
    },
  ];

  if (bodyChildren.length > 0) {
    children.push({
      children: bodyChildren,
      type: 'paragraph',
    });
  }

  children.push(...remainingChildren);

  return {
    children,
    data: {
      hName: 'aside',
      hProperties: {
        className: ['callout', `callout-${calloutType}`],
        'data-callout': calloutType,
      },
    },
    type: 'blockquote',
  };
}

async function copyMarkdownAssets(markdown, markdownFile, outputDir) {
  const sourceDir = path.dirname(markdownFile);
  const copiedTargets = new Set();

  for (const match of markdown.matchAll(IMAGE_PATTERN)) {
    const target = normalizeAssetTarget(match[1]);

    if (target === null || copiedTargets.has(target)) {
      continue;
    }

    copiedTargets.add(target);

    const sourceFile = await resolveAssetSourceFile(sourceDir, target, markdownFile);
    const outputFile = path.join(outputDir, target);

    await mkdir(path.dirname(outputFile), { recursive: true });
    await copyFile(sourceFile, outputFile);
  }
}

function normalizeAssetTarget(target) {
  const normalized = target.trim().replace(/^<|>$/gu, '').split(/[?#]/u, 1)[0];

  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  ) {
    return null;
  }

  const safeTarget = path.normalize(normalized);

  if (path.isAbsolute(safeTarget) || safeTarget.startsWith('..')) {
    throw new Error(`Refusing to copy asset outside the content directory: "${target}".`);
  }

  return safeTarget;
}

async function resolveAssetSourceFile(sourceDir, target, markdownFile) {
  const candidates = [path.join(sourceDir, target)];

  if (!target.includes('/') && !target.includes('\\')) {
    candidates.push(path.join(sourceDir, 'attachments', target));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Missing asset "${target}" referenced by ${markdownFile}.`);
}

function renderLayout(template, options) {
  const navigation = buildNavigationState(options.currentSection);

  return applyTemplate(template, {
    blogCurrent: navigation.blogCurrent,
    bodyClass: escapeHtml(options.bodyClass ?? 'site-body'),
    canonicalUrl: escapeHtml(options.canonicalUrl),
    content: options.content,
    description: escapeHtml(options.description),
    ogType: escapeHtml(options.ogType),
    pageScripts: options.pageScripts,
    projectsCurrent: navigation.projectsCurrent,
    title: escapeHtml(options.title),
    tutorialsCurrent: navigation.tutorialsCurrent,
  });
}

function buildNavigationState(currentSection) {
  return {
    blogCurrent: currentSection === 'blog' ? ' aria-current="page"' : '',
    projectsCurrent: currentSection === 'projects' ? ' aria-current="page"' : '',
    tutorialsCurrent: currentSection === 'tutorials' ? ' aria-current="page"' : '',
  };
}

function applyTemplate(template, replacements) {
  let rendered = template;

  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${token}}}`, value);
  }

  return rendered;
}

function extractMarkdownTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/mu);
  return match?.[1]?.trim() || null;
}

function extractDescription(markdown, fallbackTitle) {
  const lines = markdown.split(/\r?\n/u);
  const excerptLines = [];
  let insideCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      insideCodeFence = !insideCodeFence;
      continue;
    }

    if (
      insideCodeFence ||
      trimmed.length === 0 ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('![') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('> ')
    ) {
      if (excerptLines.length > 0) {
        break;
      }

      continue;
    }

    excerptLines.push(trimmed);
  }

  const excerpt = stripMarkdownFormatting(excerptLines.join(' '));
  return clipText(excerpt, 160) || fallbackTitle;
}

function stripMarkdownFormatting(value) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '$1')
    .replace(/[*_`~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function clipText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function buildCanonicalUrl(siteBaseUrl, pathname) {
  return new URL(pathname, `${siteBaseUrl}/`).toString();
}

function resolveHtmlRoute(relativePath) {
  const parsed = path.posix.parse(relativePath);
  const directory = parsed.base === 'index.html' ? parsed.dir : path.posix.join(parsed.dir, parsed.name);
  const canonicalPath = directory.length === 0 ? '/' : `/${directory}/`;
  const outputPath = directory.length === 0 ? 'index.html' : path.posix.join(directory, 'index.html');

  return { canonicalPath, outputPath };
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

async function writeOutputFile(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function collectFiles(directory, extension) {
  const dirents = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const dirent of dirents) {
    const fullPath = path.join(directory, dirent.name);

    if (dirent.isDirectory()) {
      files.push(...(await collectFiles(fullPath, extension)));
      continue;
    }

    if (dirent.isFile() && fullPath.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

function resolveDefaultSlug(file, collectionDir, collectionName) {
  if (collectionName === 'blog') {
    return path.basename(file, path.extname(file));
  }

  return path.basename(path.dirname(file));
}

function resolveCollectionEntryRoute(collectionName, collectionDir, file, slug, date) {
  if (collectionName === 'blog') {
    return resolveBlogEntryRoute(collectionName, collectionDir, file, slug, date);
  }

  return {
    canonicalPath: `/${collectionName}/${slug}/`,
    outputPath: path.posix.join(collectionName, slug, 'index.html'),
  };
}

function resolveBlogEntryRoute(collectionName, collectionDir, file, slug, date) {
  const relativePath = toPosix(path.relative(collectionDir, file));
  const parsed = path.posix.parse(relativePath);
  const directorySegments = parsed.dir.split('/').filter(Boolean);

  if (directorySegments.length !== 1) {
    throw new Error(
      `Blog posts must live directly inside a dated folder like content/blog/YYYY-MM-DD/post.md. Received ${file}.`,
    );
  }

  const [dateDirectory] = directorySegments;

  if (!DATE_DIRECTORY_PATTERN.test(dateDirectory) || Number.isNaN(Date.parse(`${dateDirectory}T00:00:00Z`))) {
    throw new Error(`Blog directory "${dateDirectory}" in ${file} must use the YYYY-MM-DD format.`);
  }

  if (date !== null && date !== dateDirectory) {
    throw new Error(`Blog post date "${date}" in ${file} must match its parent directory "${dateDirectory}".`);
  }

  return {
    canonicalPath: `/${collectionName}/${slug}/`,
    outputPath: path.posix.join(collectionName, slug, 'index.html'),
  };
}

function buildPublishedAt(date, time) {
  if (date === null) {
    return null;
  }

  const normalizedTime = normalizePublishedTime(time);
  return `${date}T${normalizedTime}:00Z`;
}

function normalizePublishedTime(time) {
  if (time === null) {
    return '00:00';
  }

  const twelveHourMatch = time.match(TWELVE_HOUR_TIME_PATTERN);

  if (twelveHourMatch !== null) {
    let hours = Number.parseInt(twelveHourMatch[1], 10);
    const minutes = twelveHourMatch[2];
    const meridiem = twelveHourMatch[3].toUpperCase();

    if (hours === 12) {
      hours = 0;
    }

    if (meridiem === 'PM') {
      hours += 12;
    }

    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  const twentyFourHourMatch = time.match(TWENTY_FOUR_HOUR_TIME_PATTERN);

  if (twentyFourHourMatch !== null) {
    return `${twentyFourHourMatch[1].padStart(2, '0')}:${twentyFourHourMatch[2]}`;
  }

  throw new Error(`Unable to normalize time value "${time}".`);
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function titleize(value) {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dedupeRoutes(routes) {
  const uniqueRoutes = new Map();

  for (const route of routes) {
    uniqueRoutes.set(route.path, route);
  }

  return [...uniqueRoutes.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function toPosix(value) {
  return value.replaceAll(path.sep, path.posix.sep);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

await main().catch((error) => {
  console.error(`[build:error] ${error instanceof Error ? error.message : 'Unknown build failure.'}`);
  process.exitCode = 1;
});
