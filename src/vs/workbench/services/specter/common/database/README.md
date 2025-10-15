# Specter Database Schema

This directory contains the database schema and migration system for Specter IDE.

## Overview

Specter uses SQLite for local storage of:
- Configuration settings (including encrypted API keys)
- Conversation history
- Generated workflows
- Execution history
- Audit logs

## Files

- **schema.sql** - Complete database schema with all tables, indexes, triggers, and views
- **migrations.ts** - Migration system for schema versioning and updates
- **types.ts** - TypeScript interfaces for all database tables

## Database Tables

### 1. config
Stores application configuration and settings.

**Key Fields:**
- `key` (TEXT, PRIMARY KEY) - Configuration key
- `value` (TEXT) - Configuration value
- `encrypted` (INTEGER) - 1 if value is encrypted (e.g., API keys)

**Default Configuration:**
- LLM provider settings (DeepSeek, OpenAI, Ollama)
- API keys (encrypted)
- Model parameters (temperature, max tokens)
- Feature flags (auto-save, safety warnings, audit logging)

### 2. conversations
Tracks conversation sessions between user and agent.

**Key Fields:**
- `id` (INTEGER, PRIMARY KEY)
- `title` (TEXT) - Conversation title
- `created_at` (TEXT) - Timestamp
- `updated_at` (TEXT) - Last message timestamp
- `metadata` (TEXT) - JSON field for additional data

### 3. messages
Stores individual messages within conversations.

**Key Fields:**
- `id` (INTEGER, PRIMARY KEY)
- `conversation_id` (INTEGER, FOREIGN KEY)
- `role` (TEXT) - 'user' or 'assistant'
- `content` (TEXT) - Message content
- `metadata` (TEXT) - JSON (tokens used, model, etc.)

### 4. workflows
Stores generated security testing workflows.

**Key Fields:**
- `id` (INTEGER, PRIMARY KEY)
- `conversation_id` (INTEGER, FOREIGN KEY)
- `name` (TEXT) - Workflow name
- `workflow_plan` (TEXT) - JSON with complete plan
- `notebook_content` (TEXT) - Generated Jupyter notebook (.ipynb)
- `graph_data` (TEXT) - Reactflow graph data
- `status` (TEXT) - 'draft', 'ready', 'executing', 'completed', 'failed'

### 5. workflow_steps
Individual steps within workflows.

**Key Fields:**
- `id` (INTEGER, PRIMARY KEY)
- `workflow_id` (INTEGER, FOREIGN KEY)
- `step_number` (INTEGER) - Order in workflow
- `tool_id` (TEXT) - Security tool to use
- `action` (TEXT) - Action to perform
- `parameters` (TEXT) - JSON with step parameters
- `dependencies` (TEXT) - JSON array of dependent step numbers
- `status` (TEXT) - 'pending', 'running', 'success', 'failed', 'skipped'
- `output` (TEXT) - Execution output
- `error` (TEXT) - Error message if failed

### 6. executions
Tracks workflow execution history.

**Key Fields:**
- `id` (INTEGER, PRIMARY KEY)
- `workflow_id` (INTEGER, FOREIGN KEY)
- `status` (TEXT) - 'pending', 'running', 'completed', 'failed', 'cancelled'
- `total_steps` (INTEGER)
- `completed_steps` (INTEGER)
- `failed_steps` (INTEGER)
- `results` (TEXT) - JSON with aggregated results

### 7. audit_log
Audit trail for security and compliance.

**Key Fields:**
- `id` (INTEGER, PRIMARY KEY)
- `event_type` (TEXT) - Type of event
- `entity_type` (TEXT) - What was affected
- `entity_id` (INTEGER) - ID of affected entity
- `user_action` (TEXT) - Description of action
- `details` (TEXT) - JSON with event details

## Indexes

Performance indexes are created for:
- Conversation timestamps (created_at, updated_at)
- Message conversation lookups
- Workflow status and timestamps
- Execution history
- Audit log queries

## Triggers

Automatic triggers for:
- Updating `updated_at` timestamps on changes
- Updating conversation timestamp when messages are added

## Views

### v_conversations_with_counts
Shows conversations with message counts and last user message.

### v_workflows_with_execution
Shows workflows with their latest execution status.

## Usage Example

```typescript
import { DatabaseService } from './databaseService';
import { DatabaseMigrations } from './migrations';

// Initialize database
const db = new DatabaseService();
await db.initialize();

// Run migrations
const currentVersion = await db.getCurrentVersion();
const pending = DatabaseMigrations.getPendingMigrations(currentVersion);

for (const migration of pending) {
    await db.applyMigration(migration);
}

// Query example
const conversations = await db.query<ConversationWithCount>(
    'SELECT * FROM v_conversations_with_counts ORDER BY updated_at DESC LIMIT 10'
);
```

## Schema Versioning

The migration system tracks schema version in the `schema_version` table:
- Version 1: Initial schema with all core tables

To add a new migration:
1. Add to `MIGRATIONS` array in `migrations.ts`
2. Increment version number
3. Provide `up` (apply) and `down` (rollback) SQL statements

## Security Notes

- API keys are encrypted before storage (encrypted=1)
- Audit logging is enabled by default
- All executions are logged for compliance
- Foreign key constraints ensure referential integrity

## Database Location

The SQLite database file is stored at:
- macOS/Linux: `~/.specter/specter.db`
- Windows: `%APPDATA%/specter/specter.db`

---

*Last Updated: October 14, 2025*
