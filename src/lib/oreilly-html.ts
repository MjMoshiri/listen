/**
 * O'Reilly chapter HTML -> ordered plain text for the TTS pipeline.
 *
 * Accepts either a full saved reader page (content under #sbo-rt-content) or a
 * raw HTMLBook fragment (section[data-type="chapter"]). Emits blank-line
 * separated blocks in reading order. Citation brackets like [Lindsay1979] are
 * left in — the LLM cleaning pass strips them (everything goes through the LLM
 * by design). Figures become spoken blocks built from their caption + alt text.
 */

import { JSDOM } from 'jsdom';

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DT', 'DD',
]);

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

function walk(node: Element, blocks: string[]): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName;

    // End-of-chapter footnote/reference lists are for the eye, not the ear
    if (child.getAttribute('data-type') === 'footnotes') continue;

    if (tag === 'FIGURE' || child.classList.contains('figure')) {
      const t = figureToText(child);
      if (t) blocks.push(t);
      continue;
    }
    if (tag === 'TABLE') {
      const t = tableToText(child);
      if (t) blocks.push(t);
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      // A block element that itself contains nested blocks (e.g. li > p)
      // gets recursed instead of flattened, so ordering is preserved.
      const hasNestedBlocks = Array.from(child.children).some(
        c => BLOCK_TAGS.has(c.tagName) || c.tagName === 'FIGURE' || c.classList.contains('figure'),
      );
      if (hasNestedBlocks) {
        walk(child, blocks);
      } else {
        const t = collapse(child.textContent);
        if (t) blocks.push(t);
      }
      continue;
    }
    walk(child, blocks);
  }
}

export interface ExtractedChapter {
  title: string;
  text: string;
}

export function extractChapterText(html: string): ExtractedChapter {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const root =
    doc.querySelector('#sbo-rt-content') ||
    doc.querySelector('section[data-type="chapter"], section[data-type="appendix"], section[data-type="preface"]') ||
    doc.body;

  const blocks: string[] = [];
  walk(root, blocks);

  const title =
    collapse(root.querySelector('h1')?.textContent) ||
    collapse(doc.querySelector('title')?.textContent);

  return { title, text: blocks.join('\n\n') };
}
