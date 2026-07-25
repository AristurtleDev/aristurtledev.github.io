function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatRfc822Date(value) {
  return new Date(value).toUTCString();
}

export function buildSitemapXml(siteBaseUrl, pages) {
  const entries = pages
    .map((page) => {
      const lines = ['  <url>', `    <loc>${escapeXml(new URL(page.path, `${siteBaseUrl}/`).toString())}</loc>`];

      if (page.lastModified) {
        lines.push(`    <lastmod>${escapeXml(page.lastModified)}</lastmod>`);
      }

      lines.push('  </url>');
      return lines.join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    '',
  ].join('\n');
}

export function buildBlogRssXml(siteBaseUrl, entries) {
  const feedUrl = new URL('/blog/rss.xml', `${siteBaseUrl}/`).toString();
  const blogUrl = new URL('/blog/', `${siteBaseUrl}/`).toString();
  const latestPublishedAt = entries.find((entry) => entry.publishedAt)?.publishedAt ?? null;
  const latestDate = latestPublishedAt ?? entries.find((entry) => entry.date)?.date ?? null;
  const itemXml = entries
    .map((entry) => {
      const itemUrl = new URL(entry.path, `${siteBaseUrl}/`).toString();
      const lines = [
        '    <item>',
        `      <title>${escapeXml(entry.title)}</title>`,
        `      <link>${escapeXml(itemUrl)}</link>`,
        `      <guid>${escapeXml(itemUrl)}</guid>`,
        `      <description>${escapeXml(entry.description)}</description>`,
      ];

      if (entry.publishedAt) {
        lines.push(`      <pubDate>${escapeXml(formatRfc822Date(entry.publishedAt))}</pubDate>`);
      } else if (entry.date) {
        lines.push(`      <pubDate>${escapeXml(formatRfc822Date(`${entry.date}T00:00:00Z`))}</pubDate>`);
      }

      lines.push('    </item>');
      return lines.join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Aristurtle Dev Blog</title>',
    `    <link>${escapeXml(blogUrl)}</link>`,
    '    <description>Development logs, notes, and writing from Aristurtle Dev.</description>',
    '    <language>en-US</language>',
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
  ];

  if (latestDate) {
    xml.push(`    <lastBuildDate>${escapeXml(formatRfc822Date(latestDate))}</lastBuildDate>`);
  }

  if (itemXml.length > 0) {
    xml.push(itemXml);
  }

  xml.push('  </channel>', '</rss>', '');
  return xml.join('\n');
}
