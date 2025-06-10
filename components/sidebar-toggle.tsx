import type { ComponentProps } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { type SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Button } from './ui/button';
import { SidebarLeftIcon } from './icons';

export function SidebarToggle({
  className,
}: ComponentProps<typeof SidebarTrigger>) {
  const { toggleSidebar, state } = useSidebar();

  return (
    <div className="relative">
      <Button
        onClick={toggleSidebar}
        variant="outline"
        className="md:px-2 md:h-fit"
      >
        <SidebarLeftIcon size={16} />
      </Button>

      <AnimatePresence>
        {state === 'collapsed' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute left-20 top-0 z-50 whitespace-nowrap rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-md"
          >
            Open sidebar to access<br />
            Invoice view and Token<br />
            usage statistics
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
