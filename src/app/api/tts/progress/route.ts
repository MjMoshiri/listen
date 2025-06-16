import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Simplified TTS progress API - mainly for cleanup purposes now
export async function GET(request: NextRequest) {
  try {
    // Get overall TTS progress (count of chapters with/without audio)
    const total = await prisma.chapter.count();
    const completed = await prisma.chapter.count({ where: { hasAudio: true } });
    return NextResponse.json({
      total,
      completed,
      pending: total - completed,
    });
  } catch (error) {
    console.error('Error getting TTS progress:', error);
    return NextResponse.json({ error: 'Failed to get TTS progress' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Clear TTS history: remove all TTSChunk and audioFile fields
    await prisma.tTSChunk.deleteMany({});
    await prisma.chapter.updateMany({ data: { audioFile: null, hasAudio: false } });
    return NextResponse.json({ message: 'TTS history cleared' });
  } catch (error) {
    console.error('Error clearing TTS history:', error);
    return NextResponse.json({ error: 'Failed to clear TTS history' }, { status: 500 });
  }
}
