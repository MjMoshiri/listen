-- Migration for TTSChunk table (no comments, valid SQL only)
// Add a new model to track TTS sub-tasks for each chapter
// Run: npx prisma migrate dev --name add_tts_chunks

model TTSChunk {
  id         String   @id @default(cuid())
  chapterId  String
  index      Int      // Order of the chunk in the chapter
  text       String   // The chunk text
  audioFile  String?  // Path to the generated audio file
  status     String   // 'pending', 'processing', 'completed', 'failed'
  error      String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  chapter    Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)

  @@unique([chapterId, index])
  @@map("tts_chunks")
}
