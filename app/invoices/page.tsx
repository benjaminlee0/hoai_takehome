import { getInvoices } from './actions';
import { InvoiceList } from './components/InvoiceList';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface InvoicesPageProps {
  searchParams: { page?: string };
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const page = searchParams.page ? parseInt(searchParams.page) : 1;
  const data = await getInvoices(page);

  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Invoices</h1>
      </div>
      <InvoiceList initialData={data} />
    </div>
  );
} 