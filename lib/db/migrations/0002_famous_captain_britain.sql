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
CREATE TABLE `TokenUsage` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text NOT NULL,
	`promptTokens` integer NOT NULL,
	`completionTokens` integer NOT NULL,
	`totalTokens` integer NOT NULL,
	`estimatedCost` real NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON UPDATE no action ON DELETE no action
);
