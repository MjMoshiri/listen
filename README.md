# Listen - Book to Audio Converter

A Next.js application that converts books into audio format using Text-to-Speech technology and LLM processing. The application processes books chapter by chapter, breaking them into manageable chunks for TTS conversion, with AI-powered text optimization.

## Features

- Book upload and processing
- Chapter-by-chapter audio conversion
- LLM-powered text optimization using Google's Generative AI
- Progress tracking for each chapter
- Chunked TTS processing for better performance
- Audio file management

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
