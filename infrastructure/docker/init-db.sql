-- Logos Database Initialization

-- Create databases
CREATE DATABASE logos_audit;

-- Connect to main database
\c logos

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Threads table for conversation persistence
CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id VARCHAR(255) NOT NULL,
    persona_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    parent_id UUID REFERENCES threads(id),
    branch_point INTEGER,
    agents TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_threads_workspace ON threads(workspace_id);
CREATE INDEX idx_threads_persona ON threads(persona_id);
CREATE INDEX idx_threads_parent ON threads(parent_id);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    agent_id VARCHAR(255),
    tier_used INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- Workspace CA state
CREATE TABLE workspace_ca_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id VARCHAR(255) UNIQUE NOT NULL,
    persona_id VARCHAR(255) NOT NULL,
    project_model JSONB,
    conventions JSONB,
    patterns JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ca_state_workspace ON workspace_ca_state(workspace_id);

-- Suggestions table
CREATE TABLE suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    affected_files TEXT[],
    suggested_fix JSONB,
    confidence FLOAT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_suggestions_workspace ON suggestions(workspace_id);
CREATE INDEX idx_suggestions_status ON suggestions(status);

-- Connect to audit database
\c logos_audit

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Audit events table
CREATE TABLE audit_events (
    event_id UUID PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    persona_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    workspace_id VARCHAR(255),
    thread_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    attestation JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_audit_persona ON audit_events(persona_id);
CREATE INDEX idx_audit_timestamp ON audit_events(timestamp);
CREATE INDEX idx_audit_type ON audit_events(event_type);
CREATE INDEX idx_audit_workspace ON audit_events(workspace_id);
CREATE INDEX idx_audit_session ON audit_events(session_id);

-- Partitioning by month for efficient archival
-- (Simplified - production would use proper partitioning)

-- Blockchain anchors table
CREATE TABLE blockchain_anchors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merkle_root VARCHAR(64) NOT NULL,
    event_count INTEGER NOT NULL,
    tx_id VARCHAR(66),
    block_number BIGINT,
    anchored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_anchors_merkle ON blockchain_anchors(merkle_root);
CREATE INDEX idx_anchors_tx ON blockchain_anchors(tx_id);


