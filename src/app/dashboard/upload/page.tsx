"use client";

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './upload.module.css';

export default function UploadPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      // Prefill title from file name (remove extension)
      const name = f.name.replace(/\.[^/.]+$/, "");
      setTitle(name);
      // Autofocus the title input after setting
      setTimeout(() => {
        titleInput.current?.focus();
        titleInput.current?.select();
      }, 0);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    
    setLoading(true);
    setMessage('Uploading...');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      
      const res = await fetch('/api/books', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage('Upload successful!');
        // Reset form
        setFile(null);
        setTitle('');
        if (fileInput.current) fileInput.current.value = '';
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        const error = await res.json();
        setMessage(`Upload failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      setMessage('Upload failed. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Upload EPUB</h1>
      <form onSubmit={handleSubmit} className={styles.uploadForm}>
        <div className={styles.formGroup}>
          <label className={styles.label}>
            EPUB File:
            <input
              type="file"
              accept=".epub"
              onChange={handleFileChange}
              ref={fileInput}
              required
              className={styles.input}
            />
          </label>
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Title:
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className={styles.input}
              placeholder="Enter book title"
              ref={titleInput}
            />
          </label>
        </div>
        
        <button type="submit" className={styles.button} disabled={loading || !file}>
          {loading ? 'Uploading...' : 'Upload Book'}
        </button>
      </form>
      
      {message && (
        <div className={`${styles.message} ${status ? styles[status] : ''}`}>
          {message}
        </div>
      )}
      
      <Link href="/dashboard" className={styles.backLink}>Back to Dashboard</Link>
    </main>
  );
}
