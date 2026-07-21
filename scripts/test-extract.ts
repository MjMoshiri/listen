// Sanity-check the O'Reilly HTML extractor against a saved chapter page.
// Run: npx tsx scripts/test-extract.ts "<path-to-saved.html>"
import fs from 'fs';
import { extractChapterText } from '../src/lib/oreilly-html';

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf-8');
const { title, text } = extractChapterText(html);
const blocks = text.split('\n\n');

console.log('title:', title);
console.log('blocks:', blocks.length, ' words:', text.split(/\s+/).length);
console.log('figures:', blocks.filter(b => b.startsWith('Figure')).length);
console.log('--- first 3 blocks ---');
blocks.slice(0, 3).forEach(b => console.log('•', b.slice(0, 160)));
console.log('--- a figure block ---');
console.log(blocks.find(b => b.startsWith('Figure 6-1'))?.slice(0, 400));
console.log('--- citation sample (should still contain [ ] for LLM pass) ---');
console.log(blocks.find(b => b.includes('['))?.slice(0, 250));
console.log('--- last block ---');
console.log(blocks[blocks.length - 1].slice(0, 200));
