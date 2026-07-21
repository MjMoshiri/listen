/**
 * Book status for the dashboard: light chapter rows plus live pipeline stage
 * per chapter (captured -> queued -> cleaning x/y -> generating x/y -> ready).
 * Text bodies are deliberately excluded — this endpoint is polled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleaningProgress, getTTSQueueStatus } from '@/lib/job-queue';

export type ChapterStage =
  | 'captured'   // text in DB, nothing running
  | 'cleaned'    // clean pass done, audio never started
  | 'queued'     // job active, waiting for a cleaning slot
  | 'cleaning'   // LLM clean pass running (done/total pieces)
  | 'generating' // TTS chunks in flight (done/total chunks)
  | 'failed'     // some chunks failed and the job gave up
  | 'ready';     // combined audio exists

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const book = await prisma.book.findUnique({
      where: { id },
      include: {
        chapters: {
          select: {
            id: true,
            number: true,
            label: true,
            hasCleaned: true,
            hasAudio: true,
            isRead: true,
            isArchived: true,
          },
          orderBy: { number: 'asc' },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const chunkCounts = await prisma.tTSChunk.groupBy({
      by: ['chapterId', 'status'],
      where: { chapter: { bookId: id } },
      _count: { _all: true },
    });
    const byChapter = new Map<string, Record<string, number>>();
    for (const row of chunkCounts) {
      const m = byChapter.get(row.chapterId) || {};
      m[row.status] = row._count._all;
      byChapter.set(row.chapterId, m);
    }

    const active = new Set(getTTSQueueStatus().activeChapters);

    const chapters = book.chapters.map(c => {
      const counts = byChapter.get(c.id) || {};
      const chunksTotal = Object.values(counts).reduce((a, b) => a + b, 0);
      const chunksDone = counts['completed'] || 0;
      const chunksFailed = counts['failed'] || 0;
      const cleaning = cleaningProgress.get(c.id);

      let stage: ChapterStage;
      let done = 0;
      let total = 0;
      if (c.hasAudio) {
        stage = 'ready';
      } else if (cleaning) {
        stage = 'cleaning';
        done = cleaning.done;
        total = cleaning.total;
      } else if (chunksTotal > 0) {
        stage = active.has(c.id) ? 'generating' : chunksFailed > 0 ? 'failed' : 'generating';
        done = chunksDone;
        total = chunksTotal;
      } else if (active.has(c.id)) {
        stage = 'queued';
      } else if (c.hasCleaned) {
        stage = 'cleaned';
      } else {
        stage = 'captured';
      }

      return {
        id: c.id,
        number: c.number,
        label: c.label,
        hasCleaned: c.hasCleaned,
        hasAudio: c.hasAudio,
        isRead: c.isRead,
        isArchived: c.isArchived,
        stage,
        done,
        total,
        chunksFailed,
      };
    });

    const isProcessing =
      chapters.some(c => ['queued', 'cleaning', 'generating'].includes(c.stage)) ||
      book.chapters.length === 0;

    return NextResponse.json({
      bookId: book.id,
      title: book.title,
      chaptersCount: book.chapters.length,
      isProcessing,
      chapters,
    });
  } catch (error) {
    console.error('Error getting book status:', error);
    return NextResponse.json({ error: 'Failed to get book status' }, { status: 500 });
  }
}
