'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import type { Invoice, InvoiceLineItem } from '@/lib/db/schema';
import { updateInvoice } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface InvoiceDetailsProps {
  invoice: Invoice & { lineItems: InvoiceLineItem[] };
}

export function InvoiceDetails({ invoice: initialInvoice }: InvoiceDetailsProps) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async () => {
    try {
      await updateInvoice(invoice);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update invoice:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Invoice Details</span>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          ) : (
            <div className="space-x-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vendorName">Vendor Name</Label>
            <Input
              id="vendorName"
              value={invoice.vendorName}
              onChange={(e) => setInvoice({ ...invoice, vendorName: e.target.value })}
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label htmlFor="customerName">Customer Name</Label>
            <Input
              id="customerName"
              value={invoice.customerName}
              onChange={(e) => setInvoice({ ...invoice, customerName: e.target.value })}
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label htmlFor="invoiceNumber">Invoice Number</Label>
            <Input
              id="invoiceNumber"
              value={invoice.invoiceNumber}
              onChange={(e) => setInvoice({ ...invoice, invoiceNumber: e.target.value })}
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label htmlFor="invoiceDate">Invoice Date</Label>
            <Input
              id="invoiceDate"
              type="date"
              value={format(new Date(invoice.invoiceDate), 'yyyy-MM-dd')}
              onChange={(e) => setInvoice({ ...invoice, invoiceDate: new Date(e.target.value) })}
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={format(new Date(invoice.dueDate), 'yyyy-MM-dd')}
              onChange={(e) => setInvoice({ ...invoice, dueDate: new Date(e.target.value) })}
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={invoice.currency}
              onChange={(e) => setInvoice({ ...invoice, currency: e.target.value })}
              disabled={!isEditing}
            />
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Line Items</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lineItems.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => {
                        const newLineItems = [...invoice.lineItems];
                        newLineItems[index] = { ...item, description: e.target.value };
                        setInvoice({ ...invoice, lineItems: newLineItems });
                      }}
                      disabled={!isEditing}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const newLineItems = [...invoice.lineItems];
                        const quantity = parseInt(e.target.value) || 0;
                        newLineItems[index] = { 
                          ...item, 
                          quantity,
                          totalPrice: Math.round(item.unitPrice * quantity)
                        };
                        setInvoice({ 
                          ...invoice, 
                          lineItems: newLineItems,
                          totalAmount: newLineItems.reduce((sum, item) => sum + item.totalPrice, 0)
                        });
                      }}
                      disabled={!isEditing}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(item.unitPrice / 100).toFixed(2)}
                      onChange={(e) => {
                        const newLineItems = [...invoice.lineItems];
                        const value = e.target.value === '' ? '0' : e.target.value;
                        newLineItems[index] = { 
                          ...item, 
                          unitPrice: Math.round(parseFloat(value) * 100),
                          totalPrice: Math.round(parseFloat(value) * 100 * item.quantity)
                        };
                        setInvoice({ 
                          ...invoice, 
                          lineItems: newLineItems,
                          totalAmount: newLineItems.reduce((sum, item) => sum + item.totalPrice, 0)
                        });
                      }}
                      disabled={!isEditing}
                    />
                  </TableCell>
                  <TableCell>
                    {invoice.currency} {((item.quantity * item.unitPrice) / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 text-right">
          <div className="text-lg font-semibold">
            Total Amount: {invoice.currency} {(invoice.totalAmount / 100).toFixed(2)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 