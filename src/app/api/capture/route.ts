/**
 * Capture endpoint for the O'Reilly browser extension.
 * POST { bookTitle, chapters: [{ title?, number, html }] }
 * Upserts the book by title, extracts spoken text from each chapter's HTML,
 * and creates Chapter rows (same shape as the EPUB path). CORS is open since
 * the extension calls localhost from a learning.oreilly.com page context.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractChapterText } from '@/lib/oreilly-html';
import { addTTSJob } from '@/lib/job-queue';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface CaptureChapter {
  title?: string;
  number: number;
  html: string;
}

export async function POST(request: Request) {
  let body: { bookTitle?: string; chapters?: CaptureChapter[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400, headers: CORS });
  }

  const bookTitle = (body.bookTitle || '').trim();
  const chapters = body.chapters || [];
  if (!bookTitle || chapters.length === 0) {
    return NextResponse.json(
      { error: 'bookTitle and at least one chapter are required' },
      { status: 400, headers: CORS },
    );
  }

  let book = await prisma.book.findFirst({ where: { title: bookTitle } });
  if (!book) {
    book = await prisma.book.create({ data: { title: bookTitle } });
  }

  const created: { id: string; number: number; label: string; words: number }[] = [];
  const skipped: { number: number; reason: string }[] = [];

  for (const ch of chapters) {
    const { title, text } = extractChapterText(ch.html || '');
    if (!text) {
      skipped.push({ number: ch.number, reason: 'no text extracted' });
      continue;
    }
    const label = ch.title || title || `Chapter ${ch.number}`;

    // Skip re-captures of a chapter that's already in the book
    const existing = await prisma.chapter.findFirst({
      where: { bookId: book.id, number: ch.number },
    });
    if (existing) {
      skipped.push({ number: ch.number, reason: 'already captured' });
      continue;
    }

    const row = await prisma.chapter.create({
      data: {
        bookId: book.id,
        text,
        label,
        number: ch.number,
        isRead: false,
        isArchived: false,
        hasCleaned: false,
        hasAudio: false,
      },
    });
    created.push({ id: row.id, number: ch.number, label, words: text.split(/\s+/).length });

    // Capture goes all the way: clean -> TTS -> combined chapter audio,
    // kicked off in the background as soon as the chapter lands.
    addTTSJob(row.id);
  }

  return NextResponse.json({ bookId: book.id, created, skipped }, { headers: CORS });
}
