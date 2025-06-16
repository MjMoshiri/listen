import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { chapterId } = await request.json();
    
    if (!chapterId) {
      return NextResponse.json({ error: 'No chapterId provided' }, { status: 400 });
    }

    // First, let's get the current state
    const currentChapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
    });

    if (!currentChapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Now update it
    const updatedChapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: { isRead: true },
    });

    return NextResponse.json({ 
      success: true, 
      before: currentChapter,
      after: updatedChapter
    });

  } catch (error) {
    console.error('Error in test update:', error);
    return NextResponse.json({ error: 'Failed to update', details: error }, { status: 500 });
  }
}
