/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
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
 * Result of creating a cloud session. The provider decides how to render this.
 * Jobs API yields a PR + session id. Task API yields a task id + url + title.
 */
export type CloudDelegationResult =
	| { kind: 'pullRequest'; prNumber: number; sessionId: string }
	| { kind: 'task'; taskId: string; taskUrl: string; title: string; sessionId: string };

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
 */
export interface CloudSessionData {
	readonly latestSession: SessionInfo;
	readonly pullRequest?: PullRequestSearchItem;
}

/**
 * Content of a single cloud session — initial prompt extracted from API-specific
 * places (Jobs API `problem_statement` field; Task API first `user.message` event).
 */
export interface CloudSessionContent {
	readonly initialPrompt?: string;
}

/**
 * Abstraction over the cloud agent service. `JobsApiBackend` talks to the legacy
 * Jobs API and is the default. `TaskApiBackend` is reserved for the Mission Control
 * Task API and currently throws on every API call.
 */
export interface CloudAgentBackend {
	/**
	 * Fetch a grouped, UI-ready session list. The backend dedupes by resource and
	 * resolves the associated pull request (or synthesizes one from task data).
	 * @param refresh When true, bypass any client-side caches and fetch fresh data.
	 */
	fetchSessionList(
		repoIds: GithubRepoId[] | undefined,
		isAgentWorkspace: boolean,
		refresh: boolean,
	): Promise<CloudSessionData[]>;

	/** Fetch initial prompt / problem statement for a session group. */
	fetchSessionContent(
		repoOwner: string,
		repoName: string,
		sessions: SessionInfo[],
	): Promise<CloudSessionContent>;

	/** Create a new cloud session. */
	createSession(
		params: CreateCloudSessionParams,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<CloudDelegationResult>;

	/**
	 * Post a follow-up message against an existing session.
	 * @param pullRequestOrTaskId Either a PR global id (Jobs API) or a task id (Task API).
	 * @param prompt The raw user prompt; the backend formats it for the underlying API.
	 * @param targetAgent Optional `@`-mention target (Jobs API only).
	 */
	sendFollowUp(
		pullRequestOrTaskId: string,
		prompt: string,
		targetAgent?: string,
	): Promise<FollowUpResult | undefined>;

	/** Get the current status of a session. */
	getSessionInfo(sessionId: string): Promise<SessionInfo | undefined>;

	/** Get the raw logs for a session (used for streaming and history rebuild). */
	getSessionLogs(sessionId: string): Promise<string>;

	/** Block until the session has transitioned out of `queued`. */
	waitForSessionReady(
		sessionId: string,
		token?: vscode.CancellationToken,
	): Promise<SessionInfo | undefined>;

	/** Parse a session URI into a {@link CloudSessionIdentity}. */
	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined;
}
