import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

export interface DocumentAIConfig {
  projectId: string;
  location: string;
  processorId: string;
}

export interface DocumentAIProperty {
  type: string;
  mentionText: string;
  confidence: number;
}

export interface DocumentAIEntity {
  type: string;
  mentionText: string;
  confidence: number;
  properties?: DocumentAIProperty[];
  pageAnchor?: {
    pageRefs: Array<{
      page: string;
      boundingBox?: {
        normalizedVertices: Array<{
          x: number;
          y: number;
        }>;
      };
    }>;
  };
}

export interface ProcessedDocument {
  text: string;
  entities: DocumentAIEntity[];
}

export interface ParsedLineItem {
  amount?: string;
  unitPrice?: string;
  total?: string;
  description?: string;
  position?: string;
  quantity?: string;
}

export interface ExtractedInvoiceData {
  vendorName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  totalTaxAmount: number;
  currency?: string;
  'line-items': Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    position: number;
  }>;
  'vat': Array<{
    amount: number;
    categoryCode: string;
    taxAmount: number;
    taxRate: number;
  }>;
}

export interface DocumentAIServiceInterface {
  processDocument(documentContent: Buffer): Promise<ProcessedDocument>;
  extractInvoiceData(document: ProcessedDocument): Promise<ExtractedInvoiceData>;
} 