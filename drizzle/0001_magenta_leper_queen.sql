CREATE TABLE `ai_assistant_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`inputTokens` int,
	`outputTokens` int,
	`toolCalls` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_assistant_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_assistant_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL DEFAULT '新对话',
	`agentId` int,
	`context` text,
	`messageCount` int NOT NULL DEFAULT 0,
	`lastMessagePreview` varchar(256),
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_assistant_sessions_id` PRIMARY KEY(`id`)
);
