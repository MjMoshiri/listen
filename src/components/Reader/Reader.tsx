'use client';

/**
 * Read-along player. Chapters captured from O'Reilly render their original
 * book HTML (headings, figures, code, tables, notes) with every spoken block
 * stamped data-lb — click a block to play from it, the one being spoken stays
 * highlighted. Other chapters fall back to plain text blocks. Speed up to 3x,
 * chapter picker + section jump menus, keyboard shortcuts (space, ←/→).
 * While audio is still generating, the text is readable and progress polls.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlayerData } from '@/lib/player-data';
import { blockWordStarts, wrapWords } from './word-sync';
import styles from './Reader.module.css';

const RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** Injected chapter HTML, memoized hard: the player re-renders 4×/s on time
 *  ticks and React re-applies dangerouslySetInnerHTML on re-render, which
 *  would wipe the word spans and highlight classes (and re-inject ~200 KB of
 *  DOM). With stable props this never re-renders after mount. */
const Article = memo(function Article({
  html,
  playable,
  onClick,
  innerRef,
}: {
  html: string;
  playable: boolean;
  onClick: (e: React.MouseEvent) => void;
  innerRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <article
      ref={innerRef}
      className={[styles.content, playable ? styles.contentPlayable : ''].join(' ')}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Reader({ initial }: { initial: PlayerData }) {
  const [data, setData] = useState(initial);
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(2);
  const [follow, setFollow] = useState(true);
  const [time, setTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [kickedOff, setKickedOff] = useState(false);
  const [menu, setMenu] = useState<'chapters' | 'sections' | null>(null);
  const [sections, setSections] = useState<{ label: string; lb: number | null; y: number }[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const blockEls = useRef<HTMLElement[]>([]);
  const plainRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Word-level timeline: every word span in document order + its start time
  const words = useRef<{ starts: number[]; els: HTMLElement[] }>({ starts: [], els: [] });
  const wordAt = useRef(-1);
  const followRef = useRef(follow);
  const playingRef = useRef(playing);
  followRef.current = follow;
  playingRef.current = playing;
  const router = useRouter();

  const { chapter, book, blocks, prevId, nextId, chapters, sourceHtml } = data;
  const id = chapter.id;
  const rich = Boolean(sourceHtml);

  // Restore preferred speed
  useEffect(() => {
    const saved = Number(localStorage.getItem('listen-rate'));
    if (RATES.includes(saved)) setRate(saved);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    localStorage.setItem('listen-rate', String(rate));
  }, [rate]);

  // Collect the annotated block elements and section headings from the
  // injected chapter HTML (re-run if a poll delivers fresh HTML).
  useEffect(() => {
    if (!rich || !articleRef.current) { blockEls.current = []; return; }
    const els = Array.from(articleRef.current.querySelectorAll<HTMLElement>('[data-lb]'))
      .sort((a, b) => Number(a.dataset.lb) - Number(b.dataset.lb));
    blockEls.current = els;
    const heads = Array.from(articleRef.current.querySelectorAll<HTMLElement>('h1, h2'))
      .map(h => ({
        label: (h.textContent || '').trim(),
        lb: h.dataset.lb != null ? Number(h.dataset.lb) : null,
        y: h.offsetTop,
      }))
      .filter(s => s.label);
    setSections(heads);
  }, [rich, sourceHtml]);

  // Poll while audio is still being generated
  useEffect(() => {
    if (chapter.hasAudio) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/player/${id}`);
        if (r.ok) setData(await r.json());
      } catch { /* transient; retry next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [chapter.hasAudio, id]);

  // Start offset of each block in the combined chapter audio
  const offsets = useMemo(() => {
    if (blocks.length && blocks.every(b => b.duration != null)) {
      let t = 0;
      return blocks.map(b => { const s = t; t += b.duration!; return s; });
    }
    // Chapters generated before durations were stored: estimate by text share
    const totalChars = blocks.reduce((n, b) => n + b.text.length, 0) || 1;
    let t = 0;
    return blocks.map(b => { const s = t; t += (b.text.length / totalChars) * audioDuration; return s; });
  }, [blocks, audioDuration]);

  const indexAt = useCallback((t: number) => {
    let i = 0;
    while (i + 1 < offsets.length && offsets[i + 1] <= t) i++;
    return i;
  }, [offsets]);

  const blockEl = useCallback(
    (i: number): HTMLElement | null => (rich ? blockEls.current[i] || null : plainRefs.current[i]),
    [rich],
  );

  // Highlight the active block (rich mode toggles a class on injected HTML).
  // Query the live DOM rather than the collected list — the injected HTML can
  // be replaced after hydration recovery, leaving collected nodes detached.
  useEffect(() => {
    if (!rich) return;
    const el = active >= 0
      ? articleRef.current?.querySelector<HTMLElement>(`[data-lb="${active}"]`) ?? null
      : null;
    el?.classList.add('lb-active');
    return () => el?.classList.remove('lb-active');
  }, [rich, active, sourceHtml]);

  // Word timeline: wrap every block's words in spans and give each a start
  // time interpolated from the block's chunk durations, so the exact word
  // being spoken can be highlighted and followed. React can re-inject the
  // chapter HTML after hydration recovery, detaching a built timeline —
  // so this is a callback that syncWord re-invokes when that happens.
  const rebuildWords = useCallback(() => {
    if (rich && articleRef.current) {
      blockEls.current = Array.from(articleRef.current.querySelectorAll<HTMLElement>('[data-lb]'))
        .sort((a, b) => Number(a.dataset.lb) - Number(b.dataset.lb));
    }
    const starts: number[] = [];
    const els: HTMLElement[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const el = blockEl(i);
      if (!el) continue;
      const ws = rich ? wrapWords(el) : Array.from(el.querySelectorAll<HTMLElement>('[data-w]'));
      if (!ws.length) continue;
      const start = offsets[i] ?? 0;
      const end = i + 1 < offsets.length ? offsets[i + 1] : audioDuration || start;
      const ts = blockWordStarts(ws, start, Math.max(end - start, 0), blocks[i].chunks ?? []);
      for (let w = 0; w < ws.length; w++) {
        ws[w].dataset.wi = String(els.length);
        starts.push(ts[w]);
        els.push(ws[w]);
      }
    }
    words.current = { starts, els };
    wordAt.current = -1;
  }, [rich, blocks, offsets, audioDuration, blockEl]);

  useEffect(() => { rebuildWords(); }, [rebuildWords, sourceHtml]);

  // Move the word highlight to whatever is being spoken at time t; with
  // follow on, keep that word inside the middle band of the viewport
  // (teleprompter-style continuous scrolling).
  const syncWord = useCallback((t: number) => {
    // Self-heal: if the injected HTML was replaced since the timeline was
    // built, our spans are detached — rebuild against the live DOM.
    if (!words.current.els.length || !words.current.els[0].isConnected) rebuildWords();
    const { starts, els } = words.current;
    if (!els.length) return;
    let lo = 0;
    let hi = starts.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (idx === wordAt.current) return;
    els[wordAt.current]?.classList.remove('w-live');
    wordAt.current = idx;
    const el = els[idx];
    el.classList.add('w-live');
    if (followRef.current && playingRef.current) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.18 || r.bottom > window.innerHeight * 0.72) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [rebuildWords]);

  // timeupdate only fires ~4×/s — too coarse for word tracking at 2× speed,
  // so run a rAF loop while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = requestAnimationFrame(function tick() {
      const a = audioRef.current;
      if (a) syncWord(a.currentTime);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, syncWord]);

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setTime(a.currentTime);
    setActive(indexAt(a.currentTime));
    syncWord(a.currentTime);
    localStorage.setItem(`listen-pos-${id}`, String(a.currentTime));
  };

  // Turning follow on jumps straight back to the word being spoken
  useEffect(() => {
    if (!follow) return;
    const el = words.current.els[wordAt.current] || (active >= 0 ? blockEl(active) : null);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    // Concatenated VBR mp3s report duration Infinity — fall back to the
    // known sum of chunk durations so the total time and seek bar work.
    const dur = isFinite(a.duration)
      ? a.duration
      : blocks.reduce((s, b) => s + (b.duration || 0), 0);
    setAudioDuration(dur);
    a.playbackRate = rate;
    const saved = Number(localStorage.getItem(`listen-pos-${id}`));
    if (saved > 1 && saved < dur - 5) {
      a.currentTime = saved;
      setActive(indexAt(saved));
    }
    if (new URLSearchParams(location.search).has('autoplay')) {
      a.play().catch(() => { /* browser wants a gesture first */ });
    }
  };

  // A cached mp3 can finish loading metadata before hydration attaches the
  // listener — the loadedmetadata event is missed, so recover on mount.
  useEffect(() => {
    const a = audioRef.current;
    if (a && a.readyState >= 1) onLoadedMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.audioFile]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }, []);

  const scrub = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(t, a.duration || t));
    setTime(a.currentTime);
    setActive(indexAt(a.currentTime));
  }, [indexAt]);

  const playBlock = useCallback((i: number) => {
    const a = audioRef.current;
    if (!a || !chapter.hasAudio || i < 0) return;
    const at = Math.min(i, offsets.length - 1);
    a.currentTime = Math.min(offsets[at] + 0.02, a.duration || offsets[at]);
    setActive(at);
    a.play();
  }, [chapter.hasAudio, offsets]);

  // Click on a word: play from that exact word
  const seekWord = useCallback((target: HTMLElement): boolean => {
    const w = target.closest('[data-w]') as HTMLElement | null;
    const i = w?.dataset.wi ? Number(w.dataset.wi) : -1;
    const a = audioRef.current;
    if (i < 0 || !a || !chapter.hasAudio) return false;
    const at = words.current.starts[i] ?? 0;
    a.currentTime = Math.max(0, Math.min(at + 0.01, a.duration || at));
    a.play();
    return true;
  }, [chapter.hasAudio]);

  // Click anywhere in the injected chapter HTML: play from that word or block
  const onArticleClick = useCallback((e: React.MouseEvent) => {
    if (seekWord(e.target as HTMLElement)) return;
    const hit = (e.target as HTMLElement).closest('[data-lb]') as HTMLElement | null;
    if (hit && articleRef.current?.contains(hit)) playBlock(Number(hit.dataset.lb));
  }, [seekWord, playBlock]);

  const cycleRate = () => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]);

  // Keyboard: space play/pause, ←/→ seek 10s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); scrub((audioRef.current?.currentTime || 0) - 10); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); scrub((audioRef.current?.currentTime || 0) + 10); }
      else if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, scrub]);

  const onEnded = () => {
    localStorage.removeItem(`listen-pos-${id}`);
    if (nextId) router.push(`/player/${nextId}?autoplay=1`);
  };

  const generate = async () => {
    setKickedOff(true);
    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterIds: [id] }),
      });
    } catch {
      setKickedOff(false);
    }
  };

  const jumpToSection = (s: { lb: number | null; y: number }) => {
    setMenu(null);
    if (s.lb != null && chapter.hasAudio) { playBlock(s.lb); }
    const el = s.lb != null ? blockEls.current[Math.min(s.lb, blockEls.current.length - 1)] : null;
    (el || articleRef.current)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (!el && articleRef.current) window.scrollTo({ top: s.y, behavior: 'smooth' });
  };

  const inProgress = data.generating || kickedOff;

  return (
    <div className={styles.wrap} onClick={() => menu && setMenu(null)}>
      <header className={styles.header}>
        <a href={`/dashboard/books/${book.id}`} className={styles.back} title="Back to book">←</a>
        <div className={styles.titles}>
          <div className={styles.bookTitle}>{book.title}</div>
          <h1 className={styles.chapterTitle}>{chapter.label || `Chapter ${chapter.number}`}</h1>
        </div>

        <nav className={styles.nav} onClick={e => e.stopPropagation()}>
          {sections.length > 1 && (
            <div className={styles.menuWrap}>
              <button
                className={styles.menuBtn}
                onClick={() => setMenu(m => (m === 'sections' ? null : 'sections'))}
              >
                On this page ▾
              </button>
              {menu === 'sections' && (
                <div className={styles.menu}>
                  {sections.map((s, i) => (
                    <button key={i} className={styles.menuItem} onClick={() => jumpToSection(s)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.menuWrap}>
            <button
              className={styles.menuBtn}
              onClick={() => setMenu(m => (m === 'chapters' ? null : 'chapters'))}
            >
              Chapters ▾
            </button>
            {menu === 'chapters' && (
              <div className={styles.menu}>
                {chapters.map(c => (
                  <a
                    key={c.id}
                    href={`/player/${c.id}`}
                    className={[styles.menuItem, c.id === id ? styles.menuItemActive : ''].join(' ')}
                  >
                    <span className={styles.menuItemLabel}>{c.label || `Chapter ${c.number}`}</span>
                    {c.hasAudio && <span className={styles.menuItemBadge}>♪</span>}
                  </a>
                ))}
              </div>
            )}
          </div>

          {prevId ? <a className={styles.navArrow} href={`/player/${prevId}`} title="Previous chapter">‹</a> : <span />}
          {nextId ? <a className={styles.navArrow} href={`/player/${nextId}`} title="Next chapter">›</a> : <span />}
        </nav>
      </header>

      {!chapter.hasAudio && (
        <div className={styles.banner}>
          {inProgress ? (
            <>
              <div className={styles.bannerText}>
                Generating audio… {data.done}/{data.total} segments
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${data.total ? (data.done / data.total) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : (
            <div className={styles.bannerRow}>
              <span>No audio for this chapter yet.</span>
              <button onClick={generate} className={styles.generateBtn}>Generate audio</button>
            </div>
          )}
        </div>
      )}

      {rich ? (
        <main className={styles.page}>
          <Article
            html={sourceHtml!}
            playable={chapter.hasAudio}
            onClick={onArticleClick}
            innerRef={articleRef}
          />
        </main>
      ) : (
        <main className={styles.text}>
          {blocks.map((b, i) => (
            <div
              key={b.index}
              ref={el => { plainRefs.current[i] = el; }}
              className={[
                styles.block,
                i === active ? styles.active : '',
                chapter.hasAudio ? styles.clickable : '',
              ].join(' ')}
              onClick={e => { if (!seekWord(e.target as HTMLElement)) playBlock(i); }}
            >
              {b.text.split(/(\s+)/).map((part, wi) =>
                /^\s+$/.test(part) ? part : <span key={wi} data-w>{part}</span>,
              )}
            </div>
          ))}
        </main>
      )}

      {chapter.hasAudio && chapter.audioFile && (
        <footer className={styles.bar}>
          <audio
            ref={audioRef}
            src={`/uploads/${chapter.audioFile}`}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={onEnded}
          />
          <button className={styles.play} onClick={toggle} title={playing ? 'Pause (space)' : 'Play (space)'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button className={styles.skip} onClick={() => scrub(time - 10)} title="Back 10s (←)">−10s</button>
          <button className={styles.skip} onClick={() => scrub(time + 10)} title="Forward 10s (→)">+10s</button>
          <span className={styles.time}>{fmt(time)} / {fmt(audioDuration)}</span>
          <input
            className={styles.seek}
            type="range"
            min={0}
            max={audioDuration || 0}
            step={0.1}
            value={Math.min(time, audioDuration || 0)}
            onChange={e => scrub(Number(e.target.value))}
          />
          <button className={styles.rateBtn} onClick={cycleRate} title="Playback speed">
            {rate}×
          </button>
          <button
            className={[styles.followBtn, follow ? styles.followOn : ''].join(' ')}
            onClick={() => setFollow(f => !f)}
            title="Auto-scroll to the word being spoken"
          >
            follow
          </button>
        </footer>
      )}
    </div>
  );
}
