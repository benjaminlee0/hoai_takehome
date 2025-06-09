import { type Message as AIMessage } from 'ai';

export type Role = AIMessage['role'];

export interface Message extends Omit<AIMessage, 'role'> {
  id: string;
  role: Role;
  createdAt?: Date;
  chatId?: string;
  experimental_attachments?: any[];
}

export interface Vote {
  id: string;
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
  createdAt: Date;
}

export interface Chat {
  id: string;
  title: string;
  userId: string;
  visibility: 'private' | 'public';
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  title: string;
  kind: BlockKind;
  content: string;
  userId: string;
  createdAt: Date;
}

export type BlockKind = 'text' | 'image' | 'code' | 'invoice';

export interface Suggestion {
  id: string;
  documentId: string;
  content: string;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  documentId: string;
  vendorName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  lastEditedBy?: string;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Attachment {
  id: string;
  contentType: string;
  content?: string | Buffer | ArrayBufferView;
  name?: string;
  size?: number;
  url?: string;
  data?: string | Buffer | ArrayBufferView;
}