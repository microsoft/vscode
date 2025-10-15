/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BugB-Tech. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Database Type Definitions for Specter
 */

// ============================================================================
// Config Table Types
// ============================================================================

export interface ConfigRow {
	key: string;
	value: string;
	encrypted: number;  // 0 or 1 (boolean in SQLite)
	created_at: string;
	updated_at: string;
}

export type ConfigKey = 
	| 'llm_provider'
	| 'deepseek_api_key'
	| 'deepseek_model'
	| 'deepseek_temperature'
	| 'deepseek_max_tokens'
	| 'openai_api_key'
	| 'openai_model'
	| 'ollama_base_url'
	| 'ollama_model'
	| 'auto_save_workflows'
	| 'enable_safety_warnings'
	| 'audit_logging';

// ============================================================================
// Conversation Table Types
// ============================================================================

export interface ConversationRow {
	id: number;
	title: string | null;
	created_at: string;
	updated_at: string;
	metadata: string | null;  // JSON string
}

export interface ConversationMetadata {
	tags?: string[];
	archived?: boolean;
	[key: string]: any;
}

export interface ConversationWithCount extends ConversationRow {
	message_count: number;
	last_user_message: string | null;
}

// ============================================================================
// Message Table Types
// ============================================================================

export interface MessageRow {
	id: number;
	conversation_id: number;
	role: 'user' | 'assistant';
	content: string;
	created_at: string;
	metadata: string | null;  // JSON string
}

export interface MessageMetadata {
	tokens_used?: number;
	model?: string;
	[key: string]: any;
}

// ============================================================================
// Workflow Table Types
// ============================================================================

export interface WorkflowRow {
	id: number;
	conversation_id: number | null;
	name: string;
	description: string | null;
	workflow_plan: string;  // JSON string
	notebook_content: string | null;  // JSON string (.ipynb format)
	graph_data: string | null;  // JSON string (Reactflow)
	status: 'draft' | 'ready' | 'executing' | 'completed' | 'failed';
	created_at: string;
	updated_at: string;
	metadata: string | null;  // JSON string
}

export interface WorkflowPlan {
	name: string;
	description: string;
	steps: WorkflowStep[];
	tools_required: string[];
	estimated_duration_minutes?: number;
}

export interface WorkflowStep {
	step_number: number;
	tool_id: string;
	action: string;
	description: string;
	parameters: Record<string, any>;
	dependencies: number[];  // Array of step numbers
	required_credentials?: string[];
}

export interface WorkflowMetadata {
	author?: string;
	tags?: string[];
	category?: string;
	[key: string]: any;
}

export interface WorkflowWithExecution extends WorkflowRow {
	latest_execution_id: number | null;
	execution_status: string | null;
	last_executed_at: string | null;
	completed_steps: number | null;
	total_steps: number | null;
}

// ============================================================================
// Workflow Step Table Types
// ============================================================================

export interface WorkflowStepRow {
	id: number;
	workflow_id: number;
	step_number: number;
	tool_id: string;
	action: string;
	parameters: string | null;  // JSON string
	dependencies: string | null;  // JSON string (array)
	status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
	output: string | null;
	error: string | null;
	started_at: string | null;
	completed_at: string | null;
	metadata: string | null;  // JSON string
}

export interface WorkflowStepMetadata {
	retry_count?: number;
	duration_ms?: number;
	[key: string]: any;
}

// ============================================================================
// Execution Table Types
// ============================================================================

export interface ExecutionRow {
	id: number;
	workflow_id: number;
	status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
	started_at: string;
	completed_at: string | null;
	total_steps: number;
	completed_steps: number;
	failed_steps: number;
	skipped_steps: number;
	results: string | null;  // JSON string
	error: string | null;
	metadata: string | null;  // JSON string
}

export interface ExecutionResults {
	summary: {
		total: number;
		success: number;
		failed: number;
		skipped: number;
	};
	step_results: Array<{
		step_number: number;
		tool_id: string;
		status: string;
		output?: any;
		error?: string;
	}>;
	artifacts?: string[];  // Paths to generated artifacts
}

export interface ExecutionMetadata {
	user_id?: string;
	execution_environment?: string;
	[key: string]: any;
}

// ============================================================================
// Audit Log Table Types
// ============================================================================

export interface AuditLogRow {
	id: number;
	event_type: string;
	entity_type: string | null;
	entity_id: number | null;
	user_action: string;
	details: string | null;  // JSON string
	ip_address: string | null;
	created_at: string;
}

export type AuditEventType =
	| 'workflow_created'
	| 'workflow_updated'
	| 'workflow_executed'
	| 'workflow_deleted'
	| 'conversation_created'
	| 'conversation_deleted'
	| 'config_changed'
	| 'api_key_updated'
	| 'tool_installed'
	| 'tool_removed';

export interface AuditDetails {
	changes?: Record<string, { old: any; new: any }>;
	reason?: string;
	[key: string]: any;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Generic database result type
 */
export interface DBResult<T = any> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
	limit: number;
	offset: number;
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
}
