/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentTaskCreatePullRequestResponse, AgentTaskGetResponse, AgentTaskSessionEvent } from '@vscode/copilot-api';
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
 * Two concrete backends exist, discriminated by `kind`:
 * - {@link PrCloudAgentBackend} (`kind: 'pr'`) — implemented by `JobsApiBackend` (v1).
 * - {@link TaskCloudAgentBackend} (`kind: 'task'`) — implemented by `TaskApiBackend` (v2).
 *
 * Both share the identity-agnostic surface in {@link CloudAgentBackendCommon}. The
 * domain-specific surfaces are non-overlapping, so callers narrow via `kind` (or hold a
 * pre-narrowed reference) and the type system enforces which methods are callable. There
 * are no runtime "not supported" throws on the type surface.
 */
export interface CloudAgentBackendCommon {
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
}

/**
 * Jobs API (v1) backend surface. Session identity is the pull request; every read is keyed
 * by PR number / global id and follow-up is an `@copilot` comment.
 */
export interface PrCloudAgentBackend extends CloudAgentBackendCommon {
	readonly kind: 'pr';

	/** Fetch initial prompt for a PR-keyed session group. */
	fetchPullRequestContent(
		repoOwner: string,
		repoName: string,
		sessions: SessionInfo[],
	): Promise<CloudSessionContent>;

	/** Fetch the per-PR thread of session iterations. */
	fetchSessionsForPullRequest(pr: PullRequestSearchItem): Promise<SessionInfo[]>;

	/**
	 * Post a follow-up `@copilot` comment to an existing PR-keyed session.
	 * @param prGlobalId PR GraphQL node id.
	 */
	sendFollowUpToPullRequest(
		prGlobalId: string,
		prompt: string,
		targetAgent?: string,
	): Promise<FollowUpResult | undefined>;

	/** Get a single PR-iteration's status. */
	getSessionInfo(sessionId: string): Promise<SessionInfo | undefined>;

	/** Get a single PR-iteration's raw SSE log stream. */
	getSessionLogsSSE(sessionId: string): Promise<string>;

	/** Block until a single PR-iteration leaves `queued`. */
	waitForSessionReady(
		sessionId: string,
		token?: vscode.CancellationToken,
	): Promise<SessionInfo | undefined>;
}

/**
 * Task API (v2) backend surface. Session identity is the task; the PR (if any) is decoration.
 * Multi-turn history is `task.sessions[]`; follow-up is a steer call.
 */
export interface TaskCloudAgentBackend extends CloudAgentBackendCommon {
	readonly kind: 'task';

	/** Fetch the full task payload with embedded turn sessions. */
	fetchTaskContent(taskId: string): Promise<TaskContent | undefined>;

	/** Fetch the typed event timeline for a task. */
	fetchTaskEvents(taskId: string): Promise<readonly AgentTaskSessionEvent[]>;

	/**
	 * Block until the task has changed observably since the given baseline (new turn, an
	 * advance of `updated_at`, or the latest turn leaving in-progress/queued).
	 */
	waitForTaskUpdate(
		taskId: string,
		since: { turnCount: number; updatedAt?: string },
		token?: vscode.CancellationToken,
	): Promise<TaskContent | undefined>;

	/** Post a follow-up turn against a task via the steer endpoint. */
	sendFollowUpToTask(
		taskId: string,
		prompt: string,
	): Promise<FollowUpResult | undefined>;

	/**
	 * Reverse lookup: find the most recent task associated with the given pull request.
	 * Used by the PR-URI compatibility shim so the provider can keep emitting `/<prNumber>`
	 * URIs on v2 (preserving archive state across the v1→v2 flip) while still routing
	 * content/follow-up/openInBrowser through the task endpoints.
	 * TODO: remove this when the PR-URI shim is removed and the provider emits explicit `task/<taskId>` URIs.
	 */
	findTaskIdForPullRequest(
		owner: string,
		repo: string,
		prNumber: number,
	): Promise<string | undefined>;

	/**
	 * Materialise a pull request for a task that finished without one. The v2 backend
	 * no longer auto-creates a PR on `createTask`, so the provider offers a "Create pull
	 * request" toolbar action in the chat input for a settled, PR-less task that calls this
	 * method when invoked.
	 */
	createPullRequestForTask(
		owner: string,
		repo: string,
		taskId: string,
	): Promise<AgentTaskCreatePullRequestResponse>;
}

/** Discriminated union of all backends. Narrow via `backend.kind`. */
export type CloudAgentBackend = PrCloudAgentBackend | TaskCloudAgentBackend;
