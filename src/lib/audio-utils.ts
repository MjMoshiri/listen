/**
 * Audio utilities using proper Node.js libraries instead of direct FFmpeg commands
 */
import path from 'path';
import fs from 'fs/promises';

/**
 * Combine multiple WAV files into a single WAV file using wav-concat
 */
export async function combineWavFiles(inputFiles: string[], outputFile: string): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('combineWavFiles can only be used on the server side');
  }

  try {
    console.log(`Combining ${inputFiles.length} WAV files using wav-concat library`);
      // Verify all input files exist
    const validFiles: string[] = [];
    for (const file of inputFiles) {
      try {
        await fs.access(file);
        const stats = await fs.stat(file);
        console.log(`✓ Found file: ${file} (${stats.size} bytes)`);
        validFiles.push(file);
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

    // Use wav-concat to combine files
    const wavConcat = require('wav-concat');
    
    // Create a promise wrapper since wav-concat might use callbacks
    await new Promise<void>((resolve, reject) => {
      wavConcat(validFiles, outputFile, (error: any) => {
        if (error) {
          console.error('wav-concat error:', error);
          reject(new Error(`WAV concatenation failed: ${error.message || error}`));
        } else {
          resolve();
        }
      });
    });

    // Verify output file was created
    const outputStats = await fs.stat(outputFile);
    console.log(`✓ Combined WAV file created: ${outputFile} (${outputStats.size} bytes)`);

  } catch (error) {
    console.error('Error combining WAV files:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to combine WAV files: ${errorMessage}`);
  }
}

/**
 * Convert WAV to MP3 using fluent-ffmpeg (more reliable than direct commands)
 */
export async function convertWavToMp3(inputFile: string, outputFile: string): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('convertWavToMp3 can only be used on the server side');
  }

  try {
    console.log(`Converting WAV to MP3: ${inputFile} -> ${outputFile}`);
    
    // Verify input file exists
    await fs.access(inputFile);
    const inputStats = await fs.stat(inputFile);
    console.log(`Input file: ${inputFile} (${inputStats.size} bytes)`);

    const ffmpeg = require('fluent-ffmpeg');
    
    // Create a promise wrapper for fluent-ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioQuality(2)
        .on('start', (commandLine: string) => {
          console.log('FFmpeg process started:', commandLine);
        })
        .on('progress', (progress: any) => {
          if (progress.percent) {
            console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('MP3 conversion completed successfully');
          resolve();
        })
        .on('error', (error: any) => {
          console.error('FFmpeg conversion error:', error);
          reject(new Error(`MP3 conversion failed: ${error.message || error}`));
        })
        .save(outputFile);
    });

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
 * Complete audio processing: combine WAV files and convert to MP3
 */
export async function processAudioFiles(inputFiles: string[], outputMp3File: string): Promise<void> {
  const tempWavFile = outputMp3File.replace('.mp3', '_temp.wav');
  
  try {
    // Step 1: Combine WAV files
    await combineWavFiles(inputFiles, tempWavFile);
    
    // Step 2: Convert to MP3
    await convertWavToMp3(tempWavFile, outputMp3File);
    
    // Step 3: Clean up temporary WAV file
    await fs.unlink(tempWavFile);
    console.log(`✓ Cleaned up temporary file: ${tempWavFile}`);
    
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
