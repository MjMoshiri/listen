'use client';

/**
 * Read-along player. Chapters captured from O'Reilly render their original
 * book HTML (headings, figures, code, tables, notes) with every spoken block
 * stamped data-lb — click a block to play from it, the one being spoken stays
 * highlighted. Other chapters fall back to plain text blocks. Speed up to 3x,
 * chapter picker + section jump menus, keyboard shortcuts (space, ←/→).
 * While audio is still generating, the text is readable and progress polls.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlayerData } from '@/lib/player-data';
import styles from './Reader.module.css';

const RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];

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

  // Highlight the active block (rich mode toggles a class on injected HTML)
  useEffect(() => {
    if (!rich) return;
    const el = active >= 0 ? blockEls.current[active] : null;
    el?.classList.add('lb-active');
    return () => el?.classList.remove('lb-active');
  }, [rich, active, sourceHtml]);

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setTime(a.currentTime);
    setActive(indexAt(a.currentTime));
    localStorage.setItem(`listen-pos-${id}`, String(a.currentTime));
  };

  // Keep the block being spoken in view
  useEffect(() => {
    if (!follow || active < 0 || !playing) return;
    blockEl(active)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, follow, playing, blockEl]);

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    setAudioDuration(a.duration);
    a.playbackRate = rate;
    const saved = Number(localStorage.getItem(`listen-pos-${id}`));
    if (saved > 1 && saved < a.duration - 5) {
      a.currentTime = saved;
      setActive(indexAt(saved));
    }
    if (new URLSearchParams(location.search).has('autoplay')) {
      a.play().catch(() => { /* browser wants a gesture first */ });
    }
  };

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

  // Click anywhere in the injected chapter HTML: play from that block
  const onArticleClick = (e: React.MouseEvent) => {
    const hit = (e.target as HTMLElement).closest('[data-lb]') as HTMLElement | null;
    if (hit && articleRef.current?.contains(hit)) playBlock(Number(hit.dataset.lb));
  };

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
          <article
            ref={articleRef}
            className={[styles.content, chapter.hasAudio ? styles.contentPlayable : ''].join(' ')}
            onClick={onArticleClick}
            dangerouslySetInnerHTML={{ __html: sourceHtml! }}
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
              onClick={() => playBlock(i)}
            >
              {b.text}
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
            title="Auto-scroll to the block being spoken"
          >
            follow
          </button>
        </footer>
      )}
    </div>
  );
}
