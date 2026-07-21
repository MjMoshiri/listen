/**
 * Word-level read-along timing. TTS chunk durations give exact time at every
 * chunk boundary; between boundaries a word's start time is interpolated from
 * its character position (Kokoro's pace is steady enough for this to track
 * closely, and any drift resets at the next chunk boundary). In the rich view
 * the displayed HTML differs slightly from the cleaned spoken text (footnote
 * markers etc. removed), so words map through their *fractional* char
 * position — the small mismatch spreads across the block instead of
 * accumulating.
 */

/** Wrap every word of the element's text nodes in <span data-w>. Idempotent —
 *  a re-run returns the existing spans. Whitespace is preserved verbatim so
 *  pre/code blocks keep their formatting. */
export function wrapWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.ww) return Array.from(el.querySelectorAll<HTMLElement>('[data-w]'));
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.trim()) texts.push(n as Text);
  }
  for (const node of texts) {
    const frag = document.createDocumentFragment();
    for (const part of node.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const s = document.createElement('span');
        s.setAttribute('data-w', '');
        s.textContent = part;
        frag.appendChild(s);
      }
    }
    node.parentNode?.replaceChild(frag, node);
  }
  el.dataset.ww = '1';
  return Array.from(el.querySelectorAll<HTMLElement>('[data-w]'));
}

/** Start time (in the chapter audio) for each word span of one block.
 *  `start`/`duration` position the block in the audio; `chunks` are the
 *  block's TTS chunks, used as piecewise-linear timing anchors. */
export function blockWordStarts(
  wordEls: HTMLElement[],
  start: number,
  duration: number,
  chunks: { chars: number; duration: number | null }[],
): number[] {
  if (!chunks.length) chunks = [{ chars: 1, duration: null }];

  // Chunk boundaries as (char fraction, time fraction) marks. Without stored
  // durations, time simply follows the char fraction (pure linear).
  const totalChars = chunks.reduce((s, c) => s + c.chars, 0) || 1;
  const timed = chunks.every(c => c.duration != null);
  const totalDur = timed ? chunks.reduce((s, c) => s + (c.duration || 0), 0) : 0;
  const marks: { c: number; t: number }[] = [{ c: 0, t: 0 }];
  let c = 0;
  let t = 0;
  for (const ch of chunks) {
    c += ch.chars / totalChars;
    t += timed && totalDur > 0 ? (ch.duration || 0) / totalDur : ch.chars / totalChars;
    marks.push({ c, t });
  }

  const lens = wordEls.map(w => (w.textContent || '').length + 1);
  const blockChars = lens.reduce((a, b) => a + b, 0) || 1;
  const starts: number[] = [];
  let at = 0;
  let seg = 0;
  for (const len of lens) {
    const frac = at / blockChars;
    while (seg < marks.length - 2 && marks[seg + 1].c <= frac) seg++;
    const a = marks[seg];
    const b = marks[seg + 1];
    const tf = b.c > a.c ? a.t + ((frac - a.c) / (b.c - a.c)) * (b.t - a.t) : a.t;
    starts.push(start + tf * duration);
    at += len;
  }
  return starts;
}
