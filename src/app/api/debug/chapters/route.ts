import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get the first few chapters with all their data
    const chapters = await prisma.chapter.findMany({
      take: 5,
      include: {
        book: {
          select: {
            title: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      chapters: chapters.map(c => ({
        id: c.id,
        title: `${c.number}: ${c.label || 'Unnamed'}`,
        bookTitle: c.book.title,
        isRead: c.isRead,
        isArchived: c.isArchived,
        hasCleaned: c.hasCleaned,
        hasAudio: c.hasAudio,
        rawData: c // Include the raw data to see what fields exist
      }))
    });
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({ error: 'Failed to fetch debug data', details: error }, { status: 500 });
  }
}
