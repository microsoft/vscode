/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRequestService } from '../../request/common/request.js';
import { ILogService } from '../../log/common/log.js';
import { makeGitHubAPIRequest } from './githubAPI.js';

export const IGitHubService = createDecorator<IGitHubService>('githubService');

/**
 * Represents a GitHub Actions workflow job
 */
export interface IGitHubWorkflowJob {
	id: number;
	run_id: number;
	run_url: string;
	node_id: string;
	head_sha: string;
	url: string;
	html_url: string;
	status: 'queued' | 'in_progress' | 'completed';
	conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
	started_at: string;
	completed_at: string | null;
	name: string;
	steps?: IGitHubWorkflowStep[];
	check_run_url: string;
	labels: string[];
	runner_id: number | null;
	runner_name: string | null;
	runner_group_id: number | null;
	runner_group_name: string | null;
}

/**
 * Represents a step in a GitHub Actions workflow job
 */
export interface IGitHubWorkflowStep {
	name: string;
	status: 'queued' | 'in_progress' | 'completed';
	conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
	number: number;
	started_at: string | null;
	completed_at: string | null;
}

/**
 * Represents a GitHub custom agent
 */
export interface IGitHubCustomAgent {
	name: string;
	description?: string;
	tools?: string[];
	model?: string;
}

/**
 * Response from the GitHub API when fetching custom agents
 */
export interface IGitHubCustomAgentsResponse {
	agents: IGitHubCustomAgent[];
}

/**
 * Service for interacting with GitHub APIs
 */
export interface IGitHubService {
	readonly _serviceBrand: undefined;

	/**
	 * Get a workflow job by its job ID
	 *
	 * @param owner Repository owner
	 * @param repo Repository name
	 * @param jobId Job ID
	 * @param token Authentication token
	 * @param cancellationToken Cancellation token
	 * @returns Promise that resolves to the job details
	 */
	getJobByJobIdWithToken(
		owner: string,
		repo: string,
		jobId: number,
		token: string,
		cancellationToken: CancellationToken
	): Promise<IGitHubWorkflowJob>;

	/**
	 * Get custom agents for a repository
	 *
	 * @param owner Repository owner
	 * @param repo Repository name
	 * @param token Authentication token
	 * @param cancellationToken Cancellation token
	 * @returns Promise that resolves to the list of custom agents
	 */
	getCustomAgents(
		owner: string,
		repo: string,
		token: string,
		cancellationToken: CancellationToken
	): Promise<IGitHubCustomAgentsResponse>;
}

/**
 * Implementation of the GitHub service
 */
export class GitHubService implements IGitHubService {
	readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService
	) { }

	/**
	 * Get a workflow job by its job ID with explicit typing
	 */
	async getJobByJobIdWithToken(
		owner: string,
		repo: string,
		jobId: number,
		token: string,
		cancellationToken: CancellationToken
	): Promise<IGitHubWorkflowJob> {
		const url = `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}`;

		const job = await makeGitHubAPIRequest<IGitHubWorkflowJob>(
			this.requestService,
			this.logService,
			{ url, token, method: 'GET' },
			cancellationToken
		);

		return job;
	}

	/**
	 * Get custom agents for a repository with explicit typing
	 */
	async getCustomAgents(
		owner: string,
		repo: string,
		token: string,
		cancellationToken: CancellationToken
	): Promise<IGitHubCustomAgentsResponse> {
		const url = `https://api.github.com/repos/${owner}/${repo}/copilot/agents`;

		const response = await makeGitHubAPIRequest<IGitHubCustomAgentsResponse>(
			this.requestService,
			this.logService,
			{ url, token, method: 'GET' },
			cancellationToken
		);

		// Ensure the response has the expected structure
		if (!response || !response.agents) {
			throw new Error('Invalid response from GitHub API: missing agents property');
		}

		return response;
	}
}
