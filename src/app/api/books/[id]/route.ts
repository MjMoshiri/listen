import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await params;
  
  try {
    const book = await prisma.book.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: { number: 'asc' },
        },
      },
    });
    
    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }
    
    return NextResponse.json(book);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch book' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await params;
  
  try {
    const { title } = await request.json();
    
    const book = await prisma.book.update({
      where: { id },
      data: { title },
    });
    
    return NextResponse.json(book);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update book' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await params;
  
  try {
    // Delete the book from database (this will cascade delete chapters due to schema)
    await prisma.book.delete({
      where: { id },
    });

    // Delete the EPUB file from filesystem
    try {
      const filePath = path.join(process.cwd(), 'public', 'uploads', `${id}.epub`);
      await unlink(filePath);
    } catch (fileError) {
      // Log file deletion error but don't fail the whole operation
      console.error(`Failed to delete file for book ${id}:`, fileError);
    }
    
    return NextResponse.json({ message: 'Book and all chapters deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
  }
}
