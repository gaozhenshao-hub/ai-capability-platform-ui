CREATE TABLE `ai_assistant_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`modelId` varchar(128),
	`temperature` decimal(3,2) DEFAULT '0.70',
	`maxTokens` int DEFAULT 2048,
	`enableTools` boolean NOT NULL DEFAULT true,
	`customSystemPrompt` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_assistant_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_assistant_settings_userId_unique` UNIQUE(`userId`)
);
