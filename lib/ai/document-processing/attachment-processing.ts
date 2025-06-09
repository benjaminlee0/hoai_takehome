import { createWorker } from 'tesseract.js';
import { Attachment, Message } from '@/lib/types';
import { ProcessedAttachment, AttachmentType } from './types';
import { generateUUID } from '@/lib/utils';
import { saveDocument } from '@/lib/db/queries';

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
      if (typeof att.content === 'string' && att.content.includes('base64,')) {
        return Buffer.from(att.content.split('base64,')[1], 'base64');
      }
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
 * Process a PDF buffer and extract its text content
 */
async function processPdfContent(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer, {
      max: 0, // No page limit
      pagerender: undefined, // Use default renderer
      version: 'v1.10.100' // Use a stable version
    });

    if (!data || typeof data.text !== 'string') {
      throw new Error('Invalid PDF content structure');
    }

    const text = data.text.trim();
    if (!text) {
      throw new Error('PDF content is empty');
    }

    return text;
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw new Error('Could not extract text from PDF. Please ensure the file is a valid PDF with text content.');
  }
}

/**
 * Process an image buffer using Tesseract OCR
 */
async function processImageContent(buffer: Buffer): Promise<string> {
  try {
    const worker = await createWorker('eng');
    
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();

    const cleanedText = text.trim();
    if (!cleanedText) {
      throw new Error('No text could be extracted from the image');
    }

    return cleanedText;
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Could not extract text from image. Please ensure the image is clear and contains readable text.');
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
export async function saveProcessedDocument(attachment: ProcessedAttachment, userId: string): Promise<string> {
  try {
    // Only save if shouldSaveDocument is true
    if (!attachment.shouldSaveDocument) {
      return attachment.id;
    }

    await saveDocument({
      id: attachment.id,
      title: attachment.name || 'Untitled Document',
      kind: 'text',
      content: attachment.content,
      userId: userId,
      createdAt: new Date()
    });
    return attachment.id;
  } catch (error) {
    console.error('Error saving document:', error);
    throw new Error('Failed to save document to database');
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
  
  const processedAttachments = await Promise.all(
    attachments.map(async (att): Promise<ProcessedAttachment> => {
      try {
        console.log('Processing attachment:', {
          name: att.name,
          contentType: att.contentType,
          hasContent: !!att.content,
          hasUrl: !!att.url
        });

        const buffer = getAttachmentContent(att);
        const type = getAttachmentType(att.contentType);
        
        let content = '';
        
        switch (type) {
          case 'pdf':
            content = await processPdfContent(buffer);
            break;
          case 'image':
            content = await processImageContent(buffer);
            break;
          case 'text':
            content = buffer.toString('utf-8');
            break;
          default:
            throw new Error(`Unsupported file type: ${att.contentType}`);
        }

        return {
          id: att.id || generateUUID(),
          name: att.name || 'Untitled',
          contentType: att.contentType,
          type,
          content,
          isExtractionNeeded: isInvoiceRequested,
          shouldSaveDocument: isInvoiceRequested
        };
      } catch (error) {
        console.error('Error processing attachment:', error);
        throw error;
      }
    })
  );

  return processedAttachments;
} 