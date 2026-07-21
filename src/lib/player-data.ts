/**
 * Data for the read-along player: chapter text as ordered blocks with audio
 * durations (one block per TTS chunk), plus prev/next navigation within the
 * book. Before chunks exist the blocks are derived from the chapter text so
 * the reader is usable while audio is still generating.
 */

import { prisma } from './prisma';
import { splitIntoSyncBlocks } from './text-chunker';

export interface PlayerBlock {
  index: number;
  text: string;
  duration: number | null;
  status: string;
}

export interface PlayerData {
  chapter: {
    id: string;
    label: string | null;
    number: number;
    hasAudio: boolean;
    audioFile: string | null;
  };
  book: { id: string; title: string };
  prevId: string | null;
  nextId: string | null;
  blocks: PlayerBlock[];
  done: number;
  total: number;
  generating: boolean;
}

export async function getPlayerData(chapterId: string): Promise<PlayerData | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      book: { select: { id: true, title: true } },
      ttsChunks: {
        orderBy: { index: 'asc' },
        select: { index: true, text: true, duration: true, status: true },
      },
    },
  });
  if (!chapter) return null;

  const siblings = await prisma.chapter.findMany({
    where: { bookId: chapter.bookId, isArchived: false },
    orderBy: { number: 'asc' },
    select: { id: true },
  });
  const at = siblings.findIndex(s => s.id === chapterId);
  const prevId = at > 0 ? siblings[at - 1].id : null;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1].id : null;

  let blocks: PlayerBlock[];
  if (chapter.ttsChunks.length > 0) {
    blocks = chapter.ttsChunks.map(c => ({
      index: c.index,
      text: c.text,
      duration: c.duration,
      status: c.status,
    }));
  } else {
    const source = chapter.audioText || chapter.text || '';
    blocks = splitIntoSyncBlocks(source).map((text, index) => ({
      index,
      text,
      duration: null,
      status: 'pending',
    }));
  }

  const done = chapter.ttsChunks.filter(c => c.status === 'completed').length;

  return {
    chapter: {
      id: chapter.id,
      label: chapter.label,
      number: chapter.number,
      hasAudio: chapter.hasAudio,
      audioFile: chapter.audioFile,
    },
    book: chapter.book,
    prevId,
    nextId,
    blocks,
    done,
    total: chapter.ttsChunks.length || blocks.length,
    generating: chapter.ttsChunks.length > 0 && !chapter.hasAudio,
  };
}
