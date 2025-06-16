import _ from 'lodash';


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
