import { deleteInvoiceById } from '@/lib/db/queries';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    await deleteInvoiceById(id);
    return new Response('Invoice deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return new Response('Failed to delete invoice', { status: 500 });
  }
} 