import { ProcessedAttachment, AttachmentType, DocumentType } from './types';
import { generateUUID } from '@/lib/utils';
import { saveDocument } from '@/lib/db/queries';
import { Message } from 'ai';
import { InvoiceVerificationService } from '../services/invoice-verification.service';
import { InvoiceExtractionService } from '../services/invoice-extraction.service';

// Initialize services lazily
let invoiceVerification: InvoiceVerificationService | null = null;
let invoiceExtraction: InvoiceExtractionService | null = null;

function getInvoiceVerification(): InvoiceVerificationService {
  if (!invoiceVerification) {
    invoiceVerification = new InvoiceVerificationService();
  }
  return invoiceVerification;
}

function getInvoiceExtraction(): InvoiceExtractionService {
  if (!invoiceExtraction) {
    invoiceExtraction = new InvoiceExtractionService();
  }
  return invoiceExtraction;
}

function getDocumentKind(type: DocumentType): "text" | "code" | "sheet" | "image" {
  return type === 'pdf' ? 'text' : 'image';
}

/**
 * Process attachments and extract their content
 */
export async function processAttachments(attachments: any[], userMessage: Message): Promise<ProcessedAttachment[]> {
  const processedAttachments = await Promise.all(
    attachments.map(async (att): Promise<ProcessedAttachment | null> => {
      try {
        const base64 = att.url.split(',')[1];
        const buffer = Buffer.from(base64, 'base64');
        
        if (att.contentType === 'application/pdf' || att.contentType.startsWith('image/')) {
          const documentType: DocumentType = att.contentType === 'application/pdf' ? 'pdf' : 'image';
          
          // First get the raw text content
          let textContent = '';
          if (documentType === 'pdf') {
            const pdf = (await import('pdf-parse')).default;
            const data = await pdf(buffer);
            textContent = data.text.trim();
            
            // Clean up the text content
            textContent = textContent
              .replace(/\r\n/g, '\n') // Normalize line endings
              .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
              .replace(/\s+/g, ' ') // Normalize whitespace
              .trim();
              
            // Only log a preview to avoid polluting the stream
            if (textContent) {
              const preview = textContent.substring(0, 200);
              console.log('Extracted text preview:', preview + (textContent.length > 200 ? '...' : ''));
            }
          }

          // Create base document with type and content
          const baseDocument: ProcessedAttachment = {
            type: documentType,
            content: textContent || att.url,
            originalType: att.contentType as AttachmentType
          };

          // Only proceed with non-empty content
          if (!textContent) {
            return {
              ...baseDocument,
              error: 'Could not extract text content from document.'
            };
          }

          try {
            // For file uploads, go straight to Document AI processing
            const extractedData = await getInvoiceExtraction().extractInvoiceData(buffer, att.contentType);

            // If we get here, Document AI validation passed
            return {
              ...baseDocument,
              content: textContent, // Keep original text content
              extractedInvoiceData: extractedData
            };
          } catch (docAiError) {
            const errorMessage = docAiError instanceof Error ? docAiError.message : 'Failed to process invoice with Document AI';
            console.error('Document AI processing failed:', {
              error: errorMessage,
              stack: docAiError instanceof Error ? docAiError.stack : undefined
            });
            
            // If Document AI fails, try LLM verification as fallback
            try {
              const shouldProcess = await getInvoiceVerification().verifyInvoice(textContent, userMessage);
              if (!shouldProcess) {
                return {
                  ...baseDocument,
                  error: 'This document is not an invoice or no processing was requested.'
                };
              }
              // If LLM says it's an invoice but Document AI failed, return the error
              return {
                ...baseDocument,
                error: `Document appears to be an invoice but Document AI processing failed: ${errorMessage}`
              };
            } catch (llmError) {
              return {
                ...baseDocument,
                error: errorMessage
              };
            }
          }
        }
        return null;
      } catch (err) {
        console.error('Failed to process attachment:', err);
        return null;
      }
    })
  );

  return processedAttachments.filter((att): att is ProcessedAttachment => att !== null);
}

/**
 * Save a document to the database
 */
export async function saveProcessedDocument(
  document: ProcessedAttachment,
  userId: string,
  filename?: string
) {
  const documentId = generateUUID();
  const title = filename || `${document.type.charAt(0).toUpperCase() + document.type.slice(1)} Document`;
  
  // If we have extracted invoice data, save it as structured content
  const content = document.extractedInvoiceData 
    ? JSON.stringify(document.extractedInvoiceData, null, 2)
    : document.content;

  await saveDocument({
    id: documentId,
    title,
    kind: getDocumentKind(document.type),
    content,
    userId,
    createdAt: new Date()
  });

  return documentId;
} 