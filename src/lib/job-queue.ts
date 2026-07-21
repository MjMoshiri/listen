/**
 * Job Queue System — Semaphore-based sliding window concurrency
 *
 * Global concurrency pool: as soon as one chunk finishes, the next starts.
 * No fixed batches, no redundant polling, no deleting completed work on re-submit.
 */

import { processEpubFile } from './epub-processor';
import { prisma } from './prisma';
import path from 'path';
import fs from 'fs/promises';
import { splitIntoSyncBlocks } from './text-chunker';
import { processAudioFilesFast } from './audio-simple';
import { config } from './config';
import { cleanTextForSpeech } from './providers/llm';
import { synthesizeChunk } from './providers/tts';
import { wavDurationSeconds } from './wav';
import { selfhostReady } from './settings';

// ─── Semaphore ───────────────────────────────────────────────────────────────

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>(resolve => this.queue.push(resolve));
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

// Single global semaphore for all TTS chunk processing
const ttsSemaphore = new Semaphore(config.maxConcurrentChunks);

// ─── Book Processing Queue (unchanged) ───────────────────────────────────────

interface BookProcessingJob {
  bookId: string;
  filePath: string;
}

class JobQueue {
  private jobs: BookProcessingJob[] = [];
  private isProcessing = false;

  addJob(job: BookProcessingJob) {
    this.jobs.push(job);
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.jobs.length === 0) return;
    this.isProcessing = true;
    const job = this.jobs.shift();
    if (job) {
      try {
        await this.processBook(job);
      } catch (error) {
        console.error(`Error processing book ${job.bookId}:`, error);
      }
    }
    this.isProcessing = false;
    if (this.jobs.length > 0) setTimeout(() => this.processNext(), 100);
  }

  private async processBook(job: BookProcessingJob) {
    const chapters = await processEpubFile(job.filePath);
    console.log(`Extracted ${chapters.length} chapters for book ${job.bookId}`);
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
  }
}

const jobQueue = new JobQueue();
export function addBookProcessingJob(bookId: string, filePath: string) {
  jobQueue.addJob({ bookId, filePath });
}
export { jobQueue };

// ─── Cleaning ────────────────────────────────────────────────────────────────

// Concurrent cleaning with its own semaphore
const cleaningSemaphore = new Semaphore(config.maxConcurrentChapters);

async function cleanChapterText(chapterId: string, text: string): Promise<string> {
  console.log(`Cleaning text for chapter ${chapterId}`);
  try {
    const cleaned = await cleanTextForSpeech(text);
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { audioText: cleaned, hasCleaned: true },
    });
    console.log(`Cleaned chapter ${chapterId}`);
    return cleaned;
  } catch (error) {
    console.error(`Error cleaning chapter ${chapterId}:`, error);
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { audioText: text, hasCleaned: true },
    });
    return text;
  }
}

export function addChapterCleaningJob(chapterId: string, text: string) {
  // Fire-and-forget with concurrency control
  (async () => {
    await cleaningSemaphore.acquire();
    try {
      await cleanChapterText(chapterId, text);
    } finally {
      cleaningSemaphore.release();
    }
  })();
}

// ─── TTS chunk processing ────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function processTTSChunk(chunkId: string, retryCount = 0): Promise<void> {
  const chunk = await prisma.tTSChunk.findUnique({ where: { id: chunkId } });
  if (!chunk || chunk.status === 'completed') return;

  await prisma.tTSChunk.update({
    where: { id: chunkId },
    data: { status: 'processing', error: null },
  });

  try {
    const wavBuffer = await synthesizeChunk(chunk.text);
    const audioFile = `${chunk.id}.wav`;
    await fs.writeFile(path.join('public/uploads', audioFile), wavBuffer);

    await prisma.tTSChunk.update({
      where: { id: chunkId },
      data: {
        audioFile,
        duration: wavDurationSeconds(wavBuffer),
        status: 'completed',
        error: null,
      },
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`TTS chunk ${chunkId} failed (attempt ${retryCount + 1}):`, errorMsg);

    if (retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
      await new Promise(r => setTimeout(r, delay));
      return processTTSChunk(chunkId, retryCount + 1);
    }

    await prisma.tTSChunk.update({
      where: { id: chunkId },
      data: { status: 'failed', error: errorMsg },
    });
  }
}

/** Process a single chunk through the global semaphore */
async function processChunkWithSemaphore(chunkId: string): Promise<void> {
  await ttsSemaphore.acquire();
  try {
    await processTTSChunk(chunkId);
  } finally {
    ttsSemaphore.release();
  }
}

// ─── Combine audio for a chapter ─────────────────────────────────────────────

async function combineChapterAudio(chapterId: string): Promise<void> {
  const chunks = await prisma.tTSChunk.findMany({
    where: { chapterId, status: 'completed' },
    orderBy: { index: 'asc' },
  });

  const files = chunks.filter(c => c.audioFile).map(c => path.join('public/uploads', c.audioFile!));
  if (files.length === 0) throw new Error(`No completed audio files for chapter ${chapterId}`);

  const outputFile = `public/uploads/${chapterId}.mp3`;
  await processAudioFilesFast(files, outputFile);

  await prisma.chapter.update({
    where: { id: chapterId },
    data: { audioFile: `${chapterId}.mp3`, hasAudio: true },
  });
  console.log(`Combined audio for chapter ${chapterId}`);
}

// ─── Main TTS entry point ────────────────────────────────────────────────────

/**
 * Process a chapter for TTS: clean if needed, create chunks (skip existing completed),
 * process all pending/failed chunks through the global semaphore, then combine.
 */
export async function addChapterTTSJobAuto(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { text: true, audioText: true, hasAudio: true, hasCleaned: true },
  });

  if (!chapter) { console.error(`Chapter ${chapterId} not found`); return; }
  if (chapter.hasAudio) { console.log(`Chapter ${chapterId} already has audio`); return; }
  if (!selfhostReady()) {
    // Don't burn retries (or mark anything cleaned) against a dead backend —
    // the chapter stays pending and can be generated once selfhost is on.
    console.log(`Selfhost backend is off — chapter ${chapterId} captured but not processed`);
    return;
  }

  // Clean if needed
  let cleanText: string;
  if (!chapter.hasCleaned || !chapter.audioText) {
    if (!chapter.text) { console.error(`Chapter ${chapterId} has no text`); return; }
    cleanText = await cleanChapterText(chapterId, chapter.text);
  } else {
    cleanText = chapter.audioText;
  }

  // Check for existing chunks (don't wipe completed work on re-submit)
  const existingChunks = await prisma.tTSChunk.findMany({
    where: { chapterId },
    orderBy: { index: 'asc' },
  });

  let chunkRecords;
  if (existingChunks.length > 0) {
    // Reuse existing chunks — only re-process pending/failed ones
    chunkRecords = existingChunks;
    console.log(`Resuming ${chapterId}: ${existingChunks.filter(c => c.status === 'completed').length}/${existingChunks.length} already done`);
  } else {
    // One chunk per paragraph: the read-along player highlights whichever
    // block the audio is in, so chunk boundaries must match display blocks.
    const texts = splitIntoSyncBlocks(cleanText);
    chunkRecords = await Promise.all(
      texts.map((text, idx) => prisma.tTSChunk.create({ data: { chapterId, index: idx, text, status: 'pending' } }))
    );
    console.log(`Created ${chunkRecords.length} chunks for chapter ${chapterId}`);
  }

  // Process all non-completed chunks through the global semaphore (sliding window)
  const toProcess = chunkRecords.filter(c => c.status !== 'completed');
  if (toProcess.length > 0) {
    await Promise.all(toProcess.map(c => processChunkWithSemaphore(c.id)));
  }

  // Check results and combine
  const finalChunks = await prisma.tTSChunk.findMany({
    where: { chapterId },
    select: { status: true },
  });

  const allCompleted = finalChunks.every(c => c.status === 'completed');
  if (allCompleted) {
    try {
      await combineChapterAudio(chapterId);
    } catch (err) {
      console.error(`Failed to combine chapter ${chapterId}:`, err);
    }
  } else {
    const failed = finalChunks.filter(c => c.status === 'failed').length;
    const pending = finalChunks.filter(c => c.status !== 'completed' && c.status !== 'failed').length;
    console.log(`Chapter ${chapterId}: ${failed} failed, ${pending} unfinished, not combining`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

// Track active chapter processing promises
const activeChapters = new Map<string, Promise<void>>();

export function addTTSJob(chapterId: string) {
  if (activeChapters.has(chapterId)) {
    console.log(`TTS job for chapter ${chapterId} already active, skipping`);
    return;
  }

  const promise = addChapterTTSJobAuto(chapterId).finally(() => {
    activeChapters.delete(chapterId);
  });
  activeChapters.set(chapterId, promise);
}

export async function batchProcessTTS(chapterIds: string[]) {
  console.log(`Batch TTS: ${chapterIds.length} chapters`);
  for (const id of chapterIds) {
    addTTSJob(id);
  }
}

export async function retryFailedChunks(chapterId: string): Promise<void> {
  const failedChunks = await prisma.tTSChunk.findMany({
    where: { chapterId, status: 'failed' },
  });
  if (failedChunks.length === 0) return;

  console.log(`Retrying ${failedChunks.length} failed chunks for chapter ${chapterId}`);
  await Promise.all(failedChunks.map(c => processChunkWithSemaphore(c.id)));

  // Check if all done now
  const allChunks = await prisma.tTSChunk.findMany({
    where: { chapterId },
    select: { status: true },
  });
  if (allChunks.every(c => c.status === 'completed')) {
    await combineChapterAudio(chapterId);
  }
}

export function cleanAndTTSChapter(chapterId: string) {
  addTTSJob(chapterId);
}

export function getTTSQueueStatus() {
  return {
    activeChapters: Array.from(activeChapters.keys()),
    processingCount: activeChapters.size,
  };
}
