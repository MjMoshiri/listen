import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addChapterCleaningJob } from '@/lib/job-queue';

export async function POST(request: NextRequest) {
  try {
    const { chapterIds } = await request.json();
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
    }
    
    console.log(`Clear API called with ${chapterIds.length} chapters`);
    
    // Fetch chapters
    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      select: { id: true, text: true, hasCleaned: true },
    });
    
    console.log(`Found ${chapters.length} chapters to process for cleaning`);
    
    // Submit cleaning jobs for each chapter
    chapters.forEach(ch => {
      console.log(`Processing chapter ${ch.id}: hasCleaned=${ch.hasCleaned}`);
      
      if (ch.text && !ch.hasCleaned) {
        console.log(`Submitting chapter ${ch.id} for cleaning-only`);
        addChapterCleaningJob(ch.id, ch.text);
      } else if (ch.hasCleaned) {
        console.log(`Chapter ${ch.id} is already cleaned, skipping`);
      } else if (!ch.text) {
        console.log(`Chapter ${ch.id} has no text, skipping`);
      }
    });
    
    return NextResponse.json({ status: 'submitted', count: chapters.length });
  } catch (error) {
    console.error('Error in clear API:', error);
    return NextResponse.json({ error: 'Failed to submit cleaning jobs' }, { status: 500 });
  }
}
