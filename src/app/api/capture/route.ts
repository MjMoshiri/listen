/**
 * Capture endpoint for the O'Reilly browser extension.
 * POST { bookTitle, chapters: [{ title?, number, html, images? }] }
 * Upserts the book by title, extracts spoken text from each chapter's HTML,
 * saves the chapter's images locally, and stores sanitized display HTML for
 * the read-along player. Re-capturing an existing chapter refreshes its
 * presentation (HTML + images) without touching its audio pipeline. CORS is
 * open since the extension calls localhost from a learning.oreilly.com page.
 */

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { extractChapter } from '@/lib/oreilly-html';
import { addTTSJob } from '@/lib/job-queue';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface CaptureImage {
  data: string; // base64, no data: prefix
  type: string; // mime type
}

interface CaptureChapter {
  title?: string;
  number: number;
  html: string;
  images?: Record<string, CaptureImage>;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

/** Write chapter images to public/uploads/images (content-addressed) and
 *  return a map from the original src attribute to the local URL. */
async function saveImages(images: Record<string, CaptureImage>): Promise<Record<string, string>> {
  const dir = path.join(process.cwd(), 'public', 'uploads', 'images');
  await fs.mkdir(dir, { recursive: true });

  const srcMap: Record<string, string> = {};
  for (const [src, img] of Object.entries(images)) {
    const ext = EXT_BY_MIME[img.type];
    if (!ext || !img.data) continue;
    try {
      const buf = Buffer.from(img.data, 'base64');
      if (buf.length === 0 || buf.length > 20_000_000) continue;
      const name = `${createHash('sha1').update(buf).digest('hex')}.${ext}`;
      const file = path.join(dir, name);
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, buf);
      }
      srcMap[src] = `/uploads/images/${name}`;
    } catch {
      // Bad base64 or unwritable file — skip this image, keep the rest.
    }
  }
  return srcMap;
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
  const updated: { id: string; number: number }[] = [];
  const skipped: { number: number; reason: string }[] = [];

  for (const ch of chapters) {
    const srcMap = await saveImages(ch.images || {});
    const { title, text, displayHtml } = extractChapter(ch.html || '', srcMap);
    if (!text) {
      skipped.push({ number: ch.number, reason: 'no text extracted' });
      continue;
    }
    const label = ch.title || title || `Chapter ${ch.number}`;

    const existing = await prisma.chapter.findFirst({
      where: { bookId: book.id, number: ch.number },
    });
    if (existing) {
      // Already captured — refresh the presentation only, never the audio.
      await prisma.chapter.update({
        where: { id: existing.id },
        data: { sourceHtml: displayHtml },
      });
      updated.push({ id: existing.id, number: ch.number });
      continue;
    }

    const row = await prisma.chapter.create({
      data: {
        bookId: book.id,
        text,
        sourceHtml: displayHtml,
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

  return NextResponse.json({ bookId: book.id, created, updated, skipped }, { headers: CORS });
}
