/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';

// --- Session Identity ---

export type CloudSessionIdentity =
	| { type: 'pr'; prNumber: number; sessionIndex: number }
	| { type: 'task'; taskId: string };

// --- Delegation Result ---
// What the backend returns after creating a cloud session.
// Provider decides how to render this (PR card, task link, etc.)

export type CloudDelegationResult =
	| { kind: 'pullRequest'; prNumber: number; sessionId: string }
	| { kind: 'task'; taskId: string; taskUrl: string; title: string };

// --- Create Session Params ---

export interface CreateCloudSessionParams {
	prompt: string;
	problemContext: string;
	baseRef: string;
	headRef?: string;
	customAgent?: string;
	model?: string;
	partnerAgent?: string;
	selectedRepository?: string;
}

// --- Follow-up Result ---

export interface FollowUpResult {
	success: boolean;
	message?: string;
	url?: string;
}

// --- Session Data ---
// Raw session data the backend fetches. Provider maps this to VS Code UI types.

export interface CloudSessionData {
	sessions: SessionInfo[];
	pullRequest?: PullRequestSearchItem;
	initialPrompt?: string;
}

// --- The Backend Interface ---
// Data-oriented: returns raw data, not VS Code UI parts.
// Provider handles all UI rendering and VS Code type construction.

export interface CloudAgentBackend {
	/**
	 * Create a new cloud agent session.
	 * Jobs API: creates job + waits for PR.
	 * Task API: creates task (instant).
	 */
	createSession(
		params: CreateCloudSessionParams,
		token: vscode.CancellationToken,
	): Promise<CloudDelegationResult>;

	/**
	 * Fetch all sessions for the given repositories.
	 * Jobs API: getAllSessions + getPullRequestFromGlobalId.
	 * Task API: listTasks.
	 */
	fetchSessionList(
		repoIds: GithubRepoId[],
		isAgentWorkspace: boolean,
	): Promise<CloudSessionData[]>;

	/**
	 * Fetch session content (logs/events) for a specific session.
	 * Jobs API: getJobBySessionId + getSessionLogs.
	 * Task API: getTaskEvents.
	 */
	fetchSessionContent(
		repoOwner: string,
		repoName: string,
		sessions: SessionInfo[],
	): Promise<{ initialPrompt?: string; logs: string }>;

	/**
	 * Send a follow-up message to an existing session.
	 * Jobs API: posts PR comment.
	 * Task API: steers task.
	 */
	sendFollowUp(
		prNumberOrTaskId: number | string,
		prompt: string,
		targetAgent?: string,
	): Promise<FollowUpResult>;

	/**
	 * Get session logs for streaming.
	 * Jobs API: getSessionLogs from OctoKit.
	 * Task API: getTaskEvents with cursor.
	 */
	getSessionLogs(
		sessionId: string,
	): Promise<string>;

	/**
	 * Get session info for status polling.
	 */
	getSessionInfo(
		sessionId: string,
	): Promise<SessionInfo | undefined>;

	/**
	 * Wait for a session to transition from queued to in_progress.
	 */
	waitForSessionReady(
		sessionId: string,
		token: vscode.CancellationToken,
	): Promise<SessionInfo | undefined>;

	/**
	 * Parse a session URI into a CloudSessionIdentity.
	 */
	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined;

	/**
	 * Check if CCA is enabled for a given repository.
	 */
	checkEnabled(owner: string, repo: string): Promise<{ enabled: boolean; message?: string }>;
}
