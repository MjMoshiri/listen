# Listen - Book to Audio Converter

A Next.js application that converts books into audio format using Text-to-Speech technology and LLM processing. The application processes books chapter by chapter, breaking them into manageable chunks for TTS conversion, with AI-powered text optimization.

## Features

- Book upload and processing (EPUB) or chapter capture from O'Reilly (browser extension)
- Chapter-by-chapter audio conversion
- LLM-powered text optimization (Gemini, or selfhosted Gemma on Modal)
- Two TTS backends: Gemini TTS, or selfhosted Kokoro on Modal
- Progress tracking for each chapter
- Chunked TTS processing for better performance
- Audio file management

## Backends

The pipeline runs on one of two backends, switchable from the dashboard:

- **Gemini** (default): Google GenAI for text cleaning and TTS. Needs `GEMINI_API_KEY` in `.env`.
- **Selfhost**: your own Modal deployments — Gemma 4 (text cleaning) + Kokoro-82M (TTS)
  from `~/opencode-on-modal/serve/`. Click **Selfhost** on the dashboard: it runs
  `modal deploy` for both apps, saves their URLs to `data/settings.json`, and switches
  the pipeline over. Both endpoints scale to zero when idle. Needs `SELFHOST_API_KEY`
  in `.env` (the same value as the `llama-api-key` Modal secret).

## O'Reilly capture extension

`extension/` is an unpacked Chrome MV3 extension (load via chrome://extensions →
"Load unpacked"). On any O'Reilly book page (learning.oreilly.com or the SFPL
ezproxy mirror) it shows a **🎧 Capture** button: pick chapters from the book's TOC,
and it fetches each one through your logged-in session and POSTs it to
`http://localhost:3000/api/capture`, which extracts spoken text (figures become
caption + alt-text descriptions, footnote/reference lists are dropped) and creates
the chapters in the dashboard, ready for the normal clean + TTS pipeline.

## Tech Stack

- [Next.js 15](https://nextjs.org) with TurboPack
- [Prisma](https://prisma.io) with SQLite database
- [Google's Generative AI](https://ai.google.dev/) for text processing
- EPUB parsing using epub2
- Audio processing with fluent-ffmpeg
- React 19

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up the database:
```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate  # Run database migrations
```

3. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

## Database Management

- `npm run db:studio` - Open Prisma Studio to manage database
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and apply new migrations

## Project Structure

- `src/app` - Next.js application routes and pages
- `prisma/` - Database schema and migrations
- `public/uploads/` - Processed audio files and uploaded books
