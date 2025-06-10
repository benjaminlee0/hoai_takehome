import { createWorker } from 'tesseract.js';
import type { Worker as TesseractWorker } from 'tesseract.js';
import { Attachment, Message } from '@/lib/types';
import { ProcessedAttachment, AttachmentType } from './types';
import { generateUUID } from '@/lib/utils';
import { saveDocument } from '@/lib/db/queries';
import path from 'path';
import tesseract from 'node-tesseract-ocr';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import sharp from 'sharp';
import zlib from 'zlib';

// Get the absolute path to the Tesseract worker script
const TESSERACT_WORKER_PATH = path.resolve(process.cwd(), 'node_modules/tesseract.js-worker/dist/worker.min.js');

// Helper function to estimate tokens (1 token ≈ 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

/**
 * Extract content from an attachment's various possible content fields
 */
function getAttachmentContent(att: Attachment): Buffer {
  try {
    // Handle Buffer or ArrayBufferView content
    if (att.content) {
      if (Buffer.isBuffer(att.content)) {
        return att.content;
      }
      if (ArrayBuffer.isView(att.content)) {
        return Buffer.from(att.content.buffer, att.content.byteOffset, att.content.byteLength);
      }
      if (typeof att.content === 'string') {
        // Handle data URL format
        if (att.content.startsWith('data:')) {
          const base64Data = att.content.split(',')[1];
          return Buffer.from(base64Data, 'base64');
        }
        // Handle raw base64
        if (att.content.includes('base64,')) {
        return Buffer.from(att.content.split('base64,')[1], 'base64');
      }
        // Try to decode as base64 directly
        try {
          return Buffer.from(att.content, 'base64');
        } catch (e) {
          // If not base64, use as-is
          return Buffer.from(att.content);
        }
      }
    }

    // Handle URL with data URL format
    if (att.url && att.url.startsWith('data:')) {
      const base64Data = att.url.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    // Handle URL with base64 data
    if (att.url && att.url.includes('base64,')) {
      return Buffer.from(att.url.split('base64,')[1], 'base64');
    }

    throw new Error(`Could not extract content from attachment: ${att.name || 'unnamed'}`);
  } catch (error) {
    console.error('Error extracting content:', error);
    throw new Error(`Failed to process attachment content: ${att.name || 'unnamed'}`);
  }
}

/**
 * Extract image from PDF using pdf2pic
 */
async function extractImageFromPdf(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    console.log('Starting PDF image extraction with pdf2pic...');
    
    // Create temp file to save PDF buffer
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `temp-${Date.now()}.pdf`);
    const tempOutputDir = path.join(tempDir, `output-${Date.now()}`);
    
    // Ensure output directory exists
    await fs.mkdir(tempOutputDir, { recursive: true });
    
    // Write PDF buffer to temp file
    await fs.writeFile(tempPdfPath, pdfBuffer);
    
    // Configure pdf2pic
    const options = {
      density: 300, // Higher density for better quality
      saveFilename: "page",
      savePath: tempOutputDir,
      format: "png",
      width: 2048, // Larger width for better quality
      height: 2048 // Larger height for better quality
    };
    
    try {
      const { fromPath } = require('pdf2pic');
      const convert = fromPath(tempPdfPath, options);
      
      // Convert first page
      const result = await convert(1, { responseType: "image" });
      console.log('pdf2pic conversion result:', result);
      
      if (result && result.path) {
        // Read the saved image file
        const imageBuffer = await fs.readFile(result.path);
        console.log('Successfully extracted image from PDF');
        return imageBuffer;
      }
      
      console.log('No image data in conversion result');
      return null;
    } finally {
      // Clean up temp files
      try {
        await fs.unlink(tempPdfPath);
        await fs.rm(tempOutputDir, { recursive: true, force: true });
      } catch (error) {
        console.error('Error cleaning up temp files:', error);
      }
    }
  } catch (error) {
    console.error('Error extracting image from PDF:', error);
    return null;
  }
}

/**
 * Process an image buffer using Tesseract OCR
 */
async function processImageContent(imageBuffer: Buffer, tempFile?: string): Promise<string> {
  // Save buffer to temp file for OCR
  const tempDir = os.tmpdir();
  const tempImagePath = path.join(tempDir, `temp-${Date.now()}.png`);
  await fs.writeFile(tempImagePath, imageBuffer);
  
  try {
    // Configure Tesseract
    const config = {
      lang: 'eng',
      oem: 1,
      psm: 3,
    };

    // Process the image
    const text = await tesseract.recognize(tempImagePath, config);

    if (!text || text.trim().length === 0) {
      throw new Error('No text was extracted from the image');
    }

    return text;
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Could not extract text from image. Please ensure the image is clear and contains readable text.');
  } finally {
    // Clean up temp files
    try {
      await fs.unlink(tempImagePath);
      if (tempFile) {
        await fs.unlink(tempFile);
      }
    } catch (error) {
      console.error('Error deleting temp file:', error);
    }
  }
}

/**
 * Process a PDF buffer and extract its text content
 */
async function processPdfContent(buffer: Buffer): Promise<string> {
  try {
    console.log('Starting PDF processing...');
    // Import pdf-parse dynamically
    const pdfParse = await import('pdf-parse');
    
    // Configure pdf-parse options
    const options = {
      // Max number of pages to parse
      max: 0, // 0 means parse all pages
      // Enable PDF metadata extraction
      metadata: true,
      // Page rendering timeout in milliseconds
      pagerender: function(pageData: any) {
        // Return text content from page
        return pageData.getTextContent().then(function(textContent: any) {
          let lastY, text = '';
          for (const item of textContent.items) {
            if (lastY == item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          return text;
        });
      }
    };

    // First try to extract text directly
    console.log('Attempting direct text extraction from PDF...');
    const data = await pdfParse.default(buffer, options);

    if (!data || typeof data.text !== 'string') {
      console.log('Invalid PDF content structure');
      throw new Error('Invalid PDF content structure');
    }

    const text = data.text.trim();
    if (!text) {
      // If no text was extracted, this might be a scanned PDF
      console.log('No text found in PDF, attempting to extract embedded image...');
      const imageBuffer = await extractImageFromPdf(buffer);
      
      if (imageBuffer) {
        console.log('Found embedded image in PDF, attempting OCR...');
        return await processImageContent(imageBuffer);
      }
      
      // If no embedded image found, try OCR on the PDF buffer directly
      console.log('No embedded image found, attempting OCR on PDF directly...');
      return await processImageContent(buffer);
    }

    console.log(`Successfully extracted text from PDF (${text.length} characters)`);
    return text;
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    // Log more detailed error information
    if (error.message) {
      console.error('PDF Error details:', error.message);
    }
    if (error.name) {
      console.error('PDF Error type:', error.name);
  }
    
    try {
      // If PDF parsing failed, try extracting embedded image first
      console.log('PDF parsing failed, attempting to extract embedded image...');
      const imageBuffer = await extractImageFromPdf(buffer);
      
      if (imageBuffer) {
        console.log('Found embedded image in PDF, attempting OCR...');
        return await processImageContent(imageBuffer);
      }
      
      // If no embedded image found, try OCR on the PDF buffer directly
      console.log('No embedded image found, attempting OCR on PDF directly...');
      return await processImageContent(buffer);
    } catch (ocrError: any) {
      console.error('OCR fallback failed:', ocrError);
      if (error.message && error.message.includes('Failed to load PDF')) {
        throw new Error('Failed to load PDF. The file might be corrupted or password protected.');
      }
      throw new Error('Could not extract text from PDF. Please ensure the file is a valid PDF with text content.');
    }
  }
}

/**
 * Determine if we should process this as an invoice based on user message
 */
function shouldProcessInvoice(message: Message): boolean {
  const text = String(message.content).toLowerCase();
  return text.includes('invoice') || 
         text.includes('bill') || 
         text.includes('receipt') ||
         text.includes('process this');
}

/**
 * Get the attachment type based on content type
 */
function getAttachmentType(contentType: string): AttachmentType {
  const type = contentType.toLowerCase();
  
  if (type.includes('pdf')) {
    return 'pdf';
  }
  if (type.includes('image')) {
    return 'image';
  }
  if (type.includes('text')) {
    return 'text';
  }
  return 'unknown';
}

/**
 * Save the processed document to the database
 */
export async function saveProcessedDocument(attachment: ProcessedAttachment, userId: string): Promise<{ id: string; createdAt: Date } | null> {
  try {
    // Only save if shouldSaveDocument is true
    if (!attachment.shouldSaveDocument) {
      return null;
    }
    const createdAt = new Date();
    await saveDocument({
      id: attachment.id,
      title: attachment.name || 'Untitled Document',
      kind: 'text',
      content: attachment.content,
      userId: userId,
      createdAt
    });

    return { id: attachment.id, createdAt };
  } catch (error) {
    console.error('Error saving document:', error);
    throw new Error('Failed to save document to database');
  }
}

async function extractContent(buffer: Buffer, type: AttachmentType): Promise<string> {
  switch (type) {
    case 'pdf':
      return await processPdfContent(buffer);
    case 'image':
      return await processImageContent(buffer);
    case 'text':
      return buffer.toString('utf-8');
    default:
      throw new Error(`Unsupported file type: ${type}`);
  }
}

/**
 * Process attachments and extract their content
 */
export async function processAttachments(
  attachments: Attachment[], 
  userMessage: Message
): Promise<ProcessedAttachment[]> {
  const isInvoiceRequested = shouldProcessInvoice(userMessage);
  
  // Process attachments normally
  const processedAttachments = await Promise.all(
    attachments.map(async (att): Promise<ProcessedAttachment> => {
        const buffer = getAttachmentContent(att);
        const type = getAttachmentType(att.contentType);
      const content = await extractContent(buffer, type);

      const processedAttachment = {
          id: att.id || generateUUID(),
          name: att.name || 'Untitled',
          contentType: att.contentType,
          type,
          content,
        isExtractionNeeded: type === 'invoice',
        shouldSaveDocument: isInvoiceRequested,
        usedCache: false // Track if we used cached prompt
      };

      return processedAttachment;
    })
  );

  return processedAttachments;
} 