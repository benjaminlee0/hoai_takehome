import { motion } from 'framer-motion';
import { PaperclipIcon } from './icons';

export const InvoiceOverview = () => {
  return (
    <motion.div
      key="invoice-overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <div className="flex flex-row justify-center">
          <div className="size-16 flex items-center rounded-full justify-center ring-1 ring-border bg-background">
            <PaperclipIcon size={32} />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-medium">Upload an Invoice</h2>
          <p className="text-muted-foreground">
            Attach an invoice file and I'll help you process it. I can extract key information like vendor details, amounts, and line items.
          </p>
        </div>
      </div>
    </motion.div>
  );
}; 