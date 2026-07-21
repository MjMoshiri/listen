/**
 * Data for the read-along player.
 *
 * Chapters captured from O'Reilly carry sanitized display HTML whose block
 * elements are stamped data-lb="<index>" — for those, blocks are aggregated
 * to one per paragraph (a long paragraph may span several TTS chunks) so the
 * indices line up with the HTML annotations. Chapters without display HTML
 * (EPUB path, older captures) fall back to plain chunk-per-block text.
 * Before chunks exist the blocks are derived from the chapter text so the
 * reader is usable while audio is still generating.
 */

import { prisma } from './prisma';
import { splitIntoSyncBlocks } from './text-chunker';

export interface PlayerBlock {
  index: number;
  text: string;
  duration: number | null;
  status: string;
}

export interface ChapterNavItem {
  id: string;
  number: number;
  label: string | null;
  hasAudio: boolean;
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
  chapters: ChapterNavItem[];
  /** Sanitized O'Reilly chapter HTML with data-lb annotations, when the
   *  block list can be aligned with it; otherwise null (plain-text view). */
  sourceHtml: string | null;
  blocks: PlayerBlock[];
  done: number;
  total: number;
  generating: boolean;
}

interface ChunkRow {
  index: number;
  text: string;
  duration: number | null;
  status: string;
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

/** Group TTS chunks back into one block per paragraph. Returns null when the
 *  chunk list doesn't line up with the paragraphs (e.g. the LLM clean pass
 *  merged paragraph breaks), in which case the caller falls back to plain. */
function paragraphBlocks(paragraphs: string[], chunks: ChunkRow[]): PlayerBlock[] | null {
  const counts = paragraphs.map(p => splitIntoSyncBlocks(p).length);
  if (counts.reduce((a, b) => a + b, 0) !== chunks.length) return null;

  const blocks: PlayerBlock[] = [];
  let at = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const group = chunks.slice(at, at + counts[i]);
    at += counts[i];
    blocks.push({
      index: i,
      text: paragraphs[i],
      duration: group.every(c => c.duration != null)
        ? group.reduce((s, c) => s + (c.duration || 0), 0)
        : null,
      status: group.every(c => c.status === 'completed') ? 'completed' : 'pending',
    });
  }
  return blocks;
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
    select: { id: true, number: true, label: true, hasAudio: true },
  });
  const at = siblings.findIndex(s => s.id === chapterId);
  const prevId = at > 0 ? siblings[at - 1].id : null;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1].id : null;

  const chunks = chapter.ttsChunks;
  let sourceHtml = chapter.sourceHtml;
  let blocks: PlayerBlock[] | null = null;

  if (sourceHtml) {
    // Rich view: one block per paragraph, aligned with the data-lb stamps.
    const paragraphs = splitParagraphs(chapter.audioText || chapter.text || '');
    blocks = chunks.length
      ? paragraphBlocks(paragraphs, chunks)
      : paragraphs.map((text, index) => ({ index, text, duration: null, status: 'pending' }));
    if (!blocks) sourceHtml = null; // couldn't align — use the plain view
  }

  if (!blocks) {
    blocks = chunks.length
      ? chunks.map(c => ({ index: c.index, text: c.text, duration: c.duration, status: c.status }))
      : splitIntoSyncBlocks(chapter.audioText || chapter.text || '').map((text, index) => ({
          index, text, duration: null, status: 'pending',
        }));
  }

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
    chapters: siblings,
    sourceHtml,
    blocks,
    done: chunks.filter(c => c.status === 'completed').length,
    total: chunks.length || blocks.length,
    generating: chunks.length > 0 && !chapter.hasAudio,
  };
}
