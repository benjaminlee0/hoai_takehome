import { getInvoiceById } from '@/lib/db/queries';
import { InvoiceDetails } from '@/app/invoices/components/InvoiceDetails';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface InvoicePageProps {
  params: {
    id: string;
  };
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const invoice = await getInvoiceById(params.id);

  if (!invoice) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/invoices" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Invoice Details</h1>
      </div>
      <InvoiceDetails invoice={invoice} />
    </div>
  );
} 