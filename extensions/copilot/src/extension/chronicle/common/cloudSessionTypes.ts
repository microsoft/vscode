/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ── Cloud session API types ─────────────────────────────────────────────────────

/**
 * Resolved GitHub repository numeric IDs (from GitHub REST API).
 */
export interface RepoIdentifiers {
	ownerId: number;
	repoId: number;
}

/**
 * GitHub repository context combining string names with resolved numeric IDs.
 */
export interface GitHubRepository {
	owner: string;
	repo: string;
	repoIds: RepoIdentifiers;
}

/**
 * Cloud session and task IDs for an active remote session.
 */
export interface CloudSessionIds {
	cloudSessionId: string;
	cloudTaskId: string;
}

/**
 * Response from creating a cloud session.
 */
export interface CreateSessionResponse {
	id: string;
	task_id?: string;
	agent_task_id?: string;
}

/**
 * A cloud session.
 */
export interface CloudSession {
	id: string;
	state: string;
	task_id?: string;
	owner_id: number;
	repo_id: number;
	created_at: string;
	updated_at: string;
}

// ── Session event types (CLI-compatible) ────────────────────────────────────────
// Event format compatible with the cloud session pipeline.

/**
 * Base structure for all session events sent to the cloud.
 */
export interface SessionEvent {
	/** Unique event identifier (UUID v4). */
	id: string;
	/** ISO 8601 timestamp when the event was created. */
	timestamp: string;
	/** ID of the chronologically preceding event, forming a linked chain. Null for the first event. */
	parentId: string | null;
	/** When true, the event is transient and not persisted. */
	ephemeral?: boolean;
	/** Event type discriminator. */
	type: string;
	/** Event-specific payload. */
	data: Record<string, unknown>;
}

/**
 * Working directory context schema for session.start events.
 */
export interface WorkingDirectoryContext {
	cwd?: string;
	repository?: string;
	branch?: string;
	headCommit?: string;
}

/** Reason why session creation failed. */
export type CreateSessionFailureReason = 'policy_blocked' | 'error';

/** Result of attempting to create a cloud session. */
export type CreateSessionResult =
	| { ok: true; response: CreateSessionResponse }
	| { ok: false; reason: CreateSessionFailureReason };
