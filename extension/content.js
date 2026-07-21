// Listen — O'Reilly chapter capture panel.
// Reads the book TOC (embedded htmlContext state, with API fallback), lets you
// pick chapters, fetches each one through your logged-in session, and sends
// them to the local Listen app.

(() => {
  const ISBN_MATCH = location.pathname.match(/\/library\/view\/[^/]+\/(\w+)/);
  if (!ISBN_MATCH) return;
  const ISBN = ISBN_MATCH[1];

  // ── TOC discovery ──────────────────────────────────────────────────────────

  // Brace-match a JS object literal starting at `start` in `text`.
  function extractObject(text, start) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
  }

  function tocFromEmbeddedState() {
    for (const s of document.scripts) {
      const t = s.textContent || '';
      const i = t.indexOf('htmlContext');
      if (i === -1 || !t.includes('"tableOfContents"')) continue;
      const braceStart = t.indexOf('{', i);
      const raw = extractObject(t, braceStart);
      if (!raw) continue;
      try {
        const ctx = JSON.parse(raw);
        const toc = ctx?.appState?.tableOfContents;
        if (!toc) continue;
        const book = toc[`urn:orm:book:${ISBN}`] || Object.values(toc)[0];
        if (book?.sections?.length) return book.sections;
      } catch { /* try next script */ }
    }
    return null;
  }

  async function tocFromApi() {
    for (const path of [`/api/v1/book/${ISBN}/flat-toc/`, `/api/v1/book/${ISBN}/toc/`]) {
      try {
        const r = await fetch(path, { credentials: 'include' });
        if (!r.ok) continue;
        const data = await r.json();
        const items = Array.isArray(data) ? data : data.results || data.sections;
        if (items?.length) {
          return items.map(it => ({
            title: it.title || it.label,
            depth: it.depth || 1,
            apiUrl: it.apiUrl || it.url || `/api/v1/book/${ISBN}/chapter/${(it.href || '').split('#')[0]}`,
          }));
        }
      } catch { /* try next */ }
    }
    return null;
  }

  async function getBookTitle() {
    try {
      const r = await fetch(`/api/v1/book/${ISBN}/`, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        if (data.title) return data.title;
      }
    } catch { /* fall through */ }
    const parts = document.title.split('|');
    return parts[parts.length - 1].trim() || `Book ${ISBN}`;
  }

  // ── Chapter fetching ───────────────────────────────────────────────────────

  async function fetchChapterHtml(apiUrl) {
    const r = await fetch(apiUrl, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${apiUrl}`);
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const meta = await r.json();
      const contentUrl = meta.content || meta.content_url || meta.contentUrl;
      if (!contentUrl) throw new Error('chapter API returned no content URL');
      const r2 = await fetch(contentUrl, { credentials: 'include' });
      if (!r2.ok) throw new Error(`HTTP ${r2.status} for chapter content`);
      return r2.text();
    }
    return r.text();
  }

  function sendToListen(payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'capture', payload }, resp => {
        resolve(resp || { ok: false, error: chrome.runtime.lastError?.message || 'no response' });
      });
    });
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  const fab = document.createElement('button');
  fab.id = 'listen-fab';
  fab.textContent = '🎧 Capture';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'listen-panel';
  panel.hidden = true;
  document.body.appendChild(panel);

  let sections = null;

  async function openPanel() {
    panel.hidden = false;
    if (sections) return;
    panel.innerHTML = '<div class="listen-status">Loading table of contents…</div>';
    sections = tocFromEmbeddedState() || (await tocFromApi());
    if (!sections) {
      panel.innerHTML = '<div class="listen-status listen-error">Could not find the book TOC on this page.</div>';
      sections = null;
      return;
    }
    renderPanel();
  }

  function renderPanel() {
    const chapters = sections.filter(s => s.apiUrl);
    panel.innerHTML = `
      <div class="listen-head">
        <strong>Capture chapters</strong>
        <span>
          <button id="listen-all" type="button">all</button>
          <button id="listen-none" type="button">none</button>
          <button id="listen-close" type="button">✕</button>
        </span>
      </div>
      <div class="listen-list"></div>
      <div class="listen-foot">
        <button id="listen-send" type="button">Send to Listen</button>
        <span class="listen-status" id="listen-progress"></span>
      </div>`;

    const list = panel.querySelector('.listen-list');
    chapters.forEach((s, i) => {
      const row = document.createElement('label');
      row.className = 'listen-row';
      row.style.paddingLeft = `${(s.depth ? s.depth - 1 : 0) * 14 + 8}px`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.index = String(i);
      // depth-1 items are chapters; deeper entries are sections within them
      if ((s.depth || 1) > 1) row.classList.add('listen-sub');
      const span = document.createElement('span');
      span.textContent = s.title;
      row.append(cb, span);
      const st = document.createElement('em');
      st.className = 'listen-row-status';
      row.append(st);
      list.append(row);
    });

    const boxes = () => [...list.querySelectorAll('input[type=checkbox]')];
    panel.querySelector('#listen-all').onclick = () => boxes().forEach(b => (b.checked = true));
    panel.querySelector('#listen-none').onclick = () => boxes().forEach(b => (b.checked = false));
    panel.querySelector('#listen-close').onclick = () => (panel.hidden = true);

    panel.querySelector('#listen-send').onclick = async () => {
      const selected = boxes().filter(b => b.checked);
      if (!selected.length) return;
      const progress = panel.querySelector('#listen-progress');
      const bookTitle = await getBookTitle();
      let done = 0;

      for (const box of selected) {
        const i = Number(box.dataset.index);
        const s = chapters[i];
        const st = box.parentElement.querySelector('.listen-row-status');
        st.textContent = '…';
        try {
          const html = await fetchChapterHtml(s.apiUrl);
          const resp = await sendToListen({
            bookTitle,
            chapters: [{ title: s.title, number: i + 1, html }],
          });
          if (!resp.ok) throw new Error(resp.error || resp.data?.error || 'capture failed');
          const skippedReason = resp.data?.skipped?.[0]?.reason;
          st.textContent = skippedReason ? `skipped (${skippedReason})` : '✓';
        } catch (e) {
          st.textContent = `✗ ${e.message}`.slice(0, 60);
        }
        done++;
        progress.textContent = `${done}/${selected.length}`;
      }
    };
  }

  fab.onclick = () => (panel.hidden ? openPanel() : (panel.hidden = true));
})();
