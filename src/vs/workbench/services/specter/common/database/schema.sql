-- Specter IDE Database Schema
-- SQLite Database for Agent System
-- Version: 1.0
-- Created: October 14, 2025

-- ============================================================================
-- TABLE: config
-- Purpose: Store application configuration and settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER DEFAULT 0,  -- 1 if value is encrypted, 0 otherwise
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default configuration values
INSERT OR IGNORE INTO config (key, value, encrypted) VALUES
    ('llm_provider', 'deepseek', 0),
    ('deepseek_api_key', '', 1),
    ('deepseek_model', 'deepseek-chat', 0),
    ('deepseek_temperature', '0.7', 0),
    ('deepseek_max_tokens', '4000', 0),
    ('openai_api_key', '', 1),
    ('openai_model', 'gpt-4', 0),
    ('ollama_base_url', 'http://localhost:11434', 0),
    ('ollama_model', 'llama2', 0),
    ('auto_save_workflows', '1', 0),
    ('enable_safety_warnings', '1', 0),
    ('audit_logging', '1', 0);

-- ============================================================================
-- TABLE: conversations
-- Purpose: Store conversation sessions between user and agent
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    metadata TEXT  -- JSON field for additional data
);

-- ============================================================================
-- TABLE: messages
-- Purpose: Store individual messages within conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    metadata TEXT,  -- JSON field for additional data
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- ============================================================================
-- TABLE: workflows
-- Purpose: Store generated workflows
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    workflow_plan TEXT NOT NULL,  -- JSON field with complete workflow plan
    notebook_content TEXT,  -- Generated Jupyter notebook (.ipynb as JSON)
    graph_data TEXT,  -- Reactflow graph data (JSON)
    status TEXT DEFAULT 'draft',  -- 'draft', 'ready', 'executing', 'completed', 'failed'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    metadata TEXT,  -- JSON field for additional data
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

-- ============================================================================
-- TABLE: workflow_steps
-- Purpose: Store individual steps within workflows
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    step_number INTEGER NOT NULL,
    tool_id TEXT NOT NULL,
    action TEXT NOT NULL,
    parameters TEXT,  -- JSON field with step parameters
    dependencies TEXT,  -- JSON array of step numbers this depends on
    status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'success', 'failed', 'skipped'
    output TEXT,  -- Execution output
    error TEXT,  -- Error message if failed
    started_at TEXT,
    completed_at TEXT,
    metadata TEXT,  -- JSON field for additional data
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- ============================================================================
-- TABLE: executions
-- Purpose: Track workflow execution history
-- ============================================================================
CREATE TABLE IF NOT EXISTS executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    total_steps INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,
    failed_steps INTEGER DEFAULT 0,
    skipped_steps INTEGER DEFAULT 0,
    results TEXT,  -- JSON field with aggregated results
    error TEXT,  -- Overall error message if failed
    metadata TEXT,  -- JSON field for additional data
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- ============================================================================
-- TABLE: audit_log
-- Purpose: Audit trail for security and compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,  -- 'workflow_created', 'workflow_executed', 'config_changed', etc.
    entity_type TEXT,  -- 'workflow', 'config', 'conversation', etc.
    entity_id INTEGER,
    user_action TEXT NOT NULL,
    details TEXT,  -- JSON field with event details
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Workflows indexes
CREATE INDEX IF NOT EXISTS idx_workflows_conversation_id ON workflows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);

-- Workflow steps indexes
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_step_number ON workflow_steps(workflow_id, step_number);

-- Executions indexes
CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at DESC);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Config index
CREATE INDEX IF NOT EXISTS idx_config_key ON config(key);

-- ============================================================================
-- TRIGGERS for automatic timestamp updates
-- ============================================================================

-- Update updated_at on config changes
CREATE TRIGGER IF NOT EXISTS trg_config_updated_at
AFTER UPDATE ON config
BEGIN
    UPDATE config SET updated_at = datetime('now') WHERE key = NEW.key;
END;

-- Update updated_at on conversation changes
CREATE TRIGGER IF NOT EXISTS trg_conversations_updated_at
AFTER UPDATE ON conversations
BEGIN
    UPDATE conversations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update updated_at on workflow changes
CREATE TRIGGER IF NOT EXISTS trg_workflows_updated_at
AFTER UPDATE ON workflows
BEGIN
    UPDATE workflows SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update conversation's updated_at when new message is added
CREATE TRIGGER IF NOT EXISTS trg_messages_update_conversation
AFTER INSERT ON messages
BEGIN
    UPDATE conversations SET updated_at = datetime('now') WHERE id = NEW.conversation_id;
END;

-- ============================================================================
-- VIEWS for Common Queries
-- ============================================================================

-- View: Recent conversations with message counts
CREATE VIEW IF NOT EXISTS v_conversations_with_counts AS
SELECT 
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    COUNT(m.id) as message_count,
    (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY created_at DESC LIMIT 1) as last_user_message
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id;

-- View: Workflows with execution summary
CREATE VIEW IF NOT EXISTS v_workflows_with_execution AS
SELECT 
    w.id,
    w.name,
    w.status as workflow_status,
    w.created_at,
    e.id as latest_execution_id,
    e.status as execution_status,
    e.started_at as last_executed_at,
    e.completed_steps,
    e.total_steps
FROM workflows w
LEFT JOIN (
    SELECT workflow_id, MAX(id) as max_id
    FROM executions
    GROUP BY workflow_id
) latest ON w.id = latest.workflow_id
LEFT JOIN executions e ON e.id = latest.max_id;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
