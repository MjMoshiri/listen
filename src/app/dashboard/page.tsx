"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SelfhostToggle from '@/components/SelfhostToggle/SelfhostToggle';
import styles from './dashboard.module.css';

interface BookSummary {
  id: string;
  title: string;
  chapterCount: number;
  readyCount: number;
  readCount: number;
  workingCount: number;
}

interface ResumeInfo {
  chapterId: string;
  chapterLabel: string;
  bookTitle: string;
  positionSec: number;
}

function fmtPos(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DashboardPage() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [resume, setResume] = useState<ResumeInfo | null>(null);

  useEffect(() => {
    fetch('/api/books')
      .then(res => res.json())
      .then(data => setBooks(Array.isArray(data) ? data : []))
      .catch(() => setBooks([]));
    fetch('/api/resume')
      .then(res => res.json())
      .then(data => { if (data?.chapterId) setResume(data); })
      .catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>🎧</span>
          <h1 className={styles.appName}>Listen</h1>
        </div>
        <div className={styles.headerActions}>
          <SelfhostToggle />
          <Link href="/dashboard/upload" className={styles.uploadBtn}>
            + Upload EPUB
          </Link>
        </div>
      </header>

      {resume && (
        <Link href={`/player/${resume.chapterId}`} className={styles.resume}>
          <span className={styles.resumePlay}>▶</span>
          <span className={styles.resumeText}>
            <div className={styles.resumeLabel}>Continue listening</div>
            <div className={styles.resumeChapter}>{resume.chapterLabel}</div>
            <div className={styles.resumeMeta}>
              {resume.bookTitle}
              {resume.positionSec > 1 && ` · at ${fmtPos(resume.positionSec)}`}
            </div>
          </span>
        </Link>
      )}

      <h2 className={styles.sectionTitle}>Library</h2>

      {books === null ? (
        <div className={styles.hint}>Loading…</div>
      ) : books.length === 0 ? (
        <div className={styles.hint}>
          No books yet. Upload an EPUB, or capture chapters from O&apos;Reilly with the browser extension.
        </div>
      ) : (
        <div className={styles.grid}>
          {books.map(book => (
            <Link key={book.id} href={`/dashboard/books/${book.id}`} className={styles.card}>
              <div className={styles.cardTitle}>{book.title}</div>
              <div className={styles.cardMeta}>
                {book.chapterCount} chapter{book.chapterCount === 1 ? '' : 's'}
              </div>
              <div className={styles.cardStats}>
                <span className={styles.statReady}>♪ {book.readyCount} ready</span>
                {book.readCount > 0 && <span className={styles.statRead}>✓ {book.readCount} read</span>}
              </div>
              {book.chapterCount > 0 && (
                <div className={styles.cardTrack}>
                  <div
                    className={styles.cardFill}
                    style={{ width: `${(book.readyCount / book.chapterCount) * 100}%` }}
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
