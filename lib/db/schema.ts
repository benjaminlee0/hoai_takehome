import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  blob,
  foreignKey,
  primaryKey,
  index,
  real,
} from 'drizzle-orm/sqlite-core';
import type { InferSelectModel } from 'drizzle-orm';

export const chat = sqliteTable('Chat', {
  id: text('id').primaryKey().notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  title: text('title').notNull(),
  visibility: text('visibility')
    .notNull()
    .default('private')
    .$type<'public' | 'private'>(),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = sqliteTable('Message', {
  id: text('id').primaryKey().notNull(),
  chatId: text('chatId')
    .notNull()
    .references(() => chat.id),
  role: text('role').notNull(),
  content: blob('content', { mode: 'json' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
});

export type Message = InferSelectModel<typeof message>;

export const vote = sqliteTable(
  'Vote',
  {
    chatId: text('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: text('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: integer('isUpvoted', { mode: 'boolean' }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = sqliteTable(
  'Document',
  {
    id: text('id').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: text('kind')
      .notNull()
      .default('text')
      .$type<'text' | 'code' | 'image' | 'sheet'>(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = sqliteTable(
  'Suggestion',
  {
    id: text('id').notNull(),
    documentId: text('documentId').notNull(),
    documentCreatedAt: integer('documentCreatedAt', {
      mode: 'timestamp',
    }).notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: integer('isResolved', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey(() => ({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    })),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const invoice = sqliteTable('Invoice', {
  id: text('id').primaryKey(),
  documentId: text('documentId'),
  documentCreatedAt: integer('documentCreatedAt', { mode: 'timestamp' }),
  vendorName: text('vendorName'),
  customerName: text('customerName'),
  invoiceNumber: text('invoiceNumber'),
  invoiceDate: integer('invoiceDate', { mode: 'timestamp' }),
  dueDate: integer('dueDate', { mode: 'timestamp' }),
  totalAmount: integer('totalAmount').notNull(), // Stored in cents
  currency: text('currency').default('USD'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => ({
  documentFk: foreignKey({
    columns: [table.documentId, table.documentCreatedAt],
    foreignColumns: [document.id, document.createdAt]
  }).onDelete('cascade')
}));

export type Invoice = {
  id: string;
  documentId: string | null;
  documentCreatedAt: number | null;  // Unix timestamp in seconds
  vendorName: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: number;  // Unix timestamp in seconds
  dueDate: number;  // Unix timestamp in seconds
  totalAmount: number;  // Stored in cents
  currency: string;  // Has default 'USD' in database
  createdAt: number;  // Unix timestamp in seconds
};

export const invoiceLineItem = sqliteTable('InvoiceLineItem', {
  id: text('id').primaryKey(),
  invoiceId: text('invoiceId')
    .references(() => invoice.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unitPrice').notNull(), // Stored in cents
  totalPrice: integer('totalPrice').notNull(), // Stored in cents
});

export type InvoiceLineItem = InferSelectModel<typeof invoiceLineItem>;

export const tokenUsage = sqliteTable('TokenUsage', {
  id: text('id').primaryKey().notNull(),
  invoiceId: text('invoiceId')
    .references(() => invoice.id, { onDelete: 'set null' }),
  promptTokens: integer('promptTokens'),
  completionTokens: integer('completionTokens'),
  totalTokens: integer('totalTokens'),
  estimatedCost: real('estimatedCost'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  totalProcessedInvoices: integer('totalProcessedInvoices'),
});

export const promptCache = sqliteTable('PromptCache', {
  id: text('id').primaryKey().notNull(),
  prompt: text('prompt').notNull(),
  hash: text('hash').notNull(),
  tokenCount: integer('tokenCount').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('lastUsedAt', { mode: 'timestamp' }).notNull(),
  useCount: integer('useCount').notNull().default(1),
});

export type TokenUsage = InferSelectModel<typeof tokenUsage>;
export type PromptCache = InferSelectModel<typeof promptCache>;

export const cachedInvoice = sqliteTable(
  'CachedInvoice',
  {
    id: text('id').primaryKey().notNull(),
    vendorName: text('vendorName').notNull(),
    customerName: text('customerName').notNull(),
    invoiceNumber: text('invoiceNumber').notNull(),
    invoiceDate: integer('invoiceDate', { mode: 'timestamp' }).notNull(),
    dueDate: integer('dueDate', { mode: 'timestamp' }).notNull(),
    totalAmount: integer('totalAmount').notNull(), // Store as cents
    currency: text('currency').notNull().default('USD'),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
    lastEditedBy: text('lastEditedBy'),
  }
);

export const cachedInvoiceLineItem = sqliteTable('CachedInvoiceLineItem', {
  id: text('id').primaryKey().notNull(),
  invoiceId: text('invoiceId')
    .notNull()
    .references(() => cachedInvoice.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unitPrice').notNull(), // Store as cents
  totalPrice: integer('totalPrice').notNull(), // Store as cents
});

export type CachedInvoice = InferSelectModel<typeof cachedInvoice>;
export type CachedInvoiceLineItem = InferSelectModel<typeof cachedInvoiceLineItem>;
