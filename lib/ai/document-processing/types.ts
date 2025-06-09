export type AttachmentType = 'application/pdf' | 'image/jpeg' | 'image/png';

export type DocumentType = 'pdf' | 'image';

export interface TableCell {
  content: string;
  rowIndex: number;
  columnIndex: number;
  confidence: number;
}

export interface TableStructure {
  headers: {
    pos: number;
    quantity: number;
    description: number;
    unitPrice: number;
    total: number;
  };
  rows: Array<{
    cells: TableCell[];
    position?: number;
    quantity?: number;
    unitPrice?: number;
    total?: number;
  }>;
}

export interface ProcessedAttachment {
  type: DocumentType;
  content: string;
  originalType: AttachmentType;
  extractedInvoiceData?: ExtractedInvoiceData;
  error?: string;
}

export interface ExtractedInvoiceData {
  vendorName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  currency?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
} 