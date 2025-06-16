import { NextRequest, NextResponse } from 'next/server';
import { getTTSQueueStatus } from '@/lib/job-queue';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    
    // Get TTS queue status
    const ttsStatus = getTTSQueueStatus();
    
    // Get current TTS chunks status
    const ttsChunks = await prisma.tTSChunk.groupBy({
      by: ['status'],
      _count: true,
    });
    
    // Get chapter stats
    const chapterStats = await prisma.chapter.groupBy({
      by: ['hasAudio', 'hasCleaned'],
      _count: true,
    });
    
    return NextResponse.json({
      message: 'Queue debug info',
      timestamp: new Date().toISOString(),
      ttsQueue: ttsStatus,
      ttsChunks: ttsChunks.reduce((acc, chunk) => {
        acc[chunk.status] = chunk._count;
        return acc;
      }, {} as Record<string, number>),
      chapterStats: chapterStats.reduce((acc, stat) => {
        const key = `${stat.hasAudio ? 'has' : 'no'}_audio_${stat.hasCleaned ? 'cleaned' : 'uncleaned'}`;
        acc[key] = stat._count;
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    console.error('Error in queue debug:', error);
    return NextResponse.json({ error: 'Failed to get queue debug info' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    switch (action) {
      case 'clear-failed-chunks':
        // Clear failed TTS chunks
        const deletedChunks = await prisma.tTSChunk.deleteMany({
          where: { status: 'failed' }
        });
        return NextResponse.json({ 
          message: `Cleared ${deletedChunks.count} failed TTS chunks`,
          count: deletedChunks.count
        });
        
      case 'reset-processing-chunks':
        // Reset stuck processing chunks to pending
        const resetChunks = await prisma.tTSChunk.updateMany({
          where: { status: 'processing' },
          data: { status: 'pending', error: null }
        });
        return NextResponse.json({ 
          message: `Reset ${resetChunks.count} processing chunks to pending`,
          count: resetChunks.count
        });        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in queue debug POST:', error);
    return NextResponse.json({ error: 'Failed to execute debug action' }, { status: 500 });
  }
}
