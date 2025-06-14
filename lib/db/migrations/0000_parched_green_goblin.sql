CREATE TABLE `CachedInvoice` (
	`id` text PRIMARY KEY NOT NULL,
	`vendorName` text NOT NULL,
	`customerName` text NOT NULL,
	`invoiceNumber` text NOT NULL,
	`invoiceDate` integer NOT NULL,
	`dueDate` integer NOT NULL,
	`totalAmount` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastEditedBy` text
);
--> statement-breakpoint
CREATE TABLE `CachedInvoiceLineItem` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unitPrice` integer NOT NULL,
	`totalPrice` integer NOT NULL,
	FOREIGN KEY (`invoiceId`) REFERENCES `CachedInvoice`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Chat` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`title` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Document` (
	`id` text NOT NULL,
	`createdAt` integer NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`kind` text DEFAULT 'text' NOT NULL,
	PRIMARY KEY(`id`, `createdAt`)
);
--> statement-breakpoint
CREATE TABLE `Invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`documentId` text,
	`documentCreatedAt` integer,
	`vendorName` text,
	`customerName` text,
	`invoiceNumber` text,
	`invoiceDate` integer,
	`dueDate` integer,
	`totalAmount` integer,
	`currency` text DEFAULT 'USD',
	`createdAt` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`documentId`,`documentCreatedAt`) REFERENCES `Document`(`id`,`createdAt`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `InvoiceLineItem` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text,
	`description` text,
	`quantity` integer,
	`unitPrice` integer,
	`totalPrice` integer,
	FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Message` (
	`id` text PRIMARY KEY NOT NULL,
	`chatId` text NOT NULL,
	`role` text NOT NULL,
	`content` blob NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `PromptCache` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`hash` text NOT NULL,
	`tokenCount` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsedAt` integer NOT NULL,
	`useCount` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`documentId` text NOT NULL,
	`documentCreatedAt` integer NOT NULL,
	`originalText` text NOT NULL,
	`suggestedText` text NOT NULL,
	`description` text,
	`isResolved` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`documentId`,`documentCreatedAt`) REFERENCES `Document`(`id`,`createdAt`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `TokenUsage` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text,
	`promptTokens` integer,
	`completionTokens` integer,
	`totalTokens` integer,
	`estimatedCost` real,
	`createdAt` integer NOT NULL,
	`totalProcessedInvoices` integer,
	FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `Vote` (
	`chatId` text NOT NULL,
	`messageId` text NOT NULL,
	`isUpvoted` integer NOT NULL,
	PRIMARY KEY(`chatId`, `messageId`),
	FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON UPDATE no action ON DELETE no action
);
