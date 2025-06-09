'use server';

import { getInvoices as getInvoicesQuery, getInvoicesCount as getInvoicesCountQuery, updateInvoice as updateInvoiceQuery } from '@/lib/db/queries';
import type { Invoice, InvoiceLineItem } from '@/lib/db/schema';

export async function getInvoices(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const invoices = await getInvoicesQuery({ limit, offset });
  const totalCount = await getInvoicesCountQuery();
  
  return {
    invoices,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    totalCount
  };
}

export async function updateInvoice(invoice: Invoice & { lineItems: InvoiceLineItem[] }) {
  const { id, vendorName, customerName, invoiceNumber, invoiceDate, dueDate, totalAmount, currency, lineItems, lastEditedBy } = invoice;
  return updateInvoiceQuery({
    id,
    vendorName,
    customerName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    totalAmount,
    currency,
    lineItems,
    lastEditedBy: lastEditedBy || undefined
  });
} 