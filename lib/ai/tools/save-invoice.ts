import { type DataStreamWriter, tool } from 'ai';
import { type Session } from 'next-auth';
import { saveInvoice, findDuplicateInvoice, getDocumentById, saveCachedInvoice } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { trackTokenUsage, getCachedPrompt, cachePrompt } from '@/lib/ai/token-tracking';
import { INVOICE_PROCESSING_PROMPT } from '../document-processing/constants';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/models';

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

interface SaveInvoiceToolProps {
  session: Session | null;
  dataStream: DataStreamWriter;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface LLMInvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface LLMInvoiceResponse {
  vendor: string;
  customer: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  total_amount: number;
  line_items: LLMInvoiceLineItem[];
}

// Function to estimate tokens
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

export function saveExtractedInvoice({ session, dataStream }: SaveInvoiceToolProps) {
  return tool({
    description: 'Save extracted invoice data to the database. First checks for duplicates before proceeding.',
    parameters: z.object({
      documentId: z.string(),
      documentText: z.string(),
    }),
    execute: async ({ documentId, documentText }) => {
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }

      try {
        console.log('Starting invoice processing with document text length:', documentText.length);
        
        // First validate and extract data using LLM
        let extractedText = '';
        console.log('Calling LLM with chat-model-reasoning...');
        
        try {
          const { fullStream } = await streamText({
            model: myProvider.languageModel('chat-model-reasoning'),
            messages: [
              { 
                role: 'system', 
                content: INVOICE_PROCESSING_PROMPT
              },
              { 
                role: 'user', 
                content: documentText
              }
            ]
          });

          console.log('Got LLM stream, processing chunks...');
          for await (const chunk of fullStream) {
            if (chunk.type === 'text-delta') {
              extractedText += chunk.textDelta;
            }
          }
        } catch (llmError) {
          console.error('Error during LLM processing:', llmError);
          return {
            status: 'error',
            message: 'Failed to process document - there was an error communicating with the AI model. Please try again in a few moments.'
          };
        }

        // Clean whitespace and ensure we have content
        extractedText = extractedText.trim();
        console.log('LLM Response received, length:', extractedText.length);
        console.log('Raw LLM response:', extractedText);
        
        if (!extractedText) {
          console.error('Empty response from LLM');
          return {
            status: 'error',
            message: 'Failed to process document - no response received from the AI model. Please try again.'
          };
        }

        // Check if it's not an invoice
        if (extractedText.toLowerCase().startsWith('false:')) {
          return {
            status: 'error',
            message: extractedText.slice(6).trim()
          };
        }

        // Validate it starts with "true:" for invoices
        if (!extractedText.toLowerCase().startsWith('true:')) {
          console.error('Invalid response format - missing true/false prefix:', extractedText);
          return {
            status: 'error',
            message: 'Failed to process document due to invalid response format.'
          };
        }

        // Parse the JSON response
        const jsonStr = extractedText.slice(5).trim();
        let data: LLMInvoiceResponse;
        try {
          data = JSON.parse(jsonStr);
          console.log('Parsed invoice data:', data);
        } catch (error) {
          console.error('Failed to parse JSON response:', error);
          return {
            status: 'error',
            message: 'Failed to parse invoice data format.'
          };
        }

        // Get document to get its creation date
        const document = await getDocumentById({ id: documentId });
        if (!document) {
          console.error('Document not found for ID:', documentId);
          throw new Error('Document not found');
        }

        // Generate invoice ID
        const id = generateUUID();

        // Convert total to cents for duplicate check
        const totalAmountCents = Math.round(data.total_amount * 100);

        // Check for duplicate invoice first
        const duplicateInvoice = await findDuplicateInvoice({
          vendorName: data.vendor,
          invoiceNumber: data.invoice_number,
          totalAmount: totalAmountCents,
        });

        if (duplicateInvoice) {
          return {
            status: 'duplicate',
            invoiceId: duplicateInvoice.id,
            message: `Warning: This invoice appears to be a duplicate. I found an existing invoice from ${duplicateInvoice.vendorName} with invoice number ${duplicateInvoice.invoiceNumber} and amount ${(duplicateInvoice.totalAmount ?? 0) / 100} ${duplicateInvoice.currency}. You can view the existing invoice [here](/invoices/${duplicateInvoice.id})`,
          };
        }

        // Track token usage before database operations
        const tokenUsageId = generateUUID();
        const tokenUsageData = {
          promptTokens: estimateTokens(INVOICE_PROCESSING_PROMPT),
          completionTokens: estimateTokens(extractedText),
          totalTokens: estimateTokens(INVOICE_PROCESSING_PROMPT + extractedText),
        };

        // Parse dates
        let invoiceDate: Date | null = null;
        let dueDate: Date | null = null;
        try {
          // Parse dates in YYYY-MM-DD format
          invoiceDate = new Date(data.invoice_date);
          dueDate = new Date(data.due_date);
          
          // Validate dates are valid
          if (isNaN(invoiceDate.getTime())) invoiceDate = null;
          if (isNaN(dueDate.getTime())) dueDate = null;
        } catch (e) {
          console.error('Error parsing dates:', e);
        }

        // Save invoice with the generated ID
        await saveInvoice({
          id,
          documentId,
          documentCreatedAt: document.createdAt,
          vendorName: data.vendor,
          customerName: data.customer,
          invoiceNumber: data.invoice_number,
          invoiceDate: invoiceDate || new Date(),
          dueDate: dueDate || new Date(),
          totalAmount: Math.round(data.total_amount * 100), // Convert to cents
          currency: data.currency,
          lineItems: data.line_items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: Math.round(item.unit_price * 100), // Convert to cents
            totalPrice: Math.round(item.total * 100), // Convert to cents
          })),
        });

        // Track token usage after invoice is saved
        try {
          await trackTokenUsage(tokenUsageId, tokenUsageData, id);
        } catch (tokenError) {
          // Log but don't fail if token tracking fails
          console.error('Failed to track token usage:', tokenError);
        }

        console.log('Successfully saved invoice:', {
          id,
          documentId,
          vendorName: data.vendor,
          invoiceNumber: data.invoice_number
        });

        // Perform validation checks and collect warnings
        const warnings: string[] = [];

        // Check for missing critical fields
        if (!data.vendor) warnings.push("Vendor name is missing");
        if (!data.invoice_number) warnings.push("Invoice number is missing");
        if (!data.invoice_date) warnings.push("Invoice date is missing");
        if (!data.total_amount) warnings.push("Total amount is missing");

        // Validate line item calculations
        const lineItemsTotal = data.line_items.reduce((sum, item) => sum + item.total, 0);
        const hasDiscrepancy = Math.abs(lineItemsTotal - data.total_amount) > 0.01;
        if (hasDiscrepancy) {
          warnings.push(`The sum of line item totals (${lineItemsTotal.toFixed(2)}) does not match the invoice total amount (${data.total_amount.toFixed(2)})`);
        }

        // Check individual line items
        data.line_items.forEach((item, index) => {
          const calculatedTotal = item.quantity * item.unit_price;
          if (Math.abs(calculatedTotal - item.total) > 0.01) {
            warnings.push(`Line item ${index + 1} (${item.description}): quantity (${item.quantity}) × unit price (${item.unit_price}) = ${calculatedTotal}, but total is ${item.total}`);
          }
        });

        return {
          status: 'success',
          invoiceId: id,
          message: warnings.length > 0 
            ? `Invoice saved with warnings. Please review the data at [View Invoice Details](/invoices/${id}):\n- ${warnings.join('\n- ')}` 
            : 'Invoice saved successfully',
        };
      } catch (error) {
        console.error('Error processing invoice:', error);
        return {
          status: 'error',
          message: 'An error occurred while processing this document.'
        };
      }
    },
  });
} 