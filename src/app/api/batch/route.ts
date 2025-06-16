import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { batchProcessTTS, getTTSQueueStatus, addChapterCleaningJob } from '@/lib/job-queue';

export async function POST(request: NextRequest) {
  try {
    const { action, chapterIds, bookId } = await request.json();
    
    if (action === 'tts') {
      if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
        return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
      }
      
      // Verify chapters exist and don't already have audio
      const chapters = await prisma.chapter.findMany({
        where: { id: { in: chapterIds } },
        select: { id: true, hasAudio: true },
      });
      
      const chaptersToProcess = chapters.filter(ch => !ch.hasAudio);
      
      if (chaptersToProcess.length === 0) {
        return NextResponse.json({ 
          status: 'no_work', 
          message: 'All chapters already have audio' 
        });
      }
      
      await batchProcessTTS(chaptersToProcess.map(ch => ch.id));
      
      return NextResponse.json({
        status: 'submitted',
        count: chaptersToProcess.length,
        message: `Added ${chaptersToProcess.length} chapters to TTS queue`
      });
    }
    
    if (action === 'clean') {
      if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
        return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
      }
      
      // Get chapters that need cleaning
      const chapters = await prisma.chapter.findMany({
        where: { id: { in: chapterIds } },
        select: { id: true, text: true, hasCleaned: true },
      });
      
      const chaptersToClean = chapters.filter(ch => !ch.hasCleaned && ch.text);
      
      if (chaptersToClean.length === 0) {
        return NextResponse.json({ 
          status: 'no_work', 
          message: 'All chapters are already cleaned or have no text' 
        });
      }
      
      // Add cleaning jobs
      chaptersToClean.forEach(ch => {
        if (ch.text) {
          addChapterCleaningJob(ch.id, ch.text);
        }
      });
      
      return NextResponse.json({
        status: 'submitted',
        count: chaptersToClean.length,
        message: `Added ${chaptersToClean.length} chapters to cleaning queue`
      });
    }
    
    if (action === 'book-tts' && bookId) {
      // Process all chapters in a book
      const chapters = await prisma.chapter.findMany({
        where: { bookId, hasAudio: false },
        select: { id: true },
        orderBy: { number: 'asc' }
      });
      
      if (chapters.length === 0) {
        return NextResponse.json({ 
          status: 'no_work', 
          message: 'All chapters in book already have audio' 
        });
      }
      
      await batchProcessTTS(chapters.map(ch => ch.id));
      
      return NextResponse.json({
        status: 'submitted',
        count: chapters.length,
        message: `Added ${chapters.length} chapters from book to TTS queue`
      });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Error in batch API:', error);
    return NextResponse.json({ error: 'Failed to process batch request' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const status = getTTSQueueStatus();
    
    // Also get some stats from database
    const stats = await prisma.chapter.groupBy({
      by: ['hasAudio', 'hasCleaned'],
      _count: true,
    });
    
    return NextResponse.json({
      queue: status,
      stats: stats.reduce((acc, stat) => {
        const key = `${stat.hasAudio ? 'has' : 'no'}_audio_${stat.hasCleaned ? 'cleaned' : 'uncleaned'}`;
        acc[key] = stat._count;
        return acc;
      }, {} as Record<string, number>)
    });
    
  } catch (error) {
    console.error('Error getting batch status:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
