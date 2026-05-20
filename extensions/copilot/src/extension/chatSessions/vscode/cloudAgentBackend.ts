/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentTaskGetResponse, AgentTaskSessionEvent } from '@vscode/copilot-api';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';

/**
 * Identifies a cloud session from a VS Code URI. Two shapes are supported so the
 * provider can transition from Jobs API (PR-based) to Task API (task-based).
 */
export type CloudSessionIdentity =
	| { type: 'pr'; prNumber: number; sessionIndex?: number }
	| { type: 'task'; taskId: string };

/**
 * Raw reference to a pull request artifact attached to a task. Carries the ids/refs
 * the Task API exposes (internal db id + optional GraphQL global id + branch fallback)
 * so the provider can resolve to a full {@link PullRequestSearchItem} when needed
 * for display. The Jobs API path doesn't use this — it returns pre-resolved PRs.
 *
 * See `pullArtifactResolver.ts` (`resolvePullArtifact`, `resolvePullArtifactWithRetry`).
 */
export interface PullArtifactRef {
	readonly repo: { readonly owner: string; readonly name: string };
	/** GraphQL node id from the artifact, when available. */
	readonly globalId?: string;
	/** Internal PR database id; matches `PullRequestSearchItem.fullDatabaseId`. */
	readonly databaseId?: number;
	/** Branch fallback for PRs not yet indexed by global id. */
	readonly headRef?: string;
	/** Backend may pre-resolve when it already has the full PR (Jobs API path). */
	readonly preResolved?: PullRequestSearchItem;
}

/**
 * Result of creating a cloud session. The provider decides how to render this.
 * Jobs API yields a PR + session id. Task API yields a task id (and an optional
 * raw pull artifact if the underlying task happens to attach one; the provider
 * resolves it asynchronously and does not block creation on PR materialization).
 */
export type CloudDelegationResult =
	| { kind: 'pullRequest'; prNumber: number; sessionId: string }
	| { kind: 'task'; taskId: string; taskUrl: string; title: string; sessionId: string; pullArtifact?: PullArtifactRef };

/**
 * Parameters for creating a new cloud session. The provider resolves UI sentinels
 * (default agent/model/repo) and performs CCA enablement / truncation UI before
 * calling the backend; values here are ready to be sent to the API.
 */
export interface CreateCloudSessionParams {
	readonly owner: string;
	readonly repo: string;
	readonly host: string;
	readonly title: string | undefined;
	readonly prompt: string;
	readonly problemStatement: string;
	readonly baseRef: string;
	readonly headRef?: string;
	readonly customAgent?: string;
	readonly model?: string;
	readonly partnerAgentId?: number;
}

export interface FollowUpResult {
	readonly url?: string;
}

/**
 * A grouped session entry returned by {@link CloudAgentBackend.fetchSessionList}.
 * For Jobs API this represents the latest session per pull request. For Task API
 * this represents a single task (one task = one session).
 *
 * `pullRequest` is the pre-resolved PR for rendering (Jobs API populates it directly).
 * `pullArtifact` is a raw artifact reference (Task API populates it for tasks with a
 * `pull` artifact); the provider resolves it lazily to a `pullRequest` for display.
 * Either, both, or neither may be present — PR-less tasks (Task API) have neither.
 */
export interface CloudSessionData {
	readonly latestSession: SessionInfo;
	readonly pullRequest?: PullRequestSearchItem;
	readonly pullArtifact?: PullArtifactRef;
}

/**
 * Content of a single cloud session — initial prompt extracted from API-specific
 * places (Jobs API `problem_statement` field; Task API first `user.message` event).
 */
export interface CloudSessionContent {
	readonly initialPrompt?: string;
}

/**
 * Full content payload for a Task API task (v2). The task itself plus the ordered
 * turn sessions inside it (`task.sessions[]`) and the optional pull artifact for
 * decoration. The provider renders one `turns[]` entry as one (request, response)
 * pair — there is no PR-thread concept at the task level.
 */
export interface TaskContent {
	readonly task: AgentTaskGetResponse;
	readonly turns: readonly AgentTaskSessionEvent[]; // events; turns derived from sessions[]
	readonly pullArtifact?: PullArtifactRef;
}

/**
 * Cloud agent backend abstraction.
 *
 * The interface is intentionally bifurcated by identity domain:
 *
 * - **PR-keyed** (`fetchPullRequestContent`, `fetchSessionsForPullRequest`, `sendFollowUpToPullRequest`,
 *   `getSessionLogsSSE`, `getSessionInfo`, `waitForSessionReady`) — implemented by `JobsApiBackend`.
 *   The Task backend throws "not supported" if these are called.
 * - **Task-keyed** (`fetchTaskContent`, `fetchTaskEvents`, `waitForTaskTurn`, `sendFollowUpToTask`) —
 *   implemented by `TaskApiBackend`. The Jobs backend throws "not supported" if these are called.
 * - **Identity-agnostic** (`fetchSessionList`, `createSession`, `parseSessionId`) — both backends
 *   implement; the provider routes based on the identity returned by `parseSessionId` for
 *   reads, and on `CloudDelegationResult.kind` for writes.
 *
 * TypeScript can't enforce which methods are valid for which backend at the call site, so the
 * provider dispatches by `CloudSessionIdentity.type` and throws are tests-time safety nets.
 */
export interface CloudAgentBackend {
	// ── Identity-agnostic ────────────────────────────────────────────────────

	/**
	 * Fetch a grouped, UI-ready session list across the given repos.
	 * @param refresh When true, bypass any client-side caches and fetch fresh data.
	 */
	fetchSessionList(
		repoIds: GithubRepoId[] | undefined,
		isAgentWorkspace: boolean,
		refresh: boolean,
	): Promise<CloudSessionData[]>;

	/** Create a new cloud session. Returns a PR-shaped or task-shaped result depending on the backend. */
	createSession(
		params: CreateCloudSessionParams,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<CloudDelegationResult>;

	/** Parse a session URI into a {@link CloudSessionIdentity}. */
	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined;

	// ── PR-keyed (Jobs API) ──────────────────────────────────────────────────

	/**
	 * Fetch initial prompt for a PR-keyed session group. Jobs API only — Task API throws.
	 */
	fetchPullRequestContent(
		repoOwner: string,
		repoName: string,
		sessions: SessionInfo[],
	): Promise<CloudSessionContent>;

	/**
	 * Fetch the session iteration list for a pull request (the per-PR thread of sessions).
	 * Jobs API only — Task API throws.
	 */
	fetchSessionsForPullRequest(pr: PullRequestSearchItem): Promise<SessionInfo[]>;

	/**
	 * Post a follow-up `@copilot` comment to an existing PR-keyed session.
	 * @param prGlobalId PR GraphQL node id. Jobs API only — Task API throws.
	 */
	sendFollowUpToPullRequest(
		prGlobalId: string,
		prompt: string,
		targetAgent?: string,
	): Promise<FollowUpResult | undefined>;

	/** Get a single iteration's status. Jobs API only — Task API throws. */
	getSessionInfo(sessionId: string): Promise<SessionInfo | undefined>;

	/** Get a single iteration's raw SSE log stream. Jobs API only — Task API throws. */
	getSessionLogsSSE(sessionId: string): Promise<string>;

	/** Block until a single PR-iteration leaves `queued`. Jobs API only — Task API throws. */
	waitForSessionReady(
		sessionId: string,
		token?: vscode.CancellationToken,
	): Promise<SessionInfo | undefined>;

	// ── Task-keyed (Task API) ────────────────────────────────────────────────

	/**
	 * Fetch the full task payload with embedded turn sessions. Task API only — Jobs throws.
	 */
	fetchTaskContent(taskId: string): Promise<TaskContent | undefined>;

	/**
	 * Fetch the typed event timeline for a task (or a specific turn session within it).
	 * Task API only — Jobs throws.
	 */
	fetchTaskEvents(taskId: string): Promise<readonly AgentTaskSessionEvent[]>;

	/**
	 * Block until the task has gained a new turn beyond `sinceTurnCount`. Used after
	 * `sendFollowUpToTask` to detect that the new turn has appeared. Task API only.
	 */
	waitForTaskTurn(
		taskId: string,
		sinceTurnCount: number,
		token?: vscode.CancellationToken,
	): Promise<TaskContent | undefined>;

	/**
	 * Post a follow-up turn against a task via the steer endpoint. Task API only — Jobs throws.
	 */
	sendFollowUpToTask(
		taskId: string,
		prompt: string,
	): Promise<FollowUpResult | undefined>;
}
