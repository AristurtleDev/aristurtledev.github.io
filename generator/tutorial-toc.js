function visitNodes(node, visitor) {
  if (node === null || typeof node !== 'object') {
    return;
  }

  visitor(node);

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    visitNodes(child, visitor);
  }
}

function readNodeText(node) {
  if (node === null || typeof node !== 'object') {
    return '';
  }

  if (typeof node.value === 'string') {
    return node.value;
  }

  if (typeof node.alt === 'string') {
    return node.alt;
  }

  if (!Array.isArray(node.children)) {
    return '';
  }

  return node.children.map(readNodeText).join('');
}

function slugifyHeading(value) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/gu, '-');

  return slug || 'section';
}

function createHeadingId(baseSlug, slugCounts) {
  const count = (slugCounts.get(baseSlug) ?? 0) + 1;
  slugCounts.set(baseSlug, count);
  return count === 1 ? baseSlug : `${baseSlug}-${count}`;
}

function setHeadingId(node, id) {
  node.data ??= {};
  node.data.hProperties = {
    ...(node.data.hProperties ?? {}),
    id,
  };
}

export function collectTutorialToc(tree) {
  const slugCounts = new Map();
  const toc = [];
  let currentSection = null;

  visitNodes(tree, (node) => {
    if (node?.type !== 'heading' || !Array.isArray(node.children)) {
      return;
    }

    const text = readNodeText(node).replace(/\s+/gu, ' ').trim();

    if (text.length === 0) {
      return;
    }

    const id = createHeadingId(slugifyHeading(text), slugCounts);
    setHeadingId(node, id);

    if (node.depth === 2) {
      currentSection = {
        children: [],
        id,
        text,
      };
      toc.push(currentSection);
      return;
    }

    if (node.depth === 3 && currentSection !== null) {
      currentSection.children.push({
        id,
        text,
      });
    }
  });

  return toc;
}
