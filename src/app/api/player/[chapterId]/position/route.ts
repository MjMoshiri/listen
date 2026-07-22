import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** Save the listening position for a chapter. The player posts this every few
 *  seconds while playing (and via sendBeacon on page hide), so the resume
 *  point follows the listener across devices. `done` marks the chapter read
 *  and resets the position. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;
  let body: { sec?: number; done?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const sec = Number(body.sec);
  if (!body.done && (!isFinite(sec) || sec < 0)) {
    return NextResponse.json({ error: 'invalid position' }, { status: 400 });
  }

  try {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: body.done
        ? { positionSec: 0, isRead: true, lastPlayedAt: new Date() }
        : { positionSec: sec, lastPlayedAt: new Date() },
    });
  } catch {
    return NextResponse.json({ error: 'chapter not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
