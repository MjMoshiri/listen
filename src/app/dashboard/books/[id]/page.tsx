"use client";

import { use, useEffect, useState } from 'react';
import BookPage from '@/components/BookPage/BookPage';
import ChapterList, { Chapter } from '@/components/ChapterList/ChapterList';
import { useRouter } from 'next/navigation';

export default function BookDetailPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  // Unwrap params if it's a Promise (Next.js 14+)
  const unwrappedParams = params instanceof Promise ? use(params) : params;
  const id = unwrappedParams.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [book, setBook] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchBookDetails = async () => {
      setLoading(true);
      try {        const statusRes = await fetch(`/api/books/${id}/status`);
        if (!statusRes.ok) throw new Error('Failed to fetch book status');
        const statusData = await statusRes.json();
        setBook({ id: statusData.bookId, title: statusData.title });        setChapters((statusData.chapters || []).map((c: any) => ({
          id: c.id,
          title: `${c.number}: ${c.label || 'Unnamed Chapter'}`,
          cleared: !!c.hasCleaned,
          audioGenerated: !!c.hasAudio,
          status: c.isArchived ? 'archived' : (c.isRead ? 'read' : 'to-read'),
          text: c.text,
          clearedText: c.audioText,
          label: c.label,
          number: c.number,
          isRead: c.isRead,
          isArchived: c.isArchived,
        })));
        setIsProcessing(statusData.isProcessing || false);
      } catch (err) {
        setError('Failed to load book data');
      } finally {
        setLoading(false);
      }
    };
    fetchBookDetails();
  }, [id]);

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/books/${id}/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();            setChapters((statusData.chapters || []).map((c: any) => ({
              id: c.id,
              title: `${c.number}: ${c.label || 'Unnamed Chapter'}`,
              cleared: !!c.hasCleaned,
              audioGenerated: !!c.hasAudio,
              status: c.isArchived ? 'archived' : (c.isRead ? 'read' : 'to-read'),
              text: c.text,
              clearedText: c.audioText,
              label: c.label,
              number: c.number,
              isRead: c.isRead,
              isArchived: c.isArchived,
            })));
            setIsProcessing(statusData.isProcessing || false);
          }
        } catch {}
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isProcessing, id]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this book?')) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete book');
      router.push('/dashboard');
    } catch (err) {
      setError('Failed to delete book');
      setDeleting(false);
    }
  };

  const handleSelect = (chapterId: string, isSelected: boolean) => {
    setSelected(prev => isSelected ? [...prev, chapterId] : prev.filter(id => id !== chapterId));
  };
  const handleAction = async (action: string, ids: string[]) => {
    if (ids.length === 0) return;
    
    setError('');
    
    try {
      let response;
      
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
          
        case 'clear':
          response = await fetch('/api/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterIds: ids }),
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
          
        case 'download':
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
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }
        if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action}`);
      }
      
      // Refresh chapter data
      const statusRes = await fetch(`/api/books/${id}/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        console.log('Refreshed chapter data after action:', statusData.chapters);
        setChapters((statusData.chapters || []).map((c: any) => ({
          id: c.id,
          title: `${c.number}: ${c.label || 'Unnamed Chapter'}`,
          cleared: !!c.hasCleaned,
          audioGenerated: !!c.hasAudio,
          status: c.isArchived ? 'archived' : (c.isRead ? 'read' : 'to-read'),
          text: c.text,
          clearedText: c.audioText,
          label: c.label,
          number: c.number,
          isRead: c.isRead,
          isArchived: c.isArchived,
        })));
      }
      
      // Clear selection after action
      setSelected([]);
      
    } catch (err) {
      setError(`Failed to ${action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleEdit = async (updatedChapter: Partial<Chapter>) => {
    setError('');
    try {
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter: updatedChapter }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update chapter');
      }
      
      // Refresh chapter data
      const statusRes = await fetch(`/api/books/${id}/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setChapters((statusData.chapters || []).map((c: any) => ({
          id: c.id,
          title: `${c.number}: ${c.label || 'Unnamed Chapter'}`,
          cleared: !!c.hasCleaned,
          audioGenerated: !!c.hasAudio,
          status: c.isArchived ? 'archived' : (c.isRead ? 'read' : 'to-read'),
          text: c.text,
          clearedText: c.audioText,
          label: c.label,
          number: c.number,
          isRead: c.isRead,
          isArchived: c.isArchived,
        })));
      }
      
    } catch (err) {
      setError(`Failed to update chapter: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  if (loading) return <BookPage><div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Loading book details...</div></BookPage>;

  return (
    <BookPage>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#eaf1fb', marginBottom: '1rem' }}>{book?.title || 'Book'}</h1>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={handleDelete} 
            disabled={deleting}
            style={{
              background: 'linear-gradient(135deg, #e17055 0%, #d63031 100%)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Book'}
          </button>
          
          <a 
            href={`/uploads/${id}.epub`} 
            download
            style={{
              background: 'linear-gradient(135deg, #4f8cff 0%, #6fa8ff 100%)',
              color: 'white',
              textDecoration: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              display: 'inline-block',
            }}
          >
            Download EPUB
          </a>
          
          <button 
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'rgba(136, 136, 136, 0.2)',
              color: '#888',
              border: '1px solid rgba(136, 136, 136, 0.3)',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(255, 79, 79, 0.15)',
          color: '#ff6b6b',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 79, 79, 0.3)',
          marginBottom: '2rem',
        }}>
          {error}
        </div>
      )}

      <h2 style={{ color: '#4f8cff', marginBottom: '1rem' }}>Chapters</h2>
      
      {isProcessing ? (
        <div style={{
          padding: '2rem',
          background: 'linear-gradient(135deg, #23262f 0%, #2d3140 100%)',
          borderRadius: '12px',
          marginBottom: '2rem',
          textAlign: 'center',
          border: '1px solid rgba(79, 140, 255, 0.2)',
        }}>
          <div style={{ color: '#4f8cff', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            📚 Processing EPUB file...
          </div>
          <div style={{ color: '#888' }}>
            Extracting chapters and preparing content. This may take a few minutes.
          </div>
        </div>
      ) : (
        <ChapterList
          chapters={chapters}
          onSelect={handleSelect}
          selected={selected}
          onAction={handleAction}
          onEdit={handleEdit}
        />
      )}
    </BookPage>
  );
}
