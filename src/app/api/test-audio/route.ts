import { NextRequest, NextResponse } from 'next/server';
import { processAudioFilesFast } from '@/lib/audio-simple';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    console.log('Testing fast audio processing system...');
    
    // Create minimal test WAV files
    const startTime = Date.now();
    const testFiles = await createTestWavFiles();
    console.log(`Test files created in ${Date.now() - startTime}ms`);
    
    const outputFile = path.join(process.cwd(), 'public/uploads', 'test_fast_output.mp3');
    
    // Test the fast processing
    const processStart = Date.now();
    await processAudioFilesFast(testFiles, outputFile);
    const processDuration = Date.now() - processStart;
    
    // Verify output
    const stats = await fs.stat(outputFile);
    console.log(`✅ Fast audio processing completed in ${processDuration}ms`);
    
    // Clean up
    for (const file of testFiles) {
      await fs.unlink(file);
    }
    await fs.unlink(outputFile);
    
    return NextResponse.json({
      status: 'success',
      message: `Fast audio processing test completed successfully in ${processDuration}ms`,
      duration: processDuration
    });
    
  } catch (error) {
    console.error('Fast audio test error:', error);
    return NextResponse.json({
      status: 'error',
      message: `Audio test failed: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
}

async function createTestWavFiles(): Promise<string[]> {
  // Minimal WAV file header for 1 second of silence at 22050 Hz, 16-bit mono
  const sampleRate = 22050;
  const duration = 1; // 1 second
  const samples = sampleRate * duration;
  const dataSize = samples * 2; // 16-bit = 2 bytes per sample
  
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(1, 22);  // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  const silence = Buffer.alloc(dataSize, 0);
  const wavData = Buffer.concat([header, silence]);
  
  const uploadsDir = path.join(process.cwd(), 'public/uploads');
  const testFiles = [];
  
  // Create 3 small test files
  for (let i = 0; i < 3; i++) {
    const testFile = path.join(uploadsDir, `test_fast_${i}.wav`);
    await fs.writeFile(testFile, wavData);
    testFiles.push(testFile);
  }
  
  return testFiles;
}
