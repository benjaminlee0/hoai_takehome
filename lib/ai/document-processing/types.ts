export type DocumentType = 'invoice' | 'image' | 'pdf';
export type AttachmentType = 'invoice' | 'image' | 'pdf' | 'text' | 'unknown';

export interface ProcessedAttachment {
  id: string;
  name: string;
  contentType: string;
  type: AttachmentType;
  content: string;
  isExtractionNeeded: boolean;
  shouldSaveDocument: boolean;
}

export interface ExtractedInvoiceData {
  id: string;
  documentId: string;
  vendorName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  lineItems: InvoiceLineItem[];
  createdAt: Date;
  updatedAt: Date;
  lastEditedBy?: string;
  status: 'pending' | 'verified' | 'needs_review';
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
} 