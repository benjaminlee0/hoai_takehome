import { getInvoiceById } from '@/lib/db/queries';
import { InvoiceDetails } from '@/app/invoices/components/InvoiceDetails';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { DeleteInvoiceButton } from '../components/DeleteInvoiceButton';

interface InvoicePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params;
  const invoice = await getInvoiceById(id);

  if (!invoice) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices" className="flex items-center gap-2">
              <ArrowLeft size={16} />
              Back to Invoices
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Invoice Details</h1>
        </div>
        <DeleteInvoiceButton invoiceId={id} />
      </div>
      <InvoiceDetails invoice={invoice} />
    </div>
  );
} 