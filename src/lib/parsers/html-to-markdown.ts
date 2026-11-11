/**
 * Konverter ringan HTML (hasil mammoth.convertToHtml dari DOCX) menjadi Markdown terstruktur.
 * Mempertahankan heading, teks tebal/miring, daftar bullet/bernomor bertingkat, dan tabel.
 */

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&bull;': '•',
    '&hellip;': '…',
  };

  return input
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|bull|hellip);/g, (m) => named[m] || m)
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

function stripTagsAndInlineMarkdown(html: string): string {
  let out = html;

  // Hilangkan tag gambar atau komentar HTML
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<img\b[^>]*>/gi, '');

  // Line break
  out = out.replace(/<br\s*\/?>/gi, '\n');

  // Link: pertahankan label teks (dan URL jika http/https)
  out = out.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const cleanLabel = stripTagsAndInlineMarkdown(label).trim();
    if (!cleanLabel) return '';
    if (/^https?:\/\//i.test(href)) {
      return `[${cleanLabel}](${href})`;
    }
    return cleanLabel;
  });

  // Inline code
  out = out.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
    const clean = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
    return clean ? `\`${clean}\`` : '';
  });

  // Bold & italic (proses terdalam dulu berulang kali)
  for (let pass = 0; pass < 3; pass++) {
    out = out.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) => {
      const clean = inner.trim();
      return clean ? `**${clean}**` : '';
    });
    out = out.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) => {
      const clean = inner.trim();
      return clean ? `*${clean}*` : '';
    });
  }

  // Pisahkan antar tag blok di dalam konteks inline (mis. <p>...</p><p>...</p> di dalam <li>)
  out = out.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');

  // Hapus sisa tag inline (span, sup, sub, u, dll.)
  out = out.replace(/<[^>]+>/g, '');
  out = decodeHtmlEntities(out);

  // Rapikan spasi ganda tanpa menghapus newline
  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n');

  return out.trim();
}

interface HtmlNode {
  tag: string;
  attrs: string;
  children: Array<HtmlNode | string>;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

/**
 * Parser pohon tag HTML sederhana yang aman untuk HTML bersih hasil mammoth.
 */
function parseSimpleHtmlTree(html: string): Array<HtmlNode | string> {
  const root: HtmlNode = { tag: 'root', attrs: '', children: [] };
  const stack: HtmlNode[] = [root];
  const tokenRegex = /<\/?([a-zA-Z0-9]+)\b([^>]*)>|([^<]+)/g;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    const full = match[0];
    const tagName = match[1]?.toLowerCase();
    const attrs = match[2] || '';
    const textContent = match[3];

    if (textContent !== undefined) {
      stack[stack.length - 1].children.push(textContent);
      continue;
    }

    if (!tagName) continue;

    if (full.startsWith('</')) {
      // Closing tag: cari di stack dari atas
      for (let idx = stack.length - 1; idx >= 1; idx--) {
        if (stack[idx].tag === tagName) {
          stack.length = idx;
          break;
        }
      }
    } else {
      const isSelfClosing = full.endsWith('/>') || VOID_TAGS.has(tagName);
      const node: HtmlNode = { tag: tagName, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }

  return root.children;
}

function serializeNodeToHtml(node: HtmlNode | string): string {
  if (typeof node === 'string') return node;
  if (VOID_TAGS.has(node.tag)) {
    return node.tag === 'br' ? '<br/>' : '';
  }
  const inner = node.children.map(serializeNodeToHtml).join('');
  return `<${node.tag}${node.attrs}>${inner}</${node.tag}>`;
}

function renderList(node: HtmlNode, depth = 0): string {
  const isOrdered = node.tag === 'ol';
  const indent = '  '.repeat(depth);
  let counter = 1;
  const lines: string[] = [];

  for (const child of node.children) {
    if (typeof child === 'string' || child.tag !== 'li') continue;

    const inlineNodes: Array<HtmlNode | string> = [];
    const nestedLists: HtmlNode[] = [];

    for (const liChild of child.children) {
      if (typeof liChild !== 'string' && (liChild.tag === 'ul' || liChild.tag === 'ol')) {
        nestedLists.push(liChild);
      } else {
        inlineNodes.push(liChild);
      }
    }

    const itemHtml = inlineNodes.map(serializeNodeToHtml).join('');
    const itemText = stripTagsAndInlineMarkdown(itemHtml).replace(/\n+/g, ' ').trim();

    if (itemText) {
      const prefix = isOrdered ? `${counter}. ` : '- ';
      lines.push(`${indent}${prefix}${itemText}`);
      counter++;
    }

    for (const nested of nestedLists) {
      const nestedMd = renderList(nested, depth + 1);
      if (nestedMd) lines.push(nestedMd);
    }
  }

  return lines.join('\n');
}

function renderTable(node: HtmlNode): string {
  const rows: string[][] = [];

  function collectRows(curr: HtmlNode) {
    for (const child of curr.children) {
      if (typeof child === 'string') continue;
      if (child.tag === 'tr') {
        const cells: string[] = [];
        for (const cell of child.children) {
          if (typeof cell !== 'string' && (cell.tag === 'td' || cell.tag === 'th')) {
            const cellText = stripTagsAndInlineMarkdown(cell.children.map(serializeNodeToHtml).join(''))
              .replace(/\n+/g, ' ')
              .replace(/\|/g, '\\|')
              .trim();
            cells.push(cellText);
          }
        }
        if (cells.length > 0) rows.push(cells);
      } else {
        collectRows(child);
      }
    }
  }

  collectRows(node);
  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount === 0) return '';

  const normalizeRow = (r: string[]) =>
    Array.from({ length: colCount }, (_, idx) => r[idx] || '');

  const header = normalizeRow(rows[0]);
  const separator = Array.from({ length: colCount }, () => '---');
  const bodyRows = rows.slice(1).map(normalizeRow);

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...bodyRows.map((r) => `| ${r.join(' | ')} |`),
  ];

  return lines.join('\n');
}

function renderNodes(nodes: Array<HtmlNode | string>): string {
  const blocks: string[] = [];

  for (const node of nodes) {
    if (typeof node === 'string') {
      const txt = stripTagsAndInlineMarkdown(node);
      if (txt) blocks.push(txt);
      continue;
    }

    const tag = node.tag;

    if (/^h([1-6])$/.test(tag)) {
      const level = Number(tag[1]);
      const headingText = stripTagsAndInlineMarkdown(node.children.map(serializeNodeToHtml).join(''))
        .replace(/\n+/g, ' ')
        .trim();
      if (headingText) {
        blocks.push(`${'#'.repeat(level)} ${headingText}`);
      }
      continue;
    }

    if (tag === 'p') {
      const pText = stripTagsAndInlineMarkdown(node.children.map(serializeNodeToHtml).join(''));
      if (pText) blocks.push(pText);
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const listMd = renderList(node, 0);
      if (listMd) blocks.push(listMd);
      continue;
    }

    if (tag === 'table') {
      const tableMd = renderTable(node);
      if (tableMd) blocks.push(tableMd);
      continue;
    }

    if (tag === 'blockquote') {
      const inner = renderNodes(node.children);
      if (inner) {
        const quoted = inner
          .split('\n')
          .map((l) => (l.trim() ? `> ${l}` : '>'))
          .join('\n');
        blocks.push(quoted);
      }
      continue;
    }

    if (tag === 'hr') {
      blocks.push('---');
      continue;
    }

    // Container lain (div, section, body, dll.): rekursi ke children
    const hasBlockChild = node.children.some(
      (c) => typeof c !== 'string' && /^(p|div|h[1-6]|ul|ol|table|blockquote|hr|section|article)$/.test(c.tag)
    );
    if (hasBlockChild) {
      const inner = renderNodes(node.children);
      if (inner) blocks.push(inner);
    } else {
      const inline = stripTagsAndInlineMarkdown(serializeNodeToHtml(node));
      if (inline) blocks.push(inline);
    }
  }

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function htmlToStructuredMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const tree = parseSimpleHtmlTree(html);
  return renderNodes(tree);
}
