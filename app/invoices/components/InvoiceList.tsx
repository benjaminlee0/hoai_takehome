'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronUpIcon, ChevronDownIcon, Trash2 } from 'lucide-react';
import type { Invoice } from '@/lib/db/schema';
import { getInvoices } from '../actions';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRouter } from 'next/navigation';
import { DeleteInvoiceButton } from './DeleteInvoiceButton';

interface InvoiceListProps {
  initialData: {
    invoices: Invoice[];
    totalPages: number;
    currentPage: number;
    totalCount: number;
  };
}

export function InvoiceList({ initialData }: InvoiceListProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [sortField, setSortField] = useState<keyof Invoice | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(false);

  const handleSort = (field: keyof Invoice) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }

    const sortedInvoices = [...data.invoices].sort((a, b) => {
      if (field === 'invoiceDate' || field === 'dueDate') {
        const dateA = new Date(a[field]);
        const dateB = new Date(b[field]);
        return sortDirection === 'asc' 
          ? dateA.getTime() - dateB.getTime()
          : dateB.getTime() - dateA.getTime();
      }
      
      if (field === 'totalAmount') {
        return sortDirection === 'asc'
          ? a[field] - b[field]
          : b[field] - a[field];
      }
      
      return sortDirection === 'asc'
        ? String(a[field]).localeCompare(String(b[field]))
        : String(b[field]).localeCompare(String(a[field]));
    });

    setData({ ...data, invoices: sortedInvoices });
  };

  const handlePageChange = async (page: number) => {
    setIsLoading(true);
    try {
      const newData = await getInvoices(page);
      setData(newData);
    } catch (error) {
      console.error('Error fetching page:', error);
    }
    setIsLoading(false);
  };

  const handleRowClick = (e: React.MouseEvent, invoiceId: string) => {
    // Don't navigate if clicking the delete button
    if ((e.target as HTMLElement).closest('.delete-button')) {
      return;
    }
    router.push(`/invoices/${invoiceId}`);
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('vendorName')}
                className="flex items-center gap-1"
              >
                Vendor
                {sortField === 'vendorName' && (
                  sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />
                )}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('invoiceDate')}
                className="flex items-center gap-1"
              >
                Date
                {sortField === 'invoiceDate' && (
                  sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />
                )}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('totalAmount')}
                className="flex items-center gap-1"
              >
                Amount
                {sortField === 'totalAmount' && (
                  sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />
                )}
              </Button>
            </TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.invoices.map((invoice) => (
            <TableRow
              key={invoice.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={(e) => handleRowClick(e, invoice.id)}
            >
              <TableCell>{invoice.vendorName}</TableCell>
              <TableCell>
                {format(new Date(invoice.invoiceDate), 'MMM d, yyyy')}
              </TableCell>
              <TableCell>
                {invoice.currency} {(invoice.totalAmount / 100).toFixed(2)}
              </TableCell>
              <TableCell className="delete-button">
                <DeleteInvoiceButton 
                  invoiceId={invoice.id} 
                  onDeleted={() => {
                    // Remove the invoice from the list
                    setData(prev => ({
                      ...prev,
                      invoices: prev.invoices.filter(inv => inv.id !== invoice.id),
                      totalCount: prev.totalCount - 1
                    }));
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => handlePageChange(data.currentPage - 1)}
            disabled={data.currentPage === 1 || isLoading}
          >
            Previous
          </Button>
          <div className="flex items-center gap-2">
            {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={page === data.currentPage ? "default" : "outline"}
                onClick={() => handlePageChange(page)}
                disabled={isLoading}
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => handlePageChange(data.currentPage + 1)}
            disabled={data.currentPage === data.totalPages || isLoading}
          >
            Next
          </Button>
        </div>
      )}

      <div className="text-center text-sm text-muted-foreground mt-2">
        Total invoices: {data.totalCount}
      </div>
    </div>
  );
} 