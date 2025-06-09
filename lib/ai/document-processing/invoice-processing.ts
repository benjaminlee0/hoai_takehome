import { Message } from 'ai';
import { ProcessedAttachment } from './types';
import { myProvider } from '@/lib/ai/models';
import { streamText } from 'ai';
import { userInvoiceIntentKeywords } from './constants';
import { findDuplicateInvoice } from '@/lib/db/queries';

const INVOICE_PROCESSING_PROMPT = `Analyze this document and determine if it's a business invoice.

A business invoice should have most of these elements:
- Invoice number
- Issue date
- Due date
- Line items with quantities and prices
- Total amount
- Vendor and customer information

The document may be a PDF or image that's been converted to text, so the formatting might not be perfect. Look for these elements even if they're not perfectly formatted.

If this is NOT a business invoice:
1. Start your response with exactly "false:"
2. Follow with a brief explanation of why it's not an invoice
Example: "false: This appears to be a receipt rather than a business invoice."

If this IS a business invoice:
1. Start your response with exactly "true:"
2. Follow with the extracted data in this exact format:
vendor:...
customer:...
invoice_number:...
invoice_date:...
due_date:...
currency:...
total_amount:...
---line items start---
description:...
quantity:...
unit_price:...
total:...
---line items end---

For PDFs and scanned documents:
- Look for invoice elements even if they're not in a standard format
- The text might have extra spaces or unusual line breaks
- Numbers might be split across lines
- Some fields might be missing - extract what you can find

Document text:
`;

/**
 * Check if the user message indicates they want to process an invoice
 */
export function shouldProcessInvoice(message: Message): boolean {
  const lowerContent = message.content.toLowerCase();
  return userInvoiceIntentKeywords.some(keyword => lowerContent.includes(keyword));
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
    // Get LLM response
    let extractedText = '';
    const { fullStream } = await streamText({
      model: myProvider.languageModel('chat-model-reasoning'),
      messages: [
        { 
          role: 'system', 
          content: 'You are an invoice processing assistant. Analyze documents to determine if they are invoices and extract relevant data if they are. Follow the format instructions exactly.'
        },
        { 
          role: 'user', 
          content: INVOICE_PROCESSING_PROMPT + documentText
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
    if (!extractedText) {
      return {
        isInvoice: false,
        message: 'Failed to process document - no response received.'
      };
    }

    // Check if it's not an invoice
    if (extractedText.toLowerCase().startsWith('false:')) {
      // Return non-invoice message with prefix stripped
      return {
        isInvoice: false,
        message: extractedText.slice(6).trim()
      };
    }

    // Validate it starts with "true:" for invoices
    if (!extractedText.toLowerCase().startsWith('true:')) {
      console.error('Invalid response format - missing true/false prefix:', extractedText);
      return {
        isInvoice: false,
        message: 'Failed to process document due to invalid response format.'
      };
    }

    // Extract invoice data from the response
    const lines = extractedText.slice(5).trim().split('\n'); // Remove "true:" prefix
    const data: any = {};
    let currentLineItem: any = null;
    let lineItems: any[] = [];
    let inLineItems = false;

    // Parse the line-by-line response
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim(); // Rejoin in case value contains colons

      if (line.includes('---line items start---')) {
        inLineItems = true;
        continue;
      }
      if (line.includes('---line items end---')) {
        inLineItems = false;
        continue;
      }

      if (inLineItems) {
        if (!currentLineItem) {
          currentLineItem = {};
        }
        
        switch(key) {
          case 'description':
            currentLineItem.description = value;
            break;
          case 'quantity':
            currentLineItem.quantity = parseFloat(value);
            break;
          case 'unit_price':
            currentLineItem.unitPrice = parseFloat(value);
            break;
          case 'total':
            currentLineItem.total = parseFloat(value);
            if (Object.keys(currentLineItem).length === 4) {
              lineItems.push(currentLineItem);
              currentLineItem = null;
            }
            break;
        }
      } else {
        switch(key) {
          case 'vendor':
            data.vendorName = value;
            break;
          case 'customer':
            data.customerName = value;
            break;
          case 'invoice_number':
            data.invoiceNumber = value;
            break;
          case 'invoice_date':
            data.invoiceDate = value;
            break;
          case 'due_date':
            data.dueDate = value;
            break;
          case 'currency':
            data.currency = value || 'USD';
            break;
          case 'total_amount':
            data.totalAmount = parseFloat(value);
            break;
        }
      }
    }

    // Validate required fields for invoice data
    if (!data.vendorName || !data.invoiceNumber || !data.totalAmount) {
      console.error('Missing required fields in response:', data);
      return {
        isInvoice: false,
        message: 'Failed to extract required invoice information.'
      };
    }

    data.lineItems = lineItems;

    // Check for duplicate invoice before saving
    const duplicateInvoice = await findDuplicateInvoice({
      vendorName: data.vendorName,
      invoiceNumber: data.invoiceNumber,
      totalAmount: Math.round(data.totalAmount * 100)
    });

    if (duplicateInvoice) {
      return {
        isInvoice: true,
        message: `This appears to be a duplicate invoice. I found an existing invoice from ${data.vendorName} with invoice number ${data.invoiceNumber} and amount ${data.totalAmount.toFixed(2)}. You can view it here: [View Invoice](/invoices/${duplicateInvoice.id})`,
        data: data
      };
    }

    // Return successful invoice data
    return {
      isInvoice: true,
      data: data
    };
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
      content: `Please extract information from this invoice:\n\n${attachment.content}`,
      isExtractionNeeded: true
    };
  }

  return {
    content: `Here is the text content from your ${attachment.type} document:\n\n${attachment.content}`,
    isExtractionNeeded: false
  };
}