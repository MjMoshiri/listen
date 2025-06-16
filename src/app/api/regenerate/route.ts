import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { batchProcessTTS } from '@/lib/job-queue';

export async function POST(request: NextRequest) {
  try {
    const { chapterIds } = await request.json();
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
    }

    console.log(`Regenerate API called with ${chapterIds.length} chapters`);
    
    // Fetch chapters
    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      select: { id: true, hasAudio: true, audioFile: true },
    });
    
    // Remove old audio and reset hasAudio for each chapter
    await Promise.all(chapters.map(async (ch) => {
      if (ch.hasAudio) {
        await prisma.chapter.update({
          where: { id: ch.id },
          data: { hasAudio: false, audioFile: null },
        });
        // Optionally: delete audio file from storage if needed
      }
      // Old TTS chunks will be deleted by batchProcessTTS
    }));
    
    // Re-queue chapters for TTS generation
    await batchProcessTTS(chapterIds);
    
    return NextResponse.json({ 
      status: 'regeneration_submitted', 
      count: chapterIds.length,
      message: `Regeneration requested for ${chapterIds.length} chapters`
    });
  } catch (error) {
    console.error('Error in regenerate API:', error);
    return NextResponse.json({ error: 'Failed to submit regeneration jobs' }, { status: 500 });
  }
}
