CREATE TABLE `ai_agent_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`status` enum('queued','running','paused','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`inputData` json DEFAULT ('{}'),
	`outputData` json,
	`nodeExecutionLog` json DEFAULT ('[]'),
	`errorMessage` text,
	`pausedAtNodeId` varchar(64),
	`durationMs` int,
	`projectId` int,
	`triggeredBy` int,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_agent_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`description` text,
	`workflowJson` json DEFAULT ('{}'),
	`inputSchema` json DEFAULT ('{}'),
	`triggerType` enum('manual','event','scheduled') NOT NULL DEFAULT 'manual',
	`cronExpression` varchar(64),
	`maxExecutionSeconds` int DEFAULT 300,
	`scope` enum('global','project','private') NOT NULL DEFAULT 'project',
	`status` enum('draft','active','deprecated') NOT NULL DEFAULT 'draft',
	`projectId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_agents_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_agents_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `ai_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(128) NOT NULL,
	`resourceType` varchar(64) NOT NULL,
	`resourceId` varchar(64),
	`beforeData` json,
	`afterData` json,
	`result` enum('success','failure') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	`ipAddress` varchar(64),
	`projectId` int,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_knowledge_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collection` varchar(64) NOT NULL,
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`contentType` enum('text','example','rule','template') NOT NULL DEFAULT 'text',
	`tags` json DEFAULT ('[]'),
	`status` enum('draft','pending_review','approved','rejected') NOT NULL DEFAULT 'draft',
	`source` enum('manual','auto') NOT NULL DEFAULT 'manual',
	`sourceCallId` int,
	`projectId` int,
	`createdBy` int,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_knowledge_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_llm_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`modelId` varchar(128) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`apiBaseUrl` varchar(512) NOT NULL,
	`apiKey` varchar(512) NOT NULL,
	`capabilityTags` json DEFAULT ('[]'),
	`costPer1kInputTokens` decimal(10,6) DEFAULT '0',
	`costPer1kOutputTokens` decimal(10,6) DEFAULT '0',
	`maxContextTokens` int DEFAULT 128000,
	`isDefault` boolean DEFAULT false,
	`fallbackModelId` int,
	`status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
	`lastHealthCheck` timestamp,
	`lastLatencyMs` int,
	`projectId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_llm_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_llm_usage_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`projectId` int,
	`date` varchar(10) NOT NULL,
	`totalCalls` int DEFAULT 0,
	`totalInputTokens` bigint DEFAULT 0,
	`totalOutputTokens` bigint DEFAULT 0,
	`totalCostUsd` decimal(10,6) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_llm_usage_daily_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_mcp_tools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`description` text,
	`type` enum('rest_api','openapi','database','custom_script') NOT NULL,
	`config` json DEFAULT ('{}'),
	`authConfig` json DEFAULT ('{}'),
	`capabilities` json DEFAULT ('[]'),
	`retryCount` int DEFAULT 2,
	`timeoutMs` int DEFAULT 30000,
	`status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
	`lastHealthCheck` timestamp,
	`lastLatencyMs` int,
	`projectId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_mcp_tools_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_mcp_tools_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `ai_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`slug` varchar(64) NOT NULL,
	`apiKey` varchar(128) NOT NULL,
	`apiKeyPrefix` varchar(16) NOT NULL,
	`corsOrigins` json DEFAULT ('[]'),
	`monthlyBudgetUsd` decimal(10,2) DEFAULT '0',
	`budgetAlertPercent` int DEFAULT 80,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_projects_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `ai_projects_apiKey_unique` UNIQUE(`apiKey`)
);
--> statement-breakpoint
CREATE TABLE `ai_skill_calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skillId` int NOT NULL,
	`skillVersion` int NOT NULL,
	`modelId` int,
	`projectId` int,
	`source` enum('manual','agent','api') NOT NULL DEFAULT 'api',
	`inputData` json DEFAULT ('{}'),
	`outputData` json,
	`adopted` boolean,
	`userRating` int,
	`inputTokens` int DEFAULT 0,
	`outputTokens` int DEFAULT 0,
	`costUsd` decimal(10,6) DEFAULT '0',
	`durationMs` int,
	`errorMessage` text,
	`traceId` varchar(64),
	`triggeredBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_skill_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_skill_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skillId` int NOT NULL,
	`version` int NOT NULL,
	`promptTemplate` text NOT NULL,
	`systemPrompt` text,
	`modelId` int,
	`modelParams` json DEFAULT ('{}'),
	`changeNote` text,
	`adoptionRate` decimal(5,2),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_skill_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_skills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`description` text,
	`category` varchar(64),
	`scope` enum('global','project','private') NOT NULL DEFAULT 'project',
	`promptTemplate` text NOT NULL,
	`systemPrompt` text,
	`inputSchema` json DEFAULT ('{}'),
	`outputSchema` json DEFAULT ('{}'),
	`modelId` int,
	`modelParams` json DEFAULT ('{}'),
	`knowledgeCollections` json DEFAULT ('[]'),
	`mcpDependencies` json DEFAULT ('[]'),
	`currentVersion` int DEFAULT 1,
	`canaryVersion` int,
	`canaryPercent` int DEFAULT 0,
	`status` enum('draft','active','deprecated') NOT NULL DEFAULT 'draft',
	`projectId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_skills_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_skills_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`platformRole` enum('super_admin','project_admin','ops_lead','ops','api_caller') NOT NULL DEFAULT 'ops',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
