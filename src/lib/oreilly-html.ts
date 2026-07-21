/**
 * O'Reilly chapter HTML -> (a) ordered plain text for the TTS pipeline and
 * (b) sanitized display HTML for the read-along player.
 *
 * Accepts either a full saved reader page (content under #sbo-rt-content) or a
 * raw HTMLBook fragment (section[data-type="chapter"]). Emits blank-line
 * separated blocks in reading order. Citation brackets like [Lindsay1979] are
 * left in — the LLM cleaning pass strips them (everything goes through the LLM
 * by design). Figures become spoken blocks built from their caption + alt text.
 *
 * Every element that produces a spoken block is stamped with data-lb="<index>"
 * in the display HTML, so the player can highlight and seek by block without
 * re-deriving the mapping client-side.
 */

import { JSDOM } from 'jsdom';

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DT', 'DD',
]);

const STRIP_TAGS = ['script', 'style', 'link', 'iframe', 'noscript', 'object', 'embed', 'form'];

function collapse(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function figureToText(fig: Element): string {
  const img = fig.querySelector('img');
  const caption = collapse(
    fig.querySelector('h6, figcaption')?.textContent,
  );
  const alt = collapse(img?.getAttribute('alt'));
  const parts: string[] = [];
  if (caption) parts.push(caption.endsWith('.') ? caption : caption + '.');
  if (alt && alt !== caption) parts.push(alt.endsWith('.') ? alt : alt + '.');
  if (parts.length === 0) return '';
  return parts[0].startsWith('Figure') ? parts.join(' ') : 'Figure. ' + parts.join(' ');
}

function tableToText(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('th, td')).map(c => collapse(c.textContent)).join(', '),
  );
  const caption = collapse(table.querySelector('caption')?.textContent);
  return [caption, ...rows].filter(Boolean).join('. ');
}

function walk(node: Element, blocks: string[], annotate: boolean): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName;

    // End-of-chapter footnote/reference lists are for the eye, not the ear
    if (child.getAttribute('data-type') === 'footnotes') continue;

    if (tag === 'FIGURE' || child.classList.contains('figure')) {
      const t = figureToText(child);
      if (t) {
        if (annotate) child.setAttribute('data-lb', String(blocks.length));
        blocks.push(t);
      }
      continue;
    }
    if (tag === 'TABLE') {
      const t = tableToText(child);
      if (t) {
        if (annotate) child.setAttribute('data-lb', String(blocks.length));
        blocks.push(t);
      }
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      // A block element that itself contains nested blocks (e.g. li > p)
      // gets recursed instead of flattened, so ordering is preserved.
      const hasNestedBlocks = Array.from(child.children).some(
        c => BLOCK_TAGS.has(c.tagName) || c.tagName === 'FIGURE' || c.classList.contains('figure'),
      );
      if (hasNestedBlocks) {
        walk(child, blocks, annotate);
      } else {
        const t = collapse(child.textContent);
        if (t) {
          if (annotate) child.setAttribute('data-lb', String(blocks.length));
          blocks.push(t);
        }
      }
      continue;
    }
    walk(child, blocks, annotate);
  }
}

/** Strip scripts/styles/handlers and neutralize links so captured chapter
 *  HTML is safe and self-contained when rendered in the player. */
function sanitize(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(STRIP_TAGS.join(',')))) el.remove();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') || '';
    // Same-page anchors (footnotes, cross-refs within the chapter) keep working;
    // everything else would point back into O'Reilly/ezproxy, so unlink it.
    if (!href.startsWith('#')) a.removeAttribute('href');
  }
}

/** Point img tags at locally saved copies; drop srcset so the browser
 *  doesn't try to load O'Reilly-hosted variants. */
function rewriteImages(root: Element, srcMap: Record<string, string>): void {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    img.removeAttribute('srcset');
    const src = img.getAttribute('src') || '';
    const local = srcMap[src];
    if (local) {
      img.setAttribute('src', local);
    } else if (src && !src.startsWith('/uploads/') && !src.startsWith('data:')) {
      // No local copy — hide it rather than render a broken-image icon.
      img.setAttribute('data-missing', '1');
      img.removeAttribute('src');
    }
  }
}

export interface ExtractedChapter {
  title: string;
  text: string;
  /** Sanitized chapter HTML with data-lb block annotations, or null if the
   *  document had no usable content root. */
  displayHtml: string | null;
}

export function extractChapter(
  html: string,
  imageSrcMap: Record<string, string> = {},
): ExtractedChapter {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const root =
    doc.querySelector('#sbo-rt-content') ||
    doc.querySelector('section[data-type="chapter"], section[data-type="appendix"], section[data-type="preface"]') ||
    doc.body;

  sanitize(root);
  rewriteImages(root, imageSrcMap);

  const blocks: string[] = [];
  walk(root, blocks, true);

  const title =
    collapse(root.querySelector('h1')?.textContent) ||
    collapse(doc.querySelector('title')?.textContent);

  const displayHtml = root === doc.body ? root.innerHTML : root.outerHTML;

  return { title, text: blocks.join('\n\n'), displayHtml: blocks.length ? displayHtml : null };
}

/** Back-compat wrapper for callers that only need the spoken text. */
export function extractChapterText(html: string): { title: string; text: string } {
  const { title, text } = extractChapter(html);
  return { title, text };
}
