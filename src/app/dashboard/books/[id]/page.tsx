"use client";

import { use, useCallback, useEffect, useState } from 'react';
import ChapterList, { ChapterRow } from '@/components/ChapterList/ChapterList';
import { useRouter } from 'next/navigation';
import styles from './book.module.css';

interface BookStatus {
  bookId: string;
  title: string;
  isProcessing: boolean;
  chapters: ChapterRow[];
}

export default function BookDetailPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const unwrappedParams = params instanceof Promise ? use(params) : params;
  const id = unwrappedParams.id;
  const [status, setStatus] = useState<BookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/books/${id}/status`);
    if (!res.ok) throw new Error('Failed to fetch book status');
    const data: BookStatus = await res.json();
    setStatus(data);
    return data;
  }, [id]);

  useEffect(() => {
    refresh().catch(() => setError('Failed to load book data')).finally(() => setLoading(false));
  }, [refresh]);

  // Poll while the pipeline is working so stage pills and bars move live
  useEffect(() => {
    if (!status?.isProcessing) return;
    const t = setInterval(() => refresh().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [status?.isProcessing, refresh]);

  const handleDelete = async () => {
    if (!confirm('Delete this book and all its chapters?')) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete book');
      router.push('/dashboard');
    } catch {
      setError('Failed to delete book');
      setDeleting(false);
    }
  };

  const handleSelect = (chapterId: string, isSelected: boolean) => {
    setSelected(prev => (isSelected ? [...new Set([...prev, chapterId])] : prev.filter(x => x !== chapterId)));
  };

  const handleAction = async (action: string, ids: string[]) => {
    if (ids.length === 0) return;
    setError('');
    try {
      let response: Response;
      switch (action) {
        case 'read':
        case 'unread':
        case 'archive':
        case 'unarchive':
          response = await fetch('/api/chapters/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterIds: ids, action }),
          });
          break;
        case 'audio':
          response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterIds: ids }),
          });
          break;
        case 'regenerate':
          response = await fetch('/api/regenerate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterIds: ids }),
          });
          break;
        case 'download': {
          response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterIds: ids }),
          });
          if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = ids.length === 1 ? 'chapter_audio.mp3' : 'chapters_audio.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return;
          }
          break;
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${action}`);
      }
      await refresh();
      setSelected([]);
    } catch (err) {
      setError(`Failed to ${action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleEdit = async (updatedChapter: { id: string; label?: string; text?: string; clearedText?: string }) => {
    setError('');
    try {
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter: updatedChapter }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update chapter');
      }
      await refresh();
    } catch (err) {
      setError(`Failed to update chapter: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) return <div className={styles.loading}>Loading book…</div>;

  const chapters = status?.chapters || [];
  const ready = chapters.filter(c => c.hasAudio).length;
  const working = chapters.filter(c => ['queued', 'cleaning', 'generating'].includes(c.stage)).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/dashboard" className={styles.back} title="Back to library">←</a>
        <div className={styles.headText}>
          <h1 className={styles.title}>{status?.title || 'Book'}</h1>
          <div className={styles.meta}>
            {chapters.length} chapters · {ready} with audio
            {working > 0 && <span className={styles.metaWorking}> · {working} in progress</span>}
          </div>
        </div>
        <button onClick={handleDelete} disabled={deleting} className={styles.deleteBtn}>
          {deleting ? 'Deleting…' : 'Delete book'}
        </button>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {chapters.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Processing…</div>
          <div>Extracting chapters and preparing content.</div>
        </div>
      ) : (
        <ChapterList
          chapters={chapters}
          selected={selected}
          onSelect={handleSelect}
          onAction={handleAction}
          onEdit={handleEdit}
          bookId={id}
        />
      )}
    </div>
  );
}
