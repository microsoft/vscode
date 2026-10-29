/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { CheckConclusion, CheckStatus } from './core.js';

/** Integration identity attached to a check run or suite. */
export interface CheckApp {
	/** Numeric GitHub App ID. */
	readonly id: number;
	/** App slug, when included. */
	readonly slug?: string;
	/** App display name. */
	readonly name: string;
}

/** A check run and its status, conclusion, and output. */
export interface CheckRun {
	/** Numeric check-run ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Check name. */
	readonly name: string;
	/** Commit SHA checked by this run. */
	readonly head_sha: string;
	/** Lifecycle phase. */
	readonly status: CheckStatus;
	/** Outcome, or null until one is available. */
	readonly conclusion: CheckConclusion | null;
	/** Browser URL, or null. */
	readonly html_url: string | null;
	/** External details URL, or null. */
	readonly details_url: string | null;
	/** Integration-provided external ID, or null. */
	readonly external_id: string | null;
	/** Start timestamp, or null. */
	readonly started_at: string | null;
	/** Completion timestamp, or null. */
	readonly completed_at: string | null;
	/** Owning suite, or null. */
	readonly check_suite: {
		/** Numeric check-suite ID. */
		readonly id: number;
	} | null;
	/** Producing integration, or null when unavailable. */
	readonly app: CheckApp | null;
	/** Check output and annotation discovery. */
	readonly output: {
		/** Output title, or null. */
		readonly title: string | null;
		/** Markdown summary, or null. */
		readonly summary: string | null;
		/** Markdown details, or null. */
		readonly text: string | null;
		/** Reported annotation count. */
		readonly annotations_count: number;
		/** Annotations collection URL. */
		readonly annotations_url: string;
	};
}

/** A group of check runs for a commit. */
export interface CheckSuite {
	/** Numeric suite ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Checked commit SHA. */
	readonly head_sha: string;
	/** Head branch, or null. */
	readonly head_branch: string | null;
	/** Lifecycle phase, or null when unavailable. */
	readonly status: CheckStatus | null;
	/** Suite outcome, including suite-only startup failures and stale results. */
	readonly conclusion: CheckConclusion | 'startup_failure' | 'stale' | null;
	/** Producing integration, or null. */
	readonly app: CheckApp | null;
	/** Check-run collection URL. */
	readonly check_runs_url: string;
}

/** One check-run listing page. */
export interface CheckRunsPage {
	/** Total matching runs reported by the server. */
	readonly total_count: number;
	/** Runs on this page. */
	readonly check_runs: readonly CheckRun[];
}

/** One check-suite listing page. */
export interface CheckSuitesPage {
	/** Total matching suites reported by the server. */
	readonly total_count: number;
	/** Suites on this page. */
	readonly check_suites: readonly CheckSuite[];
}

/** A check result associated with a location in a repository file. */
export interface CheckAnnotation {
	/** Repository-relative path. */
	readonly path: string;
	/** First affected line. */
	readonly start_line: number;
	/** Last affected line. */
	readonly end_line: number;
	/** First affected column, or null. */
	readonly start_column: number | null;
	/** Last affected column, or null. */
	readonly end_column: number | null;
	/** Server annotation level, or null. */
	readonly annotation_level: string | null;
	/** Annotation title, or null. */
	readonly title: string | null;
	/** Annotation message, or null. */
	readonly message: string | null;
	/** Additional raw detail, or null. */
	readonly raw_details: string | null;
}

/** Legacy status-context fields common to status history and combined status responses. */
export interface CommitStatus {
	/** Numeric status ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Context name. */
	readonly context: string;
	/** Server state, such as pending, success, failure, or error. */
	readonly state: string;
	/** Description, or null. */
	readonly description: string | null;
	/** Target URL, or null. */
	readonly target_url: string | null;
	/** Creation timestamp. */
	readonly created_at: string;
	/** Last update timestamp. */
	readonly updated_at: string;
}

/** Combined legacy status; this does not include check runs. */
export interface CombinedStatus {
	/** Server's aggregate legacy status. */
	readonly state: string;
	/** Resolved commit SHA. */
	readonly sha: string;
	/** Total legacy status contexts. */
	readonly total_count: number;
	/** Status contexts included on this page. */
	readonly statuses: readonly CommitStatus[];
}

/** Check-run listing filters. */
export type ListCheckRunsOptions = ApiPaginationOptions<PageOptions & {
	/** Exact check name. */
	readonly check_name?: string;
	/** Lifecycle phase filter. */
	readonly status?: CheckStatus;
	/** Latest run per check or all runs. */
	readonly filter?: 'latest' | 'all';
}>;

/** Operations for check runs, check suites, annotations, and commit statuses. */
export interface IChecksClient {

	/** GET /repos/{owner}/{repo}/commits/{ref}/check-runs: list one page of check runs for a commit or ref. */
	listRuns(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ListCheckRunsOptions): Promise<CheckRunsPage>;

	/** GET /repos/{owner}/{repo}/check-runs/{id}: read a single check run. */
	getRun(repository: RepositoryRef, checkRunId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<CheckRun>;

	/** GET /repos/{owner}/{repo}/check-suites/{id}/check-runs: list one page of check runs in a suite. */
	listRunsForSuite(repository: RepositoryRef, suiteId: number, signal: AbortSignal, options?: ListCheckRunsOptions): Promise<CheckRunsPage>;

	/** GET /repos/{owner}/{repo}/commits/{ref}/check-suites: list one page of check suites. */
	listSuites(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<CheckSuitesPage>;

	/** GET /repos/{owner}/{repo}/check-suites/{id}: read a single check suite. */
	getSuite(repository: RepositoryRef, suiteId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<CheckSuite>;

	/** GET /repos/{owner}/{repo}/check-runs/{id}/annotations: list one page of check annotations. */
	listAnnotations(repository: RepositoryRef, checkRunId: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly CheckAnnotation[]>;

	/** GET /repos/{owner}/{repo}/commits/{ref}/status: read combined legacy status and one page of its contexts. */
	getCombinedStatus(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<CombinedStatus>;

	/** GET /repos/{owner}/{repo}/commits/{ref}/statuses: read one page of legacy status history. */
	listStatuses(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly CommitStatus[]>;
}
