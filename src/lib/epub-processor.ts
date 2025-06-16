import { readFile } from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

interface ChapterData {
  number: number;
  title: string;
  text: string;
}

export class EpubProcessor {
  private zip: JSZip | null = null;
  private opfPath: string = '';
  private basePath: string = '';
  async loadEpub(filePath: string): Promise<void> {
    console.log(`Loading EPUB from: ${filePath}`);
    const epubBuffer = await readFile(filePath);
    console.log(`Read EPUB buffer, size: ${epubBuffer.length} bytes`);
    this.zip = await JSZip.loadAsync(epubBuffer);
    console.log(`EPUB ZIP loaded successfully`);
  }

  private async findOpfFile(): Promise<string> {
    const containerFile = this.zip!.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('Invalid EPUB: container.xml not found');
    }

    const containerContent = await containerFile.async('text');
    const dom = new JSDOM(containerContent, { contentType: 'text/xml' });
    const rootfileElement = dom.window.document.querySelector('rootfile');
    
    if (!rootfileElement) {
      throw new Error('Invalid EPUB: rootfile not found in container.xml');
    }

    return rootfileElement.getAttribute('full-path') || '';
  }

  private async parseOpf(): Promise<{ spine: string[], manifest: Map<string, string> }> {
    this.opfPath = await this.findOpfFile();
    this.basePath = path.dirname(this.opfPath);

    const opfFile = this.zip!.file(this.opfPath);
    if (!opfFile) {
      throw new Error('OPF file not found');
    }

    const opfContent = await opfFile.async('text');
    const dom = new JSDOM(opfContent, { contentType: 'text/xml' });
    const doc = dom.window.document;    // Parse manifest
    const manifest = new Map<string, string>();
    const manifestItems = doc.querySelectorAll('manifest item');
    manifestItems.forEach((item: Element) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) {
        manifest.set(id, href);
      }
    });

    // Parse spine
    const spine: string[] = [];
    const spineItems = doc.querySelectorAll('spine itemref');
    spineItems.forEach((item: Element) => {
      const idref = item.getAttribute('idref');
      if (idref) {
        spine.push(idref);
      }
    });

    return { spine, manifest };
  }

  private async extractTextFromHtml(htmlContent: string): Promise<string> {
    const dom = new JSDOM(htmlContent);
    const body = dom.window.document.body;
    
    if (!body) {
      return '';
    }    // Remove script and style elements
    const scripts = body.querySelectorAll('script, style');
    scripts.forEach((el: Element) => el.remove());

    // Get text content and clean it up
    let text = body.textContent || '';
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  private extractTitleFromHtml(htmlContent: string): string {
    const dom = new JSDOM(htmlContent);
    
    // Try to find a title in various ways
    const titleSelectors = [
      'h1', 'h2', 'h3', '.title', '.chapter-title', 
      'title', '[class*="title"]', '[class*="chapter"]'
    ];

    for (const selector of titleSelectors) {
      const element = dom.window.document.querySelector(selector);
      if (element && element.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    // If no title found, try to extract from the beginning of the text
    const body = dom.window.document.body;
    if (body) {
      const firstParagraph = body.querySelector('p');
      if (firstParagraph && firstParagraph.textContent) {
        const text = firstParagraph.textContent.trim();
        if (text.length > 0 && text.length < 100) {
          return text;
        }
      }
    }

    return '';
  }
  async extractChapters(): Promise<ChapterData[]> {
    console.log(`Starting chapter extraction`);
    
    if (!this.zip) {
      throw new Error('EPUB not loaded');
    }    const { spine, manifest } = await this.parseOpf();
    console.log(`Found ${spine.length} spine items and ${manifest.size} manifest items`);
    console.log(`Base path from OPF: "${this.basePath}"`);
    
    // Debug: List some files in the ZIP
    const zipFiles = Object.keys(this.zip.files);
    console.log(`ZIP contains ${zipFiles.length} files. Sample files:`, zipFiles.slice(0, 15));
    
    const chapters: ChapterData[] = [];

    for (let i = 0; i < spine.length; i++) {
      const itemId = spine[i];
      const href = manifest.get(itemId);
      
      console.log(`Processing spine item ${i + 1}/${spine.length}: ${itemId} -> ${href}`);
      
      if (!href) {
        console.log(`No href found for item ${itemId}`);
        continue;
      }      // Try different path combinations to find the file
      let file = null;
      let actualPath = '';
      
      // Try various path combinations
      const pathsToTry = [
        href, // Direct href
        this.basePath ? `${this.basePath}/${href}` : href, // With base path
        href.replace(/^\.\//, ''), // Remove leading ./
        this.basePath ? `${this.basePath}/${href.replace(/^\.\//, '')}` : href.replace(/^\.\//, ''), // Base path without ./
      ];
      
      for (const tryPath of pathsToTry) {
        file = this.zip.file(tryPath);
        if (file) {
          actualPath = tryPath;
          break;
        }
      }
      
      if (!file) {
        console.log(`File not found in ZIP with any of these paths: ${pathsToTry.join(', ')}`);
        // Let's also log what files are actually in the ZIP for debugging
        const zipFiles = Object.keys(this.zip.files).slice(0, 10); // First 10 files
        console.log(`Sample ZIP contents: ${zipFiles.join(', ')}`);
        continue;
      }
      
      console.log(`Found file at path: ${actualPath}`);

      try {
        const htmlContent = await file.async('text');
        const text = await this.extractTextFromHtml(htmlContent);
        
        console.log(`Extracted text from ${href}: ${text.length} characters`);
        
        // Skip if no meaningful text content
        if (text.length < 50) {
          console.log(`Skipping short content: ${text.length} characters`);
          continue;
        }

        const title = this.extractTitleFromHtml(htmlContent);
        
        const chapter = {
          number: chapters.length + 1,
          title: title || `Chapter ${chapters.length + 1}`,
          text: text
        };
        
        chapters.push(chapter);
        console.log(`Added chapter: ${chapter.title}`);
      } catch (error) {
        console.error(`Error processing chapter ${i + 1}:`, error);
      }
    }

    console.log(`Chapter extraction completed. Found ${chapters.length} chapters.`);
    return chapters;
  }
}

export async function processEpubFile(filePath: string): Promise<ChapterData[]> {
  console.log(`Starting EPUB processing for file: ${filePath}`);
  
  try {
    // Check if file exists
    const fs = await import('fs/promises');
    await fs.access(filePath);
    console.log(`File exists: ${filePath}`);
  } catch (error) {
    console.error(`File does not exist: ${filePath}`, error);
    throw new Error(`File not found: ${filePath}`);
  }

  const processor = new EpubProcessor();
  await processor.loadEpub(filePath);
  const chapters = await processor.extractChapters();
  
  console.log(`EPUB processing completed. Extracted ${chapters.length} chapters.`);
  return chapters;
}
