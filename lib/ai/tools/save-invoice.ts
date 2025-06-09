import type { DataStreamWriter } from 'ai';
import type { Session } from '@auth/core/types';
import { saveInvoice } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { tool } from 'ai';

const lineItemSchema = z.object({
  description: z.string().describe('Description of the item'),
  quantity: z.number().describe('Quantity of items'),
  unitPrice: z.number().describe('Price per unit'),
  totalPrice: z.number().describe('Total price for this line item')
});

const invoiceSchema = z.object({
  documentId: z.string().describe('The ID of the document containing the invoice'),
  vendorName: z.string().describe('Name of the vendor/seller'),
  customerName: z.string().describe('Name of the customer/buyer'),
  invoiceNumber: z.string().describe('Unique invoice reference number'),
  invoiceDate: z.string().describe('Date when invoice was issued (YYYY-MM-DD)'),
  dueDate: z.string().describe('Date when payment is due (YYYY-MM-DD)'),
  totalAmount: z.number().describe('Total amount of the invoice'),
  currency: z.string().optional().describe('Currency code (e.g., EUR, USD)'),
  lineItems: z.array(lineItemSchema),
  documentAiProcessed: z.boolean().describe('Whether this invoice was processed by Document AI')
});

type InvoiceData = z.infer<typeof invoiceSchema>;

export function saveExtractedInvoice({ session, dataStream }: { session: Session; dataStream: DataStreamWriter }) {
  return tool({
    description: 'Save extracted invoice data to the database',
    parameters: invoiceSchema,
    execute: async (args: InvoiceData) => {
      try {
        if (!session.user?.id) {
          throw new Error('User not authenticated');
        }

        // Require Document AI processing
        if (!args.documentAiProcessed) {
          throw new Error('Invoice must be processed by Document AI before saving');
        }

        const { documentId, currency = 'EUR', documentAiProcessed, ...invoiceData } = args;
        
        // Save to database
        await saveInvoice({
          id: generateUUID(),
          documentId,
          vendorName: invoiceData.vendorName,
          customerName: invoiceData.customerName,
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: new Date(invoiceData.invoiceDate),
          dueDate: new Date(invoiceData.dueDate),
          totalAmount: invoiceData.totalAmount,
          currency,
          lineItems: invoiceData.lineItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice
          })),
          lastEditedBy: session.user.id
        });

        // Write success message as a proper JSON object
        dataStream.writeData({
          type: 'success',
          content: `Invoice data saved for document ${documentId}`
        });

        return { success: true, documentId };
      } catch (error) {
        console.error('Failed to save invoice:', error);
        throw error;
      }
    }
  });
} 