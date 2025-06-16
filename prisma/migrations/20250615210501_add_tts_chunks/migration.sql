CREATE TABLE "books" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "text" TEXT,
    "audio_text" TEXT,
    "label" TEXT,
    "audio_file" TEXT,
    "number" INTEGER NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "has_cleaned" BOOLEAN NOT NULL DEFAULT false,
    "has_audio" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "chapters_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chapter_tts_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapter_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "is_last" BOOLEAN NOT NULL DEFAULT false,
    "audio_file" TEXT,
    "has_audio" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "chapter_tts_chunks_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "chapter_tts_chunks_chapter_id_chunk_index_key" ON "chapter_tts_chunks"("chapter_id", "chunk_index");
