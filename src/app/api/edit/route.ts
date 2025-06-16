import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { chapter } = await request.json();
    if (!chapter || !chapter.id) {
      return NextResponse.json({ error: 'No chapter object or id provided' }, { status: 400 });
    }
    const { id, ...updateData } = chapter;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    const updated = await prisma.chapter.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update chapter' }, { status: 500 });
  }
}
