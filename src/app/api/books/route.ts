import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { addBookProcessingJob } from '@/lib/job-queue';
import path from 'path';

// Create uploads directory if it doesn't exist
const ensureUploadsDir = async () => {
  try {
    await mkdir(path.join(process.cwd(), 'public', 'uploads'), { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
};

export async function GET() {
  try {
    const books = await prisma.book.findMany({
      include: {
        chapters: true,
      },
    });
    return NextResponse.json(books);
  } catch (error) {
    console.error('Error fetching books:', error);
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure we have the uploads directory
    await ensureUploadsDir();
    
    // Parse the form data
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const file = formData.get('file') as File;
    
    if (!title || !file) {
      return NextResponse.json({ error: 'Missing title or file' }, { status: 400 });
    }
    
    const book = await prisma.book.create({
      data: {
        title,
      },
    });
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
      const filePath = path.join(process.cwd(), 'public', 'uploads', `${book.id}.epub`);
    await writeFile(filePath, buffer);    // Add background job to process the EPUB and extract chapters
    console.log(`Adding book processing job for book ID: ${book.id}, file path: ${filePath}`);
    addBookProcessingJob(book.id, filePath);
    console.log(`Background job added successfully for book ${book.id}`);
    
    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    console.error('Error creating book:', error);
    return NextResponse.json({ error: 'Failed to create book' }, { status: 500 });
  }
}
