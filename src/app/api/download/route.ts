import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import path from 'path';
import fs from 'fs/promises';
import JSZip from 'jszip';

export async function POST(request: NextRequest) {
  try {
    const { chapterIds } = await request.json();
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'No chapterIds provided' }, { status: 400 });
    }
    // Fetch chapters and related book info
    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      include: { book: true },
    });
    if (chapters.length !== chapterIds.length) {
      return NextResponse.json({ error: 'Some chapters not found' }, { status: 404 });
    }
    if (!chapters.every(ch => ch.hasAudio && ch.audioFile)) {
      return NextResponse.json({ error: 'Not all chapters have audio' }, { status: 400 });
    }
    
    if (chapters.length === 1) {
      // Single file: return audio file directly
      const chapter = chapters[0];
      const filePath = path.join(process.cwd(), 'public', 'uploads', chapter.audioFile!);
      const fileBuffer = await fs.readFile(filePath);
      
      // Determine file extension and MIME type
      const fileExtension = path.extname(chapter.audioFile!).toLowerCase();
      let mimeType = 'audio/mpeg'; // Default to MP3
      let downloadExtension = fileExtension || '.mp3';
      
      switch (fileExtension) {
        case '.wav':
          mimeType = 'audio/wav';
          break;
        case '.mp3':
          mimeType = 'audio/mpeg';
          break;
        case '.ogg':
          mimeType = 'audio/ogg';
          break;
        case '.aac':
          mimeType = 'audio/aac';
          break;
        default:
          mimeType = 'audio/mpeg';
          downloadExtension = '.mp3';
      }
      
      // Format: 47: The_Social_Animal-Worth_Publishers_(2018).mp3
      const baseName = `${chapter.book.title.replace(/\s+/g, '_')}`;
      const fileName = `${chapter.number}: ${baseName}${downloadExtension}`;
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    } else {     
      const zip = new JSZip();
      for (const chapter of chapters) {
        const filePath = path.join(process.cwd(), 'public', 'uploads', chapter.audioFile!);
        const fileBuffer = await fs.readFile(filePath);
        
        const fileExtension = path.extname(chapter.audioFile!).toLowerCase() || '.mp3';
        const baseName = `${chapter.book.title.replace(/\s+/g, '_')}`;
        const fileName = `${chapter.number}: ${baseName}${fileExtension}`;
        zip.file(fileName, fileBuffer);
      }
      
      const chapterNumbers = chapters.map(ch => ch.number).sort((a, b) => a - b);
      const minChapter = chapterNumbers[0];
      const maxChapter = chapterNumbers[chapterNumbers.length - 1];
      const bookName = chapters[0].book.title.replace(/\s+/g, '_');
      const zipFileName = `${bookName} (${minChapter} - ${maxChapter}).zip`;
      
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      return new NextResponse(zipBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipFileName}"`,
        },
      });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to download audio files' }, { status: 500 });
  }
}
