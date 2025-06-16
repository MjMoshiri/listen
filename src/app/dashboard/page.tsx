"use client";

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard/Dashboard';
import BookList from '@/components/BookList/BookList';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import uploadButtonStyles from './uploadButton.module.css';

export default function DashboardPage() {
  const [books, setBooks] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/books')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBooks(data);
        } else if (data && Array.isArray(data.books)) {
          setBooks(data.books);
        } else {
          setBooks([]);
        }
      });
  }, []);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    await fetch('/api/books', {
      method: 'POST',
      body: formData,
    });
    // Refresh book list
    fetch('/api/books')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBooks(data);
        } else if (data && Array.isArray(data.books)) {
          setBooks(data.books);
        } else {
          setBooks([]);
        }
      });
  };

  const handleSelectBook = (id: string) => {
    router.push(`/dashboard/books/${id}`);
  };

  return (
    <Dashboard>
      <h1>Dashboard</h1>
      <Link href="/dashboard/upload">
        <button className={uploadButtonStyles.uploadButton}>
          Upload New Book
        </button>
      </Link>
      <BookList books={books} onSelect={handleSelectBook} />
    </Dashboard>
  );
}
