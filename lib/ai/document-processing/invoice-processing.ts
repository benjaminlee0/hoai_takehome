import { Message } from 'ai';
import { ProcessedAttachment } from './types';
import { myProvider } from '@/lib/ai/models';
import { streamText } from 'ai';
import { userInvoiceIntentKeywords, INVOICE_PROCESSING_PROMPT } from './constants';
import { findDuplicateInvoice } from '@/lib/db/queries';
import { getCachedPrompt, cachePrompt } from '@/lib/ai/token-tracking';

// Helper function to estimate tokens (1 token ≈ 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

/**
 * Check if the user message indicates they want to process an invoice
 */
export function shouldProcessInvoice(message: Message): boolean {
  const lowerContent = message.content.toLowerCase();
  return userInvoiceIntentKeywords.some(keyword => lowerContent.includes(keyword));
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

/**
 * Process a document to determine if it's an invoice and extract data if it is
 */
export async function processInvoiceDocument(documentText: string): Promise<{
  isInvoice: boolean;
  message?: string;
  data?: {
    vendorName: string;
    customerName: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
    totalAmount: number;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  };
}> {
  try {
    console.log('Starting processInvoiceDocument...');
    console.log('Document text length:', documentText.length);
    console.log('First 100 chars of document:', documentText.substring(0, 100));

    // Check for cached prompt
    const cachedPrompt = await getCachedPrompt(INVOICE_PROCESSING_PROMPT);
    if (!cachedPrompt) {
      console.log('Caching prompt for first use');
      // If not cached, cache it for future use
      const tokenCount = estimateTokens(INVOICE_PROCESSING_PROMPT);
      await cachePrompt(INVOICE_PROCESSING_PROMPT, tokenCount);
    } else {
      console.log('Using cached prompt');
    }

    console.log('About to call LLM with document text...');
    // Get LLM response
    let extractedText = '';
    const { fullStream } = await streamText({
      model: myProvider.languageModel('chat-model-reasoning'),
      messages: [
        { 
          role: 'system', 
          content: INVOICE_PROCESSING_PROMPT
        },
        { 
          role: 'user', 
          content: `Please analyze this document:\n\n${documentText}`
        }
      ]
    });

    for await (const chunk of fullStream) {
      if (chunk.type === 'text-delta') {
        extractedText += chunk.textDelta;
      }
    }

    // Clean whitespace and ensure we have content
    extractedText = extractedText.trim();
    console.log('Raw LLM Response:', extractedText);
    
    if (!extractedText) {
      console.log('No response received from LLM');
      return {
        isInvoice: false,
        message: 'Failed to process document - no response received.'
      };
    }

    // Check if it's not an invoice
    if (extractedText.toLowerCase().startsWith('false:')) {
      console.log('LLM rejected document with reason:', extractedText.slice(6).trim());
      return {
        isInvoice: false,
        message: extractedText.slice(6).trim()
      };
    }

    // Validate it starts with "true:" for invoices
    if (!extractedText.toLowerCase().startsWith('true:')) {
      console.error('Invalid response format - missing true/false prefix. Full response:', extractedText);
      return {
        isInvoice: false,
        message: 'Failed to process document due to invalid response format.'
      };
    }

    console.log('LLM accepted document as valid invoice');

    try {
      // Extract the JSON part after "true:"
      const jsonStr = extractedText.slice(5).trim();
      const data = JSON.parse(jsonStr) as LLMInvoiceResponse;

      // Validate required fields
      if (!data.vendor || !data.invoice_number || !data.total_amount) {
        console.error('Missing required fields in response:', data);
        return {
          isInvoice: false,
          message: 'Failed to extract required invoice information.'
        };
      }

      // Map the JSON structure to our internal format
      return {
        isInvoice: true,
        data: {
          vendorName: data.vendor,
          customerName: data.customer,
          invoiceNumber: data.invoice_number,
          invoiceDate: data.invoice_date,
          dueDate: data.due_date,
          currency: data.currency || 'USD',
          totalAmount: data.total_amount,
          lineItems: data.line_items.map((item: LLMInvoiceLineItem) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.total
          }))
        }
      };
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      return {
        isInvoice: false,
        message: 'Failed to parse invoice data format.'
      };
    }
  } catch (error) {
    console.error('Error processing invoice document:', error);
    return {
      isInvoice: false,
      message: 'An error occurred while processing this document.'
    };
  }
}

/**
 * Format document content for processing
 */
export function formatDocumentContent(
  attachment: ProcessedAttachment,
  documentId: string,
  message: Message & { chatId: string; createdAt: Date }
): { content: string; isExtractionNeeded: boolean } {
  // For now, just return the content for extraction if it's an invoice request
  if (shouldProcessInvoice(message)) {
    return {
      content: `Document ID: ${documentId}\n---Document Content Start---\n${attachment.content}\n---Document Content End---`,
      isExtractionNeeded: true
    };
  }

  return {
    content: `Document ID: ${documentId}\n---Document Content Start---\n${attachment.content}\n---Document Content End---`,
    isExtractionNeeded: false
  };
}