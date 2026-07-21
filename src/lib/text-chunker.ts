import _ from 'lodash';

/**
 * Read-along blocks: one block per paragraph, so per-block audio durations
 * line up exactly with what the player displays and highlights. Very long
 * paragraphs are split on sentence boundaries to keep TTS requests sane.
 */
export function splitIntoSyncBlocks(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const blocks: string[] = [];

  for (const para of paragraphs) {
    if (para.split(/\s+/).length <= 250) {
      blocks.push(para);
      continue;
    }
    const sentences = para.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [para];
    let current: string[] = [];
    let words = 0;
    for (const sentence of sentences) {
      const w = sentence.trim().split(/\s+/).length;
      if (words + w > 200 && words > 0) {
        blocks.push(current.join(' ').trim());
        current = [];
        words = 0;
      }
      current.push(sentence.trim());
      words += w;
    }
    if (current.length) blocks.push(current.join(' ').trim());
  }

  return blocks;
}

export function splitTextIntoParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const result: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean);
    if (
      currentWordCount + paraWords.length > 500 &&
      currentWordCount > 0
    ) {
      result.push(currentChunk.join('\n\n'));
      currentChunk = [];
      currentWordCount = 0;
    }
    currentChunk.push(para);
    currentWordCount += paraWords.length;
  }

  if (currentChunk.length > 0) {
    const lastChunkText = currentChunk.join('\n\n');
    const lastChunkWords = lastChunkText.split(/\s+/).filter(Boolean);
    if (lastChunkWords.length > 700) {
      for (let i = 0; i < lastChunkWords.length; i += 700) {
        result.push(lastChunkWords.slice(i, i + 700).join(' '));
      }
    } else {
      result.push(lastChunkText);
    }
  }

  return result;
}
