/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { numberSegment, pathSegment, withQuery, repositoryPath } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { CheckAnnotation, CheckApp, CheckRun, CheckRunsPage, CheckSuite, CheckSuitesPage, CombinedStatus, CommitStatus, IChecksClient, ListCheckRunsOptions } from './checks.js';
import { CoreClient, parseCheckConclusion, parseCheckStatus } from './coreClient.js';

export class ChecksClient implements IChecksClient {
	constructor(private readonly _client: CoreClient) { }

	async listRuns(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ListCheckRunsOptions): Promise<CheckRunsPage> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'checks',
				method: 'GET',
				path: withQuery(`${repositoryPath(repository)}/commits/${pathSegment(commitRef)}/check-runs`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseRuns,
			pages => ({
				...pages[pages.length - 1],
				check_runs: pages.flatMap(page => page.check_runs)
			})
		);
	}

	async getRun(repository: RepositoryRef, checkRunId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<CheckRun> {
		return this._client.request({
			domain: 'checks',
			method: 'GET',
			path: `${repositoryPath(repository)}/check-runs/${numberSegment(checkRunId)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseRun);
	}

	async listRunsForSuite(repository: RepositoryRef, suiteId: number, signal: AbortSignal, options?: ListCheckRunsOptions): Promise<CheckRunsPage> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'checks',
				method: 'GET',
				path: withQuery(`${repositoryPath(repository)}/check-suites/${numberSegment(suiteId)}/check-runs`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseRuns,
			pages => ({
				...pages[pages.length - 1],
				check_runs: pages.flatMap(page => page.check_runs)
			})
		);
	}

	async listSuites(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<CheckSuitesPage> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'checks',
				method: 'GET',
				path: withQuery(`${repositoryPath(repository)}/commits/${pathSegment(commitRef)}/check-suites`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseSuites,
			pages => ({
				...pages[pages.length - 1],
				check_suites: pages.flatMap(page => page.check_suites)
			})
		);
	}

	async getSuite(repository: RepositoryRef, suiteId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<CheckSuite> {
		return this._client.request({
			domain: 'checks',
			method: 'GET',
			path: `${repositoryPath(repository)}/check-suites/${numberSegment(suiteId)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseSuite);
	}

	async listAnnotations(repository: RepositoryRef, checkRunId: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly CheckAnnotation[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'checks',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/check-runs/${numberSegment(checkRunId)}/annotations`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseAnnotations, mergeArrayPages);
	}

	async getCombinedStatus(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<CombinedStatus> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'checks',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/commits/${pathSegment(commitRef)}/status`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseCombinedStatus, pages => ({ ...pages[pages.length - 1], statuses: pages.flatMap(page => page.statuses) }));
	}

	async listStatuses(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly CommitStatus[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'checks',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/commits/${pathSegment(commitRef)}/statuses`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseStatuses, mergeArrayPages);
	}
}

const parseApp = parse.object<CheckApp>({
	id: parse.integer,
	slug: parse.optional(parse.string),
	name: parse.string,
});

const parseRun = parse.object<CheckRun>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	name: parse.string,
	head_sha: parse.nonEmptyString,
	status: parseCheckStatus,
	conclusion: parse.nullable(parseCheckConclusion),
	html_url: parse.nullable(parse.string),
	details_url: parse.nullable(parse.string),
	external_id: parse.nullable(parse.string),
	started_at: parse.nullable(parse.dateTime),
	completed_at: parse.nullable(parse.dateTime),
	check_suite: parse.nullable(parse.object({
		id: parse.integer
	})),
	app: parse.nullable(parseApp),
	output: parse.object({
		title: parse.nullable(parse.string),
		summary: parse.nullable(parse.string),
		text: parse.nullable(parse.string),
		annotations_count: parse.nonNegativeInteger,
		annotations_url: parse.nonEmptyString,
	}),
});

const parseRuns = parse.object<CheckRunsPage>({
	total_count: parse.nonNegativeInteger,
	check_runs: parse.arrayOf(parseRun)
});

const parseSuite = parse.object<CheckSuite>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	head_sha: parse.nonEmptyString,
	head_branch: parse.nullable(parse.string),
	status: parse.nullable(parseCheckStatus),
	conclusion: parse.nullable(parse.oneOf('success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'startup_failure', 'stale')),
	app: parse.nullable(parseApp),
	check_runs_url: parse.nonEmptyString,
});

const parseSuites = parse.object<CheckSuitesPage>({
	total_count: parse.nonNegativeInteger,
	check_suites: parse.arrayOf(parseSuite)
});

const parseAnnotations = parse.arrayOf(parse.object<CheckAnnotation>({
	path: parse.string,
	start_line: parse.integer,
	end_line: parse.integer,
	start_column: parse.nullable(parse.integer),
	end_column: parse.nullable(parse.integer),
	annotation_level: parse.nullable(parse.string),
	title: parse.nullable(parse.string),
	message: parse.nullable(parse.string),
	raw_details: parse.nullable(parse.string),
}));

const parseStatus = parse.object<CommitStatus>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	context: parse.string,
	state: parse.string,
	description: parse.nullable(parse.string),
	target_url: parse.nullable(parse.string),
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
});

const parseStatuses = parse.arrayOf(parseStatus);

const parseCombinedStatus = parse.object<CombinedStatus>({
	state: parse.string,
	sha: parse.nonEmptyString,
	total_count: parse.nonNegativeInteger,
	statuses: parseStatuses,
});
