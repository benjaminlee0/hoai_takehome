ALTER TABLE `Invoice` ADD `currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `Invoice` DROP COLUMN `status`;