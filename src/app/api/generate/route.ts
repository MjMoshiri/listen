import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addTTSJob, batchProcessTTS } from '@/lib/job-queue';

export async function POST(request: NextRequest) {
  try {
    const { chapterIds } = await request.json();
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
    }
    
    console.log(`Generate API called with ${chapterIds.length} chapters`);
    
    // Fetch chapters
    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      select: { id: true, text: true, audioText: true, hasCleaned: true, hasAudio: true },
    });
      console.log(`Found ${chapters.length} chapters to process`);
    
    // Filter chapters that don't already have audio
    const chaptersToProcess = chapters.filter(ch => !ch.hasAudio);
    
    if (chaptersToProcess.length === 0) {
      return NextResponse.json({ 
        status: 'no_work', 
        message: 'All chapters already have audio',
        count: 0 
      });
    }
    
    console.log(`Processing ${chaptersToProcess.length} chapters that need audio`);
    
    // Use batch processing for better queue management
    await batchProcessTTS(chaptersToProcess.map(ch => ch.id));
    
    return NextResponse.json({ 
      status: 'submitted', 
      count: chaptersToProcess.length,
      message: `Added ${chaptersToProcess.length} chapters to TTS queue`
    });
  } catch (error) {
    console.error('Error in generate API:', error);
    return NextResponse.json({ error: 'Failed to submit generate jobs' }, { status: 500 });
  }
}
