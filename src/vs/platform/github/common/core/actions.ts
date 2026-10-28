/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { CheckConclusion, CheckStatus, DownloadRedirect } from './core.js';

/** A GitHub Actions workflow run. */
export interface WorkflowRun {
	/** Numeric workflow-run ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Numeric workflow definition ID. */
	readonly workflow_id: number;
	/** Human-facing sequence number for the workflow. */
	readonly run_number: number;
	/** Attempt number, when reported. */
	readonly run_attempt?: number;
	/** Workflow name, when reported, or null. */
	readonly name?: string | null;
	/** Event-specific display title. */
	readonly display_title: string;
	/** Workflow path as supplied by the server. */
	readonly path: string;
	/** Triggering event name. */
	readonly event: string;
	/** Head branch, or null. */
	readonly head_branch: string | null;
	/** Commit SHA used by the run. */
	readonly head_sha: string;
	/** Server lifecycle status, or null. */
	readonly status: string | null;
	/** Server conclusion, or null. */
	readonly conclusion: string | null;
	/** Browser URL. */
	readonly html_url: string;
	/** Associated check-suite ID, when reported. */
	readonly check_suite_id?: number;
	/** Open PRs matching the head SHA or branch, not proof they triggered the run; may be null. */
	readonly pull_requests: readonly {
		/** Repository-local PR number. */
		readonly number: number;
		/** PR head recorded by the run. */
		readonly head: {
			/** Head commit SHA. */
			readonly sha: string;
		};
		/** PR base recorded by the run. */
		readonly base: {
			/** Base commit SHA. */
			readonly sha: string;
		};
	}[] | null;
	/** Creation timestamp. */
	readonly created_at: string;
	/** Last update timestamp. */
	readonly updated_at: string;
}

/** An Actions job, not a check-run object. */
export interface WorkflowJob {
	/** Numeric job ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Owning workflow-run ID. */
	readonly run_id: number;
	/** Attempt number, when reported. */
	readonly run_attempt?: number;
	/** Job display name. */
	readonly name: string;
	/** Checked commit SHA. */
	readonly head_sha: string;
	/** Lifecycle phase. */
	readonly status: CheckStatus;
	/** Outcome, or null. */
	readonly conclusion: CheckConclusion | null;
	/** Browser URL, or null when unavailable. */
	readonly html_url: string | null;
	/** Associated check-run API URL. */
	readonly check_run_url: string;
	/** Start timestamp, or null before the job starts. */
	readonly started_at: string | null;
	/** Completion timestamp, or null. */
	readonly completed_at: string | null;
	/** Runner-selection labels, when associated workflow-job metadata is available. */
	readonly labels?: readonly string[];
	/** Steps, when included in the response. */
	readonly steps?: readonly {
		/** Step display name. */
		readonly name: string;
		/** One-based step number. */
		readonly number: number;
		/** Step lifecycle phase. */
		readonly status: CheckStatus;
		/** Step conclusion, or null. */
		readonly conclusion: string | null;
		/** Start timestamp, omitted or null until available. */
		readonly started_at?: string | null;
		/** Completion timestamp, omitted or null until available. */
		readonly completed_at?: string | null;
	}[];
}

/** One page of workflow runs. */
export interface WorkflowRunsPage {
	/** Total reported matching runs. */
	readonly total_count: number;
	/** Runs on this page. */
	readonly workflow_runs: readonly WorkflowRun[];
}

/** One page of jobs. */
export interface WorkflowJobsPage {
	/** Total matching jobs. */
	readonly total_count: number;
	/** Jobs on this page. */
	readonly jobs: readonly WorkflowJob[];
}

/** Workflow-run listing filters. */
export type ListWorkflowRunsOptions = ApiPaginationOptions<PageOptions & {
	/** Triggering actor login. */
	readonly actor?: string;
	/** Head branch filter. */
	readonly branch?: string;
	/** Triggering event filter. */
	readonly event?: string;
	/** Lifecycle or outcome filter accepted by the endpoint. */
	readonly status?: CheckStatus | CheckConclusion | 'stale';
	/** Exact head commit SHA. */
	readonly head_sha?: string;
	/** GitHub date/range filter on run creation. */
	readonly created?: string;
	/** Whether PR-associated runs should be excluded. */
	readonly exclude_pull_requests?: boolean;
}>;

/** Job-list filters for a run, not an attempt-specific listing. */
export type ListWorkflowJobsOptions = ApiPaginationOptions<PageOptions & {
	/** Latest attempt's jobs or jobs from all attempts. */
	readonly filter?: 'latest' | 'all';
}>;

/** Selection of a workflow run attempt. */
export interface GetWorkflowRunOptions extends ApiRequestOptions {
	/** Attempt number; omission selects the latest run. */
	readonly attempt?: number;
}

/** Request options for rerunning a workflow or job. */
export interface RerunOptions extends ApiRequestOptions {
	/** Enable debug logging for the rerun. */
	readonly enableDebugLogging?: boolean;
}


/** Operations for workflow runs, jobs, log URLs, reruns, and cancellation. */
export interface IActionsClient {

	/** GET /repos/{owner}/{repo}/actions/runs: list one page of workflow runs. */
	listRuns(repository: RepositoryRef, signal: AbortSignal, options?: ListWorkflowRunsOptions): Promise<WorkflowRunsPage>;

	/** GET /repos/{owner}/{repo}/actions/runs/{id}: read a run, optionally selecting a specific attempt. */
	getRun(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: GetWorkflowRunOptions): Promise<WorkflowRun>;

	/** GET /repos/{owner}/{repo}/actions/runs/{id}/jobs: list one page of jobs from the latest or all attempts. */
	listJobs(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: ListWorkflowJobsOptions): Promise<WorkflowJobsPage>;

	/** GET /repos/{owner}/{repo}/actions/runs/{id}/attempts/{attempt}/jobs: list one page of jobs for a specific attempt. */
	listJobsForAttempt(repository: RepositoryRef, runId: number, attempt: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<WorkflowJobsPage>;

	/** GET /repos/{owner}/{repo}/actions/jobs/{id}: read one job. */
	getJob(repository: RepositoryRef, jobId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<WorkflowJob>;

	/** GET /repos/{owner}/{repo}/actions/jobs/{id}/logs: get a temporary download URL for a job's log. Unsupported by browser Fetch. */
	getJobLogRedirect(repository: RepositoryRef, jobId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<DownloadRedirect>;

	/** GET /repos/{owner}/{repo}/actions/runs/{id}/logs: get a temporary download URL for a run's log archive. Unsupported by browser Fetch. */
	getRunLogRedirect(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<DownloadRedirect>;

	/** POST /repos/{owner}/{repo}/actions/runs/{id}/rerun: request a new attempt of the workflow run. */
	rerun(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: RerunOptions): Promise<void>;

	/** POST /repos/{owner}/{repo}/actions/runs/{id}/rerun-failed-jobs: request a rerun of the failed jobs. */
	rerunFailedJobs(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: RerunOptions): Promise<void>;

	/** POST /repos/{owner}/{repo}/actions/jobs/{id}/rerun: request a rerun of one job and its dependents. */
	rerunJob(repository: RepositoryRef, jobId: number, signal: AbortSignal, options?: RerunOptions): Promise<void>;

	/** POST /repos/{owner}/{repo}/actions/runs/{id}/cancel: request cancellation; HTTP 202 acknowledges acceptance, not termination. */
	cancel(repository: RepositoryRef, runId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;
}
