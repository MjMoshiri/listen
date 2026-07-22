import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** The most recently played chapter, for the dashboard's
 *  "continue listening" card. */
export async function GET() {
  const chapter = await prisma.chapter.findFirst({
    where: { lastPlayedAt: { not: null }, isArchived: false },
    orderBy: { lastPlayedAt: 'desc' },
    select: {
      id: true,
      label: true,
      number: true,
      positionSec: true,
      book: { select: { id: true, title: true } },
    },
  });
  if (!chapter) return NextResponse.json(null);
  return NextResponse.json({
    chapterId: chapter.id,
    chapterLabel: chapter.label || `Chapter ${chapter.number}`,
    bookTitle: chapter.book.title,
    positionSec: chapter.positionSec,
  });
}
