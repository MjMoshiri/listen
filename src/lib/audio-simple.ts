/**
 * Simple and fast audio processing using native Node.js and the wav library
 * This should be much faster than external dependencies
 */
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Simple WAV file combination using native Node.js streams
 * This reads WAV files and combines their audio data directly
 */
export async function combineWavFilesSimple(inputFiles: string[], outputFile: string): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('combineWavFilesSimple can only be used on the server side');
  }

  try {
    console.log(`Combining ${inputFiles.length} WAV files using simple stream approach`);
    
    // Verify all input files exist
    const validFiles: string[] = [];
    let totalDataSize = 0;
    
    for (const file of inputFiles) {
      try {
        await fs.access(file);
        const stats = await fs.stat(file);
        console.log(`✓ Found file: ${file} (${stats.size} bytes)`);
        validFiles.push(file);
        // Estimate data size (file size minus typical WAV header ~44 bytes)
        totalDataSize += Math.max(0, stats.size - 44);
      } catch (error) {
        console.warn(`⚠ Skipping missing file: ${file}`);
      }
    }

    if (validFiles.length === 0) {
      throw new Error('No valid input files found');
    }

    if (validFiles.length === 1) {
      // Single file, just copy it
      console.log('Single file detected, copying instead of concatenating');
      await fs.copyFile(validFiles[0], outputFile);
      console.log(`✓ Single file copied to: ${outputFile}`);
      return;
    }

    console.log(`Combining ${validFiles.length} files with estimated ${totalDataSize} bytes of audio data`);

    // Read the first file to get WAV header info
    const firstFileBuffer = await fs.readFile(validFiles[0]);
    if (firstFileBuffer.length < 44) {
      throw new Error('Invalid WAV file: too small');
    }

    // Check for valid WAV header
    if (firstFileBuffer.toString('ascii', 0, 4) !== 'RIFF' || 
        firstFileBuffer.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Invalid WAV file format');
    }

    // Extract format information from the first file
    const wavHeader = firstFileBuffer.subarray(0, 44);
    
    // Update file size in header (total size = header + all audio data)
    const newFileSize = 36 + totalDataSize;
    wavHeader.writeUInt32LE(newFileSize, 4);
    wavHeader.writeUInt32LE(totalDataSize, 40);

    console.log(`Writing combined WAV file with ${newFileSize} total bytes`);

    // Write the combined file
    const outputStream = createWriteStream(outputFile);
    
    try {
      // Write the header first
      outputStream.write(wavHeader);
      
      // Append audio data from each file (skip their headers)
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        console.log(`Processing file ${i + 1}/${validFiles.length}: ${path.basename(file)}`);
        
        const fileBuffer = await fs.readFile(file);
        
        // Skip the WAV header (typically 44 bytes) and write only audio data
        const audioData = fileBuffer.subarray(44);
        outputStream.write(audioData);
        console.log(`Added ${audioData.length} bytes of audio data`);
      }
      
      outputStream.end();
      
      // Wait for the stream to finish
      await new Promise<void>((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
      });
      
      // Verify output file
      const outputStats = await fs.stat(outputFile);
      console.log(`✓ Combined WAV file created: ${outputFile} (${outputStats.size} bytes)`);
      
    } catch (error) {
      outputStream.destroy();
      throw error;
    }

  } catch (error) {
    console.error('Error combining WAV files:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to combine WAV files: ${errorMessage}`);
  }
}

/**
 * Convert WAV to MP3 using a direct FFmpeg command with timeout
 * This is much simpler and faster than fluent-ffmpeg
 */
export async function convertWavToMp3Simple(inputFile: string, outputFile: string): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('convertWavToMp3Simple can only be used on the server side');
  }

  try {
    console.log(`Converting WAV to MP3: ${inputFile} -> ${outputFile}`);
    
    // Verify input file exists
    await fs.access(inputFile);
    const inputStats = await fs.stat(inputFile);
    console.log(`Input file: ${inputFile} (${inputStats.size} bytes)`);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Use a simple, fast FFmpeg command
    const command = `ffmpeg -y -i "${inputFile}" -acodec libmp3lame -b:a 128k "${outputFile}"`;
    console.log(`Running FFmpeg: ${command}`);
    
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(command);
    const duration = Date.now() - startTime;
    
    console.log(`FFmpeg completed in ${duration}ms`);
    if (stderr && stderr.includes('error')) {
      console.error(`FFmpeg stderr: ${stderr}`);
    }

    // Verify output file was created
    const outputStats = await fs.stat(outputFile);
    console.log(`✓ MP3 file created: ${outputFile} (${outputStats.size} bytes)`);

  } catch (error) {
    console.error('Error converting WAV to MP3:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert WAV to MP3: ${errorMessage}`);
  }
}

/**
 * Fast audio processing: combine WAV files and convert to MP3
 * This should complete in seconds, not minutes
 */
export async function processAudioFilesFast(inputFiles: string[], outputMp3File: string): Promise<void> {
  const tempWavFile = outputMp3File.replace('.mp3', '_temp.wav');
  
  try {
    const startTime = Date.now();
    console.log(`Starting fast audio processing for ${inputFiles.length} files`);
    
    // Step 1: Combine WAV files (should be very fast)
    console.log(`Step 1: Combining WAV files...`);
    const combineStart = Date.now();
    await combineWavFilesSimple(inputFiles, tempWavFile);
    console.log(`Step 1 completed in ${Date.now() - combineStart}ms`);
    
    // Step 2: Convert to MP3 (should take a few seconds at most)
    console.log(`Step 2: Converting to MP3...`);
    const convertStart = Date.now();
    await convertWavToMp3Simple(tempWavFile, outputMp3File);
    console.log(`Step 2 completed in ${Date.now() - convertStart}ms`);
    
    // Step 3: Clean up
    await fs.unlink(tempWavFile);
    console.log(`✓ Temporary file cleaned up`);
    
    const totalDuration = Date.now() - startTime;
    console.log(`🚀 Fast audio processing completed in ${totalDuration}ms`);
    
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempWavFile);
      console.log(`Cleaned up temp file after error: ${tempWavFile}`);
    } catch (cleanupError) {
      console.log(`Temp file cleanup failed (file may not exist): ${tempWavFile}`);
    }
    throw error;
  }
}
