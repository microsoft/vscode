/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { numberSegment, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { GetWorkflowRunOptions, IActionsClient, ListWorkflowJobsOptions, ListWorkflowRunsOptions, RerunOptions, WorkflowJob, WorkflowJobsPage, WorkflowRun, WorkflowRunsPage } from './actions.js';
import { DownloadRedirect } from './core.js';
import { CoreClient, parseCheckConclusion, parseCheckStatus } from './coreClient.js';

export class ActionsClient implements IActionsClient {
	constructor(private readonly _client: CoreClient) { }

	async listRuns(repository: RepositoryRef, signal: AbortSignal, options?: ListWorkflowRunsOptions): Promise<WorkflowRunsPage> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'actions',
				method: 'GET',
				path: withQuery(`${repositoryPath(repository)}/actions/runs`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseRuns,
			pages => ({
				...pages[pages.length - 1],
				workflow_runs: pages.flatMap(page => page.workflow_runs)
			})
		);
	}

	async getRun(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: GetWorkflowRunOptions): Promise<WorkflowRun> {
		const { attempt, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'actions',
			method: 'GET',
			path: attempt === undefined ? runPath(repository, runId) : `${runPath(repository, runId)}/attempts/${numberSegment(attempt)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseRun);
	}

	async listJobs(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: ListWorkflowJobsOptions): Promise<WorkflowJobsPage> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'actions',
				method: 'GET',
				path: withQuery(`${runPath(repository, runId)}/jobs`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseJobs,
			pages => ({
				...pages[pages.length - 1],
				jobs: pages.flatMap(page => page.jobs)
			})
		);
	}

	async listJobsForAttempt(repository: RepositoryRef, runId: number, attempt: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<WorkflowJobsPage> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'actions',
				method: 'GET',
				path: withQuery(`${runPath(repository, runId)}/attempts/${numberSegment(attempt)}/jobs`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseJobs,
			pages => ({
				...pages[pages.length - 1],
				jobs: pages.flatMap(page => page.jobs)
			})
		);
	}

	async getJob(repository: RepositoryRef, jobId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<WorkflowJob> {
		return this._client.request({
			domain: 'actions',
			method: 'GET',
			path: `${repositoryPath(repository)}/actions/jobs/${numberSegment(jobId)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseJob);
	}

	/** Unsupported by browser Fetch, which hides the status and headers of manual redirects. */
	async getJobLogRedirect(repository: RepositoryRef, jobId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<DownloadRedirect> {
		const url = await this._client.request({
			domain: 'actions',
			method: 'GET',
			path: `${repositoryPath(repository)}/actions/jobs/${numberSegment(jobId)}/logs`,
			authentication: 'required',
			expectedStatus: 302,
			redirect: 'manual',
			responseBody: 'text',
			options
		}, signal, parse.nonEmptyString);
		return { url };
	}

	/** Unsupported by browser Fetch, which hides the status and headers of manual redirects. */
	async getRunLogRedirect(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<DownloadRedirect> {
		const url = await this._client.request({
			domain: 'actions',
			method: 'GET',
			path: `${runPath(repository, runId)}/logs`,
			authentication: 'required',
			expectedStatus: 302,
			redirect: 'manual',
			responseBody: 'text',
			options
		}, signal, parse.nonEmptyString);
		return { url };
	}

	async rerun(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: RerunOptions): Promise<void> {
		const { enableDebugLogging, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'actions',
			method: 'POST',
			path: `${runPath(repository, runId)}/rerun`,
			body: { enable_debug_logging: enableDebugLogging },
			authentication: 'required',
			expectedStatus: 201,
			responseBody: 'none',
			options: requestOptions
		}, signal);
	}

	async rerunFailedJobs(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: RerunOptions): Promise<void> {
		const { enableDebugLogging, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'actions',
			method: 'POST',
			path: `${runPath(repository, runId)}/rerun-failed-jobs`,
			body: { enable_debug_logging: enableDebugLogging },
			authentication: 'required',
			expectedStatus: 201,
			responseBody: 'none',
			options: requestOptions
		}, signal);
	}

	async rerunJob(repository: RepositoryRef, jobId: number, signal: AbortSignal, options?: RerunOptions): Promise<void> {
		const { enableDebugLogging, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'actions',
			method: 'POST',
			path: `${repositoryPath(repository)}/actions/jobs/${numberSegment(jobId)}/rerun`,
			body: { enable_debug_logging: enableDebugLogging },
			authentication: 'required',
			expectedStatus: 201,
			responseBody: 'none',
			options: requestOptions
		}, signal);
	}

	async cancel(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'actions',
			method: 'POST',
			path: `${runPath(repository, runId)}/cancel`,
			authentication: 'required',
			expectedStatus: 202,
			responseBody: 'none',
			options
		}, signal);
	}
}

function runPath(repository: RepositoryRef, runId: number): string {
	return `${repositoryPath(repository)}/actions/runs/${numberSegment(runId)}`;
}

const parseRun = parse.object<WorkflowRun>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	workflow_id: parse.integer,
	run_number: parse.integer,
	run_attempt: parse.optional(parse.integer),
	name: parse.optional(parse.nullable(parse.string)),
	display_title: parse.string,
	path: parse.string,
	event: parse.string,
	head_branch: parse.nullable(parse.string),
	head_sha: parse.nonEmptyString,
	status: parse.nullable(parse.string),
	conclusion: parse.nullable(parse.string),
	html_url: parse.nonEmptyString,
	check_suite_id: parse.optional(parse.integer),
	pull_requests: parse.nullable(parse.arrayOf(parse.object({
		number: parse.integer,
		head: parse.object({ sha: parse.nonEmptyString }),
		base: parse.object({ sha: parse.nonEmptyString }),
	}))),
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
});

const parseRuns = parse.object<WorkflowRunsPage>({
	total_count: parse.nonNegativeInteger,
	workflow_runs: parse.arrayOf(parseRun)
});

const parseJob = parse.object<WorkflowJob>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	run_id: parse.integer,
	run_attempt: parse.optional(parse.integer),
	name: parse.string,
	head_sha: parse.nonEmptyString,
	status: parseCheckStatus,
	conclusion: parse.nullable(parseCheckConclusion),
	html_url: parse.nullable(parse.string),
	check_run_url: parse.nonEmptyString,
	started_at: parse.nullable(parse.dateTime),
	completed_at: parse.nullable(parse.dateTime),
	labels: parse.optional(parse.strings),
	steps: parse.optional(parse.arrayOf(parse.object({
		name: parse.string,
		number: parse.integer,
		status: parseCheckStatus,
		conclusion: parse.nullable(parse.string),
		started_at: parse.optional(parse.nullable(parse.dateTime)),
		completed_at: parse.optional(parse.nullable(parse.dateTime)),
	}))),
});

const parseJobs = parse.object<WorkflowJobsPage>({
	total_count: parse.nonNegativeInteger,
	jobs: parse.arrayOf(parseJob)
});
