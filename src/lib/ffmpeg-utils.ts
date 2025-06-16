// Alternative FFmpeg utility that uses system-installed FFmpeg
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Alternative function to combine audio files using system FFmpeg
 * Requires FFmpeg to be installed on the system
 */
export async function combineAudioFilesSystem(chunkFiles: string[], outputFile: string): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('combineAudioFilesSystem can only be used on the server side');
  }

  try {
    console.log(`Starting audio combination with ${chunkFiles.length} files:`, chunkFiles);
    
    // Get current working directory to ensure absolute paths
    const process = await import('process');
    const cwd = process.cwd();
    console.log(`Current working directory: ${cwd}`);
    
    // Check if all input files exist
    const fs = await import('fs/promises');
    for (const file of chunkFiles) {
      try {
        const filePath = file.includes('public') ? file : path.join('public/uploads', file);
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
        await fs.access(absolutePath);
        const stats = await fs.stat(absolutePath);
        console.log(`✓ Found file: ${absolutePath} (${stats.size} bytes)`);
      } catch (error) {
        console.error(`✗ Missing file: ${file}`);
        throw new Error(`Input file not found: ${file}`);
      }
    }
    
    // Create input list for FFmpeg
    const inputList = chunkFiles
      .map(file => {
        // If file already contains the full path, use it as is
        // Otherwise, prepend public/uploads/
        const filePath = file.includes('public') ? file : path.join('public/uploads', file);
        // Create absolute path and normalize separators for Windows/FFmpeg compatibility
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
        const normalizedPath = absolutePath.replace(/\\/g, '/');
        return `file '${normalizedPath}'`;
      })
      .join('\n');
    
    console.log(`FFmpeg input list:\n${inputList}`);
    
    // Write input list to temporary file
    const listFile = path.join(cwd, 'public/uploads', 'input_list.txt');
    await fs.writeFile(listFile, inputList);
    console.log(`Written input list to: ${listFile}`);

    // Use FFmpeg concat demuxer to combine files
    // Create absolute path for output file and normalize separators
    const absoluteOutputFile = path.isAbsolute(outputFile) ? outputFile : path.join(cwd, outputFile);
    const normalizedListFile = listFile.replace(/\\/g, '/');
    const normalizedOutputFile = absoluteOutputFile.replace(/\\/g, '/');
    const command = `ffmpeg -f concat -safe 0 -i "${normalizedListFile}" -c copy "${normalizedOutputFile}"`;
    
    console.log(`Running FFmpeg command: ${command}`);
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.log(`FFmpeg stderr: ${stderr}`);
    }
    if (stdout) {
      console.log(`FFmpeg stdout: ${stdout}`);
    }
    
    // Verify output file was created
    try {
      const outputStats = await fs.stat(absoluteOutputFile);
      console.log(`✓ Output file created: ${absoluteOutputFile} (${outputStats.size} bytes)`);
    } catch (error) {
      throw new Error(`Output file was not created: ${absoluteOutputFile}`);
    }
    
    // Clean up temporary file
    await fs.unlink(listFile);
    console.log(`✓ Cleaned up input list file`);  } catch (error) {
    console.error('Error combining audio files with system FFmpeg:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to combine audio files: ${errorMessage}`);
  }
}

/**
 * Check if system FFmpeg is available
 */
export async function checkSystemFFmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Simple fallback method to combine audio files using FFmpeg filter_complex
 * Used when the concat demuxer fails
 */
export async function combineAudioFilesSimple(chunkFiles: string[], outputFile: string): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('combineAudioFilesSimple can only be used on the server side');
  }

  try {
    console.log(`Using simple audio combination method for ${chunkFiles.length} files`);
    
    const process = await import('process');
    const cwd = process.cwd();
    
    // Verify all input files exist
    const fs = await import('fs/promises');
    const inputFiles = [];
    
    for (const file of chunkFiles) {
      const filePath = file.includes('public') ? file : path.join('public/uploads', file);
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
      
      try {
        await fs.access(absolutePath);
        inputFiles.push(absolutePath.replace(/\\/g, '/'));
      } catch (error) {
        console.error(`Skipping missing file: ${file}`);
      }
    }
    
    if (inputFiles.length === 0) {
      throw new Error('No valid input files found');
    }
    
    // Use simple concatenation with FFmpeg
    const absoluteOutputFile = path.isAbsolute(outputFile) ? outputFile : path.join(cwd, outputFile);
    const normalizedOutputFile = absoluteOutputFile.replace(/\\/g, '/');
    
    let command;
    if (inputFiles.length === 1) {
      // Single file, just copy
      command = `ffmpeg -i "${inputFiles[0]}" -c copy "${normalizedOutputFile}"`;
    } else {
      // Multiple files, use filter_complex
      const inputs = inputFiles.map((file, i) => `-i "${file}"`).join(' ');
      const filter = `concat=n=${inputFiles.length}:v=0:a=1[out]`;
      command = `ffmpeg ${inputs} -filter_complex "${filter}" -map "[out]" "${normalizedOutputFile}"`;
    }
    
    console.log(`Running simple FFmpeg command: ${command}`);
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) console.log(`FFmpeg stderr: ${stderr}`);
    if (stdout) console.log(`FFmpeg stdout: ${stdout}`);
    
    // Verify output
    const outputStats = await fs.stat(absoluteOutputFile);
    console.log(`✓ Simple combination created: ${absoluteOutputFile} (${outputStats.size} bytes)`);
    
  } catch (error) {
    console.error('Error in simple audio combination:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Simple audio combination failed: ${errorMessage}`);
  }
}
