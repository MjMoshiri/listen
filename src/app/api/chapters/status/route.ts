import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { chapterIds, action } = await request.json();
    
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
    }

    if (!['read', 'archive', 'unarchive', 'unread'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    let updateData: any = {};
    
    switch (action) {
      case 'read':
        updateData = { isRead: true };
        break;
      case 'unread':
        updateData = { isRead: false };
        break;
      case 'archive':
        updateData = { isArchived: true };
        break;
      case 'unarchive':
        updateData = { isArchived: false };
        break;
    }

    const updatedChapters = await prisma.chapter.updateMany({
      where: { id: { in: chapterIds } },
      data: updateData,
    });

    return NextResponse.json({ 
      success: true, 
      updatedCount: updatedChapters.count,
      action 
    });

  } catch (error) {
    console.error('Error updating chapter status:', error);
    return NextResponse.json({ error: 'Failed to update chapters' }, { status: 500 });
  }
}
