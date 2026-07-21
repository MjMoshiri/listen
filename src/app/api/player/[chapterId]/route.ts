import { NextResponse } from 'next/server';
import { getPlayerData } from '@/lib/player-data';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;
  const data = await getPlayerData(chapterId);
  if (!data) return NextResponse.json({ error: 'chapter not found' }, { status: 404 });
  return NextResponse.json(data);
}
