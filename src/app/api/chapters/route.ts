import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    
    const whereClause = bookId ? { bookId } : {};
    
    const chapters = await prisma.chapter.findMany({
      where: whereClause,
      include: {
        book: true,
      },
      orderBy: {
        number: 'asc',
      },
    });
    return NextResponse.json(chapters);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { 
      bookId, 
      text, 
      audioText, 
      label, 
      audioFile, 
      number,
      isRead,
      isArchived,
      hasCleaned,
      hasAudio
    } = await request.json();
    
    const chapter = await prisma.chapter.create({
      data: {
        bookId,
        text,
        audioText,
        label,
        audioFile,
        number,
        isRead: isRead ?? false,
        isArchived: isArchived ?? false,
        hasCleaned: hasCleaned ?? false,
        hasAudio: hasAudio ?? false,
      },
    });
    
    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 });
  }
}
