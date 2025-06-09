import { type DataStreamWriter, tool } from 'ai';
import { type Session } from 'next-auth';
import { saveInvoice, findDuplicateInvoice } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { trackTokenUsage, getCachedPrompt, cachePrompt } from '@/lib/ai/token-tracking';

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});

interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface DbLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface SaveInvoiceToolProps {
  session: Session | null;
  dataStream: DataStreamWriter;
}

// Rough estimate of tokens per character (based on GPT tokenization)
const TOKENS_PER_CHAR = 0.25;

// Function to estimate tokens
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

export function saveExtractedInvoice({ session, dataStream }: SaveInvoiceToolProps) {
  return tool({
    description: 'Save extracted invoice data to the database. First checks for duplicates before proceeding.',
    parameters: z.object({
      vendorName: z.string(),
      customerName: z.string(),
      invoiceNumber: z.string(),
      invoiceDate: z.string(),
      dueDate: z.string(),
      currency: z.string().default('USD'),
      totalAmount: z.number(),
      lineItems: z.array(lineItemSchema),
      documentId: z.string(),
      prompt: z.string().optional(),
    }),
    execute: async ({
      vendorName,
      customerName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      totalAmount,
      lineItems,
      documentId,
      prompt,
    }) => {
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }

      try {
        // Generate invoice ID
        const id = generateUUID();

        // Convert total to cents for duplicate check
        const totalAmountCents = Math.round(totalAmount * 100);

        // Check for duplicate invoice first
        const duplicateInvoice = await findDuplicateInvoice({
          vendorName,
          invoiceNumber,
          totalAmount: totalAmountCents,
        });

        if (duplicateInvoice) {
          return {
            status: 'duplicate',
            invoiceId: duplicateInvoice.id,
            message: `Found duplicate invoice from ${duplicateInvoice.vendorName} with invoice number ${duplicateInvoice.invoiceNumber} and amount ${duplicateInvoice.totalAmount / 100} ${duplicateInvoice.currency}`,
          };
        }

        // Estimate token usage
        const inputText = JSON.stringify({
          vendorName,
          customerName,
          invoiceNumber,
          invoiceDate,
          dueDate,
          currency,
          totalAmount,
          lineItems,
        });
        
        const promptTokens = prompt ? estimateTokens(prompt) : 0;
        const completionTokens = estimateTokens(inputText);
        const totalTokens = promptTokens + completionTokens;

        // Track token usage
        await trackTokenUsage(id, {
          promptTokens,
          completionTokens,
          totalTokens,
        });

        // Cache prompt if provided
        if (prompt) {
          await cachePrompt(prompt, totalTokens);
        }

        // Save invoice with the generated ID
        await saveInvoice({
          id,
          documentId,
          vendorName,
          customerName,
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          dueDate: new Date(dueDate),
          totalAmount: totalAmountCents,
          currency,
          lineItems: lineItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: Math.round(item.unitPrice * 100),
            totalPrice: Math.round(item.total * 100),
          })),
        });

        return {
          status: 'success',
          invoiceId: id,
          message: 'Invoice saved successfully',
        };
      } catch (error) {
        console.error('Error saving invoice:', error);
        throw error;
      }
    },
  });
} 