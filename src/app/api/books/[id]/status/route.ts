import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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
            text: true,
            audioText: true, 
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
    }    const status = {
      bookId: book.id,
      title: book.title,
      chaptersCount: book.chapters.length,
      isProcessing: book.chapters.length === 0, // Assume processing if no chapters yet
      chapters: book.chapters.map((c: any) => {
        return {
          id: c.id,
          number: c.number,
          label: c.label,
          text: c.text,
          audioText: c.audioText, // Keep the original field name
          hasCleaned: c.hasCleaned,
          hasAudio: c.hasAudio,
          isRead: c.isRead, // Include the isRead field
          isArchived: c.isArchived, // Include the isArchived field
          status: c.isArchived ? 'archived' : c.isRead ? 'read' : 'to-read',
        };
      }),
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting book status:', error);
    return NextResponse.json({ error: 'Failed to get book status' }, { status: 500 });
  }
}
