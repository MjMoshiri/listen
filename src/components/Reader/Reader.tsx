'use client';

/**
 * Read-along player: the chapter text is rendered as clickable paragraphs
 * kept in sync with the audio. Click a paragraph to play from it; the one
 * being spoken stays highlighted; speed goes up to 3x. While audio is still
 * generating, the text is readable and progress is polled.
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const router = useRouter();

  const { chapter, book, blocks, prevId, nextId } = data;
  const id = chapter.id;

  // Restore preferred speed
  useEffect(() => {
    const saved = Number(localStorage.getItem('listen-rate'));
    if (RATES.includes(saved)) setRate(saved);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    localStorage.setItem('listen-rate', String(rate));
  }, [rate]);

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

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setTime(a.currentTime);
    setActive(indexAt(a.currentTime));
    localStorage.setItem(`listen-pos-${id}`, String(a.currentTime));
  };

  // Keep the paragraph being spoken in view
  useEffect(() => {
    if (!follow || active < 0 || !playing) return;
    blockRefs.current[active]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, follow, playing]);

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

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  };

  const scrub = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(t, a.duration || t));
    setTime(a.currentTime);
    setActive(indexAt(a.currentTime));
  };

  const playBlock = (i: number) => {
    const a = audioRef.current;
    if (!a || !chapter.hasAudio) return;
    a.currentTime = Math.min(offsets[i] + 0.02, a.duration || offsets[i]);
    setActive(i);
    a.play();
  };

  const cycleRate = () => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]);

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

  const inProgress = data.generating || kickedOff;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <a href={`/dashboard/books/${book.id}`} className={styles.back} title="Back to book">←</a>
        <div className={styles.titles}>
          <div className={styles.bookTitle}>{book.title}</div>
          <h1 className={styles.chapterTitle}>{chapter.label || `Chapter ${chapter.number}`}</h1>
        </div>
        <nav className={styles.nav}>
          {prevId ? <a href={`/player/${prevId}`}>‹ Prev</a> : <span className={styles.navGap} />}
          {nextId ? <a href={`/player/${nextId}`}>Next ›</a> : <span className={styles.navGap} />}
        </nav>
      </header>

      {!chapter.hasAudio && (
        <div className={styles.banner}>
          {inProgress ? (
            <>
              <div className={styles.bannerText}>
                Generating audio… {data.done}/{data.total} paragraphs
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

      <main className={styles.text}>
        {blocks.map((b, i) => (
          <div
            key={b.index}
            ref={el => { blockRefs.current[i] = el; }}
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
          <button className={styles.play} onClick={toggle} title={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button className={styles.skip} onClick={() => scrub(time - 10)}>−10s</button>
          <button className={styles.skip} onClick={() => scrub(time + 10)}>+10s</button>
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
            title="Auto-scroll to the paragraph being spoken"
          >
            follow
          </button>
        </footer>
      )}
    </div>
  );
}
