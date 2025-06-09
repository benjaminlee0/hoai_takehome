import { DocumentAIService } from './document-ai.service';
import { validateDocumentAIEnv } from '../config/validate-env';
import { ExtractedInvoiceData } from '../types/document-ai';
import { DOCUMENT_AI_ENTITIES } from '../constants/document-ai-schema';

export class InvoiceExtractionService {
  private documentAI: DocumentAIService | null = null;
  private initializationError: Error | null = null;

  private getDocumentAI(): DocumentAIService {
    if (this.initializationError) {
      throw this.initializationError;
    }

    try {
      if (!this.documentAI) {
        console.log('Initializing Document AI service...');
        const config = validateDocumentAIEnv();
        console.log('Document AI config validated:', {
          projectId: config.projectId,
          location: config.location,
          processorId: config.processorId
        });
        this.documentAI = new DocumentAIService(config);
      }
      return this.documentAI;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error initializing Document AI');
      console.error('Failed to initialize Document AI:', err);
      this.initializationError = err;
      throw err;
    }
  }

  /**
   * Extract invoice data from a document using Document AI
   */
  async extractInvoiceData(buffer: Buffer, mimeType: string): Promise<ExtractedInvoiceData> {
    try {
      console.log('Starting Document AI processing...');
      const docAI = this.getDocumentAI();
      
      console.log('Processing document with mime type:', mimeType);
      const processedDoc = await docAI.processDocument(buffer, mimeType);
      
      if (!processedDoc.text) {
        throw new Error('Document AI returned empty text content');
      }
      
      console.log('Document processed, extracting invoice data...');
      const extractedData = await docAI.extractInvoiceData(processedDoc);
      
      // Validate extracted data
      if (!extractedData.vendorName || !extractedData.invoiceNumber) {
        throw new Error(`Failed to extract required invoice fields (${DOCUMENT_AI_ENTITIES.VENDOR_NAME} or ${DOCUMENT_AI_ENTITIES.INVOICE_NUMBER})`);
      }
      
      // Check line items using the properly typed key
      if (!extractedData['line-items'] || extractedData['line-items'].length === 0) {
        throw new Error(`No ${DOCUMENT_AI_ENTITIES.LINE_ITEMS.DESCRIPTION.split('/')[0]} extracted from invoice`);
      }
      
      console.log('Successfully extracted invoice data:', {
        vendor: extractedData.vendorName,
        invoice: extractedData.invoiceNumber,
        lineItems: extractedData['line-items'].length
      });
      
      return extractedData;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error in invoice extraction');
      console.error('Failed to extract invoice data:', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }
} 