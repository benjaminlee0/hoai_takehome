import 'server-only';
import { and, asc, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { generateUUID } from '@/lib/utils';

import {
  chat,
  document,
  type Suggestion,
  suggestion,
  type Message,
  message,
  vote,
  invoice,
  invoiceLineItem,
  type Invoice,
  type InvoiceLineItem,
} from './schema';
import type { BlockKind } from '@/components/block';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      // userId,
      title,
    });
  } catch (error) {
    console.error('Failed to save chat in database');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(chat)
      // .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
  createdAt = new Date(),
}: {
  id: string;
  title: string;
  kind: BlockKind;
  content: string;
  userId: string;
  createdAt?: Date;
}) {
  try {
    return await db.insert(document).values({
      id,
      title,
      kind,
      content,
      // userId,
      createdAt,
    });
  } catch (error) {
    console.error('Failed to save document in database');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

interface SaveInvoiceProps {
  id: string;
  documentId: string;
  vendorName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  currency: string;
  lineItems: Array<Omit<InvoiceLineItem, 'id' | 'invoiceId'>>;
  lastEditedBy?: string;
}

export async function saveInvoice({
  id,
  documentId,
  vendorName,
  customerName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  totalAmount,
  currency,
  lineItems,
  lastEditedBy,
}: SaveInvoiceProps) {
  const now = new Date();
  
  try {
    console.log('Saving invoice:', {
      id,
      vendorName,
      customerName,
      invoiceNumber,
      totalAmount,
      currency
    });

    // Save invoice first
    db.insert(invoice).values({
      id,
      documentId,
      vendorName,
      customerName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      totalAmount,
      currency,
      createdAt: now,
      updatedAt: now,
      lastEditedBy,
    }).run();

    console.log('Successfully saved invoice with ID:', id);

    // Save line items
    lineItems.forEach((item) =>
      db.insert(invoiceLineItem).values({
        id: generateUUID(),
        invoiceId: id,
        ...item,
      }).run()
    );

    console.log('Successfully saved line items');

    // Verify the invoice was saved
    const savedInvoice = db
      .select()
      .from(invoice)
      .where(eq(invoice.id, id))
      .get();
    
    console.log('Verification - saved invoice:', savedInvoice);

    if (!savedInvoice) {
      throw new Error('Invoice was not saved successfully');
    }

    return savedInvoice;
  } catch (error) {
    console.error('Error saving invoice:', error);
    throw error;
  }
}

interface UpdateInvoiceProps {
  id: string;
  vendorName?: string;
  customerName?: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  dueDate?: Date;
  totalAmount?: number;
  currency?: string;
  lineItems?: Array<Omit<InvoiceLineItem, 'id' | 'invoiceId'>>;
  lastEditedBy?: string;
}

export async function updateInvoice({
  id,
  vendorName,
  customerName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  totalAmount,
  currency,
  lineItems,
  lastEditedBy,
}: UpdateInvoiceProps) {
  const now = new Date();

  db.transaction(() => {
    // Update invoice
    db.update(invoice)
      .set({
        ...(vendorName && { vendorName }),
        ...(customerName && { customerName }),
        ...(invoiceNumber && { invoiceNumber }),
        ...(invoiceDate && { invoiceDate }),
        ...(dueDate && { dueDate }),
        ...(totalAmount && { totalAmount }),
        ...(currency && { currency }),
        ...(lastEditedBy && { lastEditedBy }),
        updatedAt: now,
      })
      .where(eq(invoice.id, id))
      .run();

    // If line items provided, replace them
    if (lineItems) {
      db.delete(invoiceLineItem)
        .where(eq(invoiceLineItem.invoiceId, id))
        .run();
      
      lineItems.forEach((item) =>
        db.insert(invoiceLineItem)
          .values({
            id: generateUUID(),
            invoiceId: id,
            ...item,
          })
          .run()
      );
    }
  });
}

interface GetInvoicesProps {
  sortBy?: 'invoiceDate' | 'totalAmount' | 'vendorName';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function getInvoicesCount() {
  try {
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(invoice)
      .get();
    
    return result?.count || 0;
  } catch (error) {
    console.error('Error getting invoice count:', error);
    return 0;
  }
}

export async function getInvoices({
  sortBy = 'invoiceDate',
  sortOrder = 'desc',
  limit = 50,
  offset = 0,
}: GetInvoicesProps = {}) {
  try {
    console.log('Fetching invoices with params:', { sortBy, sortOrder, limit, offset });
    
    const query = db
      .select()
      .from(invoice)
      .limit(limit)
      .offset(offset);

    // Add sorting
    if (sortOrder === 'desc') {
      query.orderBy(desc(invoice[sortBy]));
    } else {
      query.orderBy(asc(invoice[sortBy]));
    }

    const results = query.all();
    console.log('Found invoices:', results.length);
    console.log('Invoice IDs:', results.map(r => r.id));
    
    return results;
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw error;
  }
}

export async function getInvoiceById(id: string) {
  const [foundInvoice] = await db
    .select()
    .from(invoice)
    .where(eq(invoice.id, id));

  if (!foundInvoice) return null;

  const lineItems = await db
    .select()
    .from(invoiceLineItem)
    .where(eq(invoiceLineItem.invoiceId, id));

  return {
    ...foundInvoice,
    lineItems,
  };
}

export async function deleteInvoiceById(id: string) {
  await db.transaction(async (tx) => {
    await tx.delete(invoiceLineItem).where(eq(invoiceLineItem.invoiceId, id));
    await tx.delete(invoice).where(eq(invoice.id, id));
  });
}
