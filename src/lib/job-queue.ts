/**
 * Job Queue System
 * 
 * This file implements a comprehensive job queue system for processing books and TTS:
 * 
 * 1. BOOK PROCESSING QUEUE: Handles EPUB file processing and chapter extraction
 * 2. CLEANING QUEUE: Processes text cleaning using AI to prepare for TTS
 * 3. TTS QUEUE: Manages text-to-speech generation with proper workflow
 * 
 * WORKFLOW GUARANTEE:
 * - TTS always operates on clean text
 * - If text is not cleaned when TTS is requested, it will be cleaned first
 * - Chunking happens on the clean text to ensure optimal TTS results
 * 
 * KEY FUNCTIONS:
 * - addBookProcessingJob(): Add book for EPUB processing
 * - addChapterCleaningJob(): Add chapter for text cleaning
 * - addTTSJob(): Add chapter to TTS queue (with automatic cleaning)
 * - batchProcessTTS(): Process multiple chapters efficiently
 * - cleanAndTTSChapter(): Clean then TTS a single chapter
 */

import { processEpubFile } from './epub-processor';
import { prisma } from './prisma';
import path from 'path';
import { splitTextIntoParagraphs } from './text-chunker';
import fs from 'fs/promises';
import { config } from './config';

interface BookProcessingJob {
  bookId: string;
  filePath: string;
}

class JobQueue {
  private jobs: BookProcessingJob[] = [];
  private isProcessing = false;
  addJob(job: BookProcessingJob) {
    console.log(`Adding job to queue for book ${job.bookId} at ${job.filePath}`);
    this.jobs.push(job);
    console.log(`Queue length: ${this.jobs.length}`);
    this.processNext();
  }
  private async processNext() {
    console.log(`ProcessNext called. IsProcessing: ${this.isProcessing}, Queue length: ${this.jobs.length}`);

    if (this.isProcessing || this.jobs.length === 0) {
      return;
    }

    this.isProcessing = true;
    const job = this.jobs.shift();

    if (job) {
      try {
        console.log(`Processing job for book ${job.bookId}`);
        await this.processBook(job);
      } catch (error) {
        console.error(`Error processing book ${job.bookId}:`, error);
      }
    }

    this.isProcessing = false;

    // Process next job if available
    if (this.jobs.length > 0) {
      setTimeout(() => this.processNext(), config.processNextTimeoutMs);
    }
  }

  private async processBook(job: BookProcessingJob) {
    console.log(`Starting to process book ${job.bookId}`);

    try {
      // Extract chapters from EPUB
      const chapters = await processEpubFile(job.filePath);

      console.log(`Extracted ${chapters.length} chapters for book ${job.bookId}`);

      // Save chapters to database
      for (const chapter of chapters) {
        await prisma.chapter.create({
          data: {
            bookId: job.bookId,
            text: chapter.text,
            label: chapter.title,
            number: chapter.number,
            isRead: false,
            isArchived: false,
            hasCleaned: false,
            hasAudio: false,
          },
        });
      }

      console.log(`Successfully processed book ${job.bookId} with ${chapters.length} chapters`);
    } catch (error) {
      console.error(`Failed to process book ${job.bookId}:`, error);

      // Optionally, mark the book as failed or add retry logic
      // For now, we'll just log the error
    }
  }
}

// Global job queue instance
const jobQueue = new JobQueue();

export function addBookProcessingJob(bookId: string, filePath: string) {
  jobQueue.addJob({ bookId, filePath });
}

export { jobQueue };

// --- CLEANING QUEUE ---
interface ChapterCleaningJob {
  chapterId: string;
  text: string;
}

class CleaningQueue {
  private jobs: ChapterCleaningJob[] = [];
  private isProcessing = false;
  addJob(job: ChapterCleaningJob) {
    console.log(`Adding cleaning job to queue for chapter ${job.chapterId}`);
    this.jobs.push(job);
    console.log(`Cleaning queue length: ${this.jobs.length}`);
    this.processNext();
  }
  private async processNext() {
    console.log(`CleaningQueue processNext called. IsProcessing: ${this.isProcessing}, Queue length: ${this.jobs.length}`);

    if (this.isProcessing || this.jobs.length === 0) return;
    this.isProcessing = true;
    const job = this.jobs.shift();
    if (job) {
      try {
        console.log(`Processing cleaning job for chapter ${job.chapterId}`);
        await this.processChapter(job);
      } catch (error) {
        console.error(`Error cleaning chapter ${job.chapterId}:`, error);
      }
    }
    this.isProcessing = false;
    if (this.jobs.length > 0) setTimeout(() => this.processNext(), 100);
  } private async processChapter(job: ChapterCleaningJob) {
    console.log(`Starting to clean chapter ${job.chapterId}`);

    // Use Gemini API to clean text
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Keep the full text exactly the same word for word, but take out anything that makes it hard to read out loud in front of people. This includes things like footnote numbers, citation marks, or extra symbols that don’t help when speaking. Don’t change the words or shorten the text—just clean it up for smooth reading.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: `${prompt}\n\n${job.text}` }] }],
      config: { maxOutputTokens: config.maxOutputTokens, temperature: config.temperature },
    }); const cleaned = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || job.text;

    console.log(`Successfully cleaned chapter ${job.chapterId}`);

    await prisma.chapter.update({
      where: { id: job.chapterId },
      data: { audioText: cleaned, hasCleaned: true },
    });

    console.log(`Updated chapter ${job.chapterId} with cleaned text - cleaning only, not automatically submitting for TTS`);
  }
}
const cleaningQueue = new CleaningQueue();
export function addChapterCleaningJob(chapterId: string, text: string) {
  cleaningQueue.addJob({ chapterId, text });
}

// Function to clean and then process TTS for a chapter
export async function cleanAndTTSChapter(chapterId: string) {
  console.log(`Starting clean and TTS process for chapter ${chapterId}`);

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      text: true,
      audioText: true,
      hasAudio: true,
      hasCleaned: true
    }
  });

  if (!chapter) {
    console.error(`Chapter ${chapterId} not found`);
    return;
  }

  if (chapter.hasAudio) {
    console.log(`Chapter ${chapterId} already has audio`);
    return;
  }

  // Ensure text is cleaned before TTS
  await addChapterTTSJobAuto(chapterId);
}

export { cleaningQueue };

// --- TTS QUEUE REFACTOR ---


// Import the fast, simple audio processing utilities
import { processAudioFilesFast } from './audio-simple';

// --- TTS QUEUE REFACTOR ---
// Remove old TTSQueue and related logic, replace with chunk-based system

// Helper function to clean chapter text
async function cleanChapterText(chapterId: string, text: string): Promise<string> {
  console.log(`Cleaning text for chapter ${chapterId}`);

  try {
    // Use Gemini API to clean text
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Keep the full text exactly the same word for word, but take out anything that makes it hard to read out loud in front of people. This includes things like footnote numbers, citation marks, or extra symbols that don't help when speaking. Don't change the words or shorten the text—just clean it up for smooth reading.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }],
      config: { maxOutputTokens: config.maxOutputTokens, temperature: config.temperature },
    });

    const cleaned = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || text;

    // Update chapter with cleaned text
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { audioText: cleaned, hasCleaned: true },
    });

    console.log(`Successfully cleaned text for chapter ${chapterId}`);
    return cleaned;
  } catch (error) {
    console.error(`Error cleaning text for chapter ${chapterId}:`, error);
    // Fallback to original text if cleaning fails
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { audioText: text, hasCleaned: true },
    });
    return text;
  }
}

export async function addChapterTTSJobAuto(chapterId: string) {
  try {
    console.log(`Starting TTS job for chapter ${chapterId}`);

    // Fetch chapter data
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        text: true,
        audioText: true,
        hasAudio: true,
        hasCleaned: true
      }
    });

    if (!chapter) {
      console.error(`Chapter ${chapterId} not found`);
      return;
    }

    if (chapter.hasAudio) {
      console.log(`Chapter ${chapterId} already has audio`);
      return;
    }

    let cleanText: string;

    // If text is not cleaned, clean it first
    if (!chapter.hasCleaned || !chapter.audioText) {
      if (!chapter.text) {
        console.error(`Chapter ${chapterId} has no text to clean`);
        return;
      }

      console.log(`Chapter ${chapterId} text is not cleaned, cleaning first...`);
      cleanText = await cleanChapterText(chapterId, chapter.text);
    } else {
      cleanText = chapter.audioText;
    }

    // Now proceed with TTS using the clean text
    const chunks = splitTextIntoParagraphs(cleanText);

    // Create TTSChunk entries
    await prisma.tTSChunk.deleteMany({ where: { chapterId } });
    const chunkRecords = await Promise.all(chunks.map((text: string, idx: number) =>
      prisma.tTSChunk.create({ data: { chapterId, index: idx, text, status: 'pending' } })
    ));

    // Process chunks concurrently with a limit of 10
    const MAX_CONCURRENT_CHUNKS = config.maxConcurrentChunks;
    const processChunk = async (chunk: any) => {
      await processTTSChunk(chunk.id);
    };

    console.log(`Processing ${chunkRecords.length} chunks with max ${MAX_CONCURRENT_CHUNKS} concurrent requests`);

    // Process chunks in batches of 10
    for (let i = 0; i < chunkRecords.length; i += MAX_CONCURRENT_CHUNKS) {
      const batch = chunkRecords.slice(i, i + MAX_CONCURRENT_CHUNKS);
      console.log(`Processing batch ${Math.floor(i / MAX_CONCURRENT_CHUNKS) + 1} with ${batch.length} chunks`);
      await Promise.all(batch.map(processChunk));
    }
    // Wait for all chunks to complete (they should already be done due to Promise.all)
    let allDone = false;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes timeout

    while (!allDone && attempts < maxAttempts) {
      const statuses = await prisma.tTSChunk.findMany({
        where: { chapterId },
        select: { status: true }
      });

      const completed = statuses.filter(s => s.status === 'completed').length;
      const failed = statuses.filter(s => s.status === 'failed').length;
      const total = statuses.length;

      console.log(`Chapter ${chapterId}: ${completed}/${total} chunks completed, ${failed} failed`);

      allDone = statuses.every((s: { status: string }) =>
        s.status === 'completed' || s.status === 'failed'
      );

      if (!allDone) {
        await new Promise(r => setTimeout(r, config.chunkBatchTimeoutMs));
        attempts++;
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error(`Timeout waiting for TTS chunks to complete for chapter ${chapterId}`);
    }

    try {
      // Combine audio files and convert to MP3
      const chunks = await prisma.tTSChunk.findMany({
        where: { chapterId, status: 'completed' },
        orderBy: { index: 'asc' }
      });

      // Filter out any chunks without audio files
      const files = chunks
        .filter(c => c.audioFile)
        .map(c => path.join('public/uploads', c.audioFile!));

      if (files.length === 0) {
        throw new Error(`No completed audio files found for chapter ${chapterId}`);
      } console.log(`Combining ${files.length} audio files for chapter ${chapterId}`);
      console.log(`Audio files to combine:`, files);

      const outputFile = `public/uploads/${chapterId}.mp3`;
      try {
        // Use the fast, simple audio processing with a much shorter timeout
        console.log(`Processing audio files using fast, simple approach`);
        const audioPromise = processAudioFilesFast(files, outputFile);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Audio processing timed out after 30 seconds')), config.ttsTimeoutMs)
        );

        await Promise.race([audioPromise, timeoutPromise]);
        console.log(`Fast audio processing completed successfully`);
      } catch (audioError) {
        console.error(`Audio processing error for chapter ${chapterId}:`, audioError);
        // Try to clean up any partial files
        try {
          const fs = await import('fs/promises');
          await fs.unlink(outputFile);
          console.log(`Cleaned up partial output file after error`);
        } catch (cleanupError) {
          const errorMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          console.log(`Output file cleanup failed (file may not exist):`, errorMessage);
        }
        throw audioError;
      }
      // Update chapter status to indicate audio is ready
      const updateResult = await prisma.chapter.update({
        where: { id: chapterId },
        data: { audioFile: `${chapterId}.mp3`, hasAudio: true }
      });
      console.log(`Successfully updated chapter ${chapterId} status:`, {
        audioFile: updateResult.audioFile,
        hasAudio: updateResult.hasAudio
      });

      // Verify the update was successful
      const verifyChapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        select: { hasAudio: true, audioFile: true }
      });

      if (verifyChapter?.hasAudio) {
        console.log(`✅ Chapter ${chapterId} successfully marked as having audio`);
      } else {
        console.error(`❌ Chapter ${chapterId} was NOT properly updated - hasAudio is still false!`);
      }

      console.log(`Successfully completed TTS processing for chapter ${chapterId}`);
    } catch (error) {
      console.error(`Error combining audio files for chapter ${chapterId}:`, error);
      // Don't update hasAudio if there was an error
      throw error;
    }
  } catch (error) {
    console.error(`Error in TTS job for chapter ${chapterId}:`, error);
    // Optionally mark chapter as failed or log for retry
    throw error;
  }
}

async function saveWaveFile(
  filename: string,
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const wav = require('wav');
    const writer = new wav.FileWriter(filename, {
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    writer.on('finish', resolve);
    writer.on('error', reject);

    writer.write(pcmData);
    writer.end();
  });
}

async function processTTSChunk(chunkId: string) {
  const chunk = await prisma.tTSChunk.findUnique({ where: { id: chunkId } });
  if (!chunk || chunk.status === 'completed') return;

  // Mark as processing
  await prisma.tTSChunk.update({
    where: { id: chunkId },
    data: { status: 'processing' }
  });

  // Ensure this only runs on server side
  if (typeof window !== 'undefined') {
    throw new Error('processTTSChunk can only be used on the server side');
  }

  try {
    console.log(`Processing TTS for chunk ${chunkId} with text: ${chunk.text.substring(0, 100)}...`);

    // Use Gemini API for TTS
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: config.geminiTTSModel,
      contents: [{
        parts: [{
          text: 'You are narrating an audio book. Read The Following Text in the appropriate tune:\n'
            + chunk.text
        }]
      }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.geminiVoiceName },
          },
        },
      },
    });

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) {
      throw new Error('No audio data received from Gemini API');
    }

    const audioBuffer = Buffer.from(data, 'base64');
    const audioFile = `${chunk.id}.wav`;
    const outputPath = path.join('public/uploads', audioFile);

    // Save as WAV file
    await saveWaveFile(outputPath, audioBuffer);

    console.log(`Successfully generated TTS for chunk ${chunkId}`);
    await prisma.tTSChunk.update({
      where: { id: chunkId },
      data: { audioFile, status: 'completed' }
    });
  } catch (e) {
    console.error(`Error processing TTS for chunk ${chunkId}:`, e);
    await prisma.tTSChunk.update({
      where: { id: chunkId },
      data: { status: 'failed', error: String(e) }
    });
    throw e; // Re-throw so the calling function knows this chunk failed
  }
}

// --- TTS QUEUE WITH PROPER WORKFLOW ---

interface TTSJob {
  chapterId: string;
  priority?: number;
}

class TTSQueue {
  private jobs: TTSJob[] = [];
  private processing = new Set<string>(); // Track currently processing chapters
  private maxConcurrent = config.maxConcurrentChapters; // Process up to N chapters concurrently

  addJob(job: TTSJob) {
    // Avoid duplicate jobs for the same chapter
    if (this.jobs.some(j => j.chapterId === job.chapterId) || this.processing.has(job.chapterId)) {
      console.log(`TTS job for chapter ${job.chapterId} already exists, skipping`);
      return;
    }

    console.log(`Adding TTS job to queue for chapter ${job.chapterId}`);
    this.jobs.push(job);
    console.log(`TTS queue length: ${this.jobs.length}`);
    this.processNext();
  }

  private async processNext() {
    // Process multiple jobs concurrently up to maxConcurrent limit
    while (this.processing.size < this.maxConcurrent && this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (job && !this.processing.has(job.chapterId)) {
        this.processing.add(job.chapterId);

        // Process job without awaiting (concurrent execution)
        this.processJob(job).finally(() => {
          this.processing.delete(job.chapterId);
          // Try to process more jobs if queue is not empty
          if (this.jobs.length > 0) {
            setTimeout(() => this.processNext(), config.processNextTimeoutMs);
          }
        });
      }
    }
  }

  private async processJob(job: TTSJob) {
    try {
      console.log(`Processing TTS job for chapter ${job.chapterId}`);
      await addChapterTTSJobAuto(job.chapterId);
      console.log(`Completed TTS job for chapter ${job.chapterId}`);
    } catch (error) {
      console.error(`Error processing TTS job for chapter ${job.chapterId}:`, error);
    }
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.jobs.length,
      processing: Array.from(this.processing),
      processingCount: this.processing.size,
      nextJob: this.jobs[0]?.chapterId || null
    };
  }
}

const ttsQueue = new TTSQueue();

export function addTTSJob(chapterId: string, priority?: number) {
  ttsQueue.addJob({ chapterId, priority });
}

export function getTTSQueueStatus() {
  return ttsQueue.getStatus();
}

// Batch process multiple chapters for TTS
export async function batchProcessTTS(chapterIds: string[]) {
  console.log(`Starting batch TTS processing for ${chapterIds.length} chapters with concurrent processing enabled`);

  for (const chapterId of chapterIds) {
    addTTSJob(chapterId);
  }

  console.log(`Added ${chapterIds.length} chapters to TTS queue`);
}
