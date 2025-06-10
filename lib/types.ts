import { type Message as AIMessage } from 'ai';

export type Role = AIMessage['role'];

export interface Message extends Omit<AIMessage, 'role'> {
  id: string;
  role: Role;
  createdAt?: Date;
  chatId?: string;
  documentId?: string;
  documentCreatedAt?: Date;
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
  documentId: string | null;
  documentCreatedAt: number | null;
  vendorName: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: number;  // Unix timestamp in seconds
  dueDate: number;  // Unix timestamp in seconds
  totalAmount: number;  // Stored in cents
  currency: string;  // Has default 'USD' in database
  createdAt: number;  // Unix timestamp in seconds
  updatedAt?: number;  // Unix timestamp in seconds
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

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  result: any;
}

export type MessageContent = Array<TextPart | ToolCallPart | ToolResultPart>;