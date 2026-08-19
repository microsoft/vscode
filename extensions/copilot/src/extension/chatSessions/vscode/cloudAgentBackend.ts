/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentTaskCreatePullRequestResponse, AgentTaskGetResponse, AgentTaskSessionEvent, AgentTaskState } from '@vscode/copilot-api';
import type { CancellationToken } from 'vscode';
import { GithubRepoId } from '../../../platform/git/common/gitService';

/**
 * Raw reference to a pull request artifact attached to a task. The provider resolves it to the
 * full pull request when needed for display.
 */
export interface PullArtifactRef {
	readonly globalId?: string;
	readonly databaseId?: number;
	readonly headRef?: string;
}

export interface CloudDelegationResult {
	readonly taskId: string;
	readonly taskUrl: string;
	readonly title: string;
	readonly sessionId: string;
}

export interface CreateCloudSessionParams {
	readonly owner: string;
	readonly repo: string;
	readonly title: string | undefined;
	readonly prompt: string;
	readonly problemStatement: string;
	readonly baseRef: string;
	readonly headRef?: string;
	readonly customAgent?: string;
	readonly model?: string;
	readonly partnerAgentId?: number;
}

export interface CloudSessionData {
	readonly taskId: string;
	readonly title: string;
	readonly state: AgentTaskState;
	readonly createdAt: string;
	readonly completedAt?: string;
	readonly pullArtifact?: PullArtifactRef;
	readonly repo?: { readonly owner: string; readonly name: string; readonly host?: string };
	readonly diffRefs?: { readonly owner: string; readonly repo: string; readonly baseRef: string; readonly headRef: string };
}

export interface TaskContent {
	readonly task: AgentTaskGetResponse;
	readonly turns: readonly AgentTaskSessionEvent[];
	readonly pullArtifact?: PullArtifactRef;
}

export interface CloudAgentBackend {
	fetchSessionList(
		repoIds: GithubRepoId[] | undefined,
		isAgentWorkspace: boolean,
	): Promise<CloudSessionData[]>;

	createSession(params: CreateCloudSessionParams): Promise<CloudDelegationResult>;

	fetchTaskContent(taskId: string): Promise<TaskContent | undefined>;

	fetchTaskEvents(taskId: string): Promise<readonly AgentTaskSessionEvent[]>;

	waitForTaskUpdate(
		taskId: string,
		since: { turnCount: number; updatedAt?: string },
		token?: CancellationToken,
	): Promise<TaskContent | undefined>;

	sendFollowUpToTask(taskId: string, prompt: string): Promise<boolean>;

	createPullRequestForTask(task: AgentTaskGetResponse): Promise<AgentTaskCreatePullRequestResponse>;
}
