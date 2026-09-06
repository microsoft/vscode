/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FetchOptions, RequestMetadata } from '@vscode/copilot-api';
import { HeadersImpl, Response } from '../../../networking/common/fetcherService';

/** Shape of the content exclusion payload the endpoint returns for a single repo. */
export type MockExclusionRules = {
	paths?: string[];
	ifAnyMatch?: string[];
	ifNoneMatch?: string[];
};

/** Builds a successful content exclusion response for the requested repos. */
export function rulesResponse(rulesByRepo: ReadonlyMap<string, MockExclusionRules>, repos: string[]): Partial<Response> {
	const payload = repos.map(repo => {
		const rules = rulesByRepo.get(repo);
		return {
			last_updated_at: 0,
			rules: rules ? [{ paths: rules.paths ?? [], ifAnyMatch: rules.ifAnyMatch, ifNoneMatch: rules.ifNoneMatch, source: { name: repo, type: 'Repository' } }] : []
		};
	});
	return { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(payload) };
}
/** Builds a failing response, optionally carrying GitHub's rate limit headers. */
export function failureResponse(status: number, headers: Record<string, string> = {}): Partial<Response> {
	return {
		ok: false,
		status,
		statusText: status === 403 ? 'Forbidden' : 'Error',
		headers: new HeadersImpl(headers)
	};
}

/** Builds a rate limited response of the shape api.github.com returns. */
export function rateLimitedResponse(retryAfterSeconds: number): Partial<Response> {
	return failureResponse(429, { 'retry-after': String(retryAfterSeconds) });
}

/**
 * A mock implementation of ICAPIClientService for testing.
 * Records every request so tests can assert on batching and coalescing behaviour.
 * Note: Does not fully implement ICAPIClientService - only the methods needed for tests.
 */
export class MockCAPIClientService {
	declare readonly _serviceBrand: undefined;

	abExpContext: string | undefined = undefined;

	/** Each entry is the list of repos sent in one request, in dispatch order. */
	readonly requestedBatches: string[][] = [];

	private _responder: (repos: string[]) => Partial<Response> = () => ({});
	private _gate: Promise<void> | undefined;
	private _openGate: (() => void) | undefined;

	private readonly _defaultResponse: Response = {
		ok: true,
		status: 200,
		statusText: 'OK',
		headers: new HeadersImpl({}),
		text: () => Promise.resolve('[]'),
		json: () => Promise.resolve([]),
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		body: null,
	} as unknown as Response;

	get requestCount(): number {
		return this.requestedBatches.length;
	}

	/** Every repo requested across all batches, including any duplicates. */
	get requestedRepos(): string[] {
		return this.requestedBatches.flat();
	}

	/** How many times the given repo was asked for. */
	timesRequested(repo: string): number {
		return this.requestedRepos.filter(candidate => candidate === repo).length;
	}

	reset(): void {
		this.requestedBatches.length = 0;
	}

	/**
	 * Sets a responder invoked with the repos of each request, so per-repo rules and
	 * per-attempt failures can be simulated.
	 */
	setResponder(responder: (repos: string[]) => Partial<Response>): void {
		this._responder = responder;
	}

	/** Holds every subsequent request open until {@link releaseRequests}, to model a slow endpoint. */
	blockRequests(): void {
		this._gate = new Promise<void>(resolve => { this._openGate = resolve; });
	}

	releaseRequests(): void {
		this._openGate?.();
		this._gate = undefined;
		this._openGate = undefined;
	}

	makeRequest<T>(_request: FetchOptions, requestMetadata: RequestMetadata): Promise<T> {
		const repos = 'repos' in requestMetadata ? requestMetadata.repos : [];
		// Recorded before awaiting the gate so tests can observe requests while they are in flight.
		this.requestedBatches.push([...repos]);
		const gate = this._gate;
		if (!gate) {
			return Promise.resolve({ ...this._defaultResponse, ...this._responder(repos) } as unknown as T);
		}
		return gate.then(() => ({ ...this._defaultResponse, ...this._responder(repos) }) as unknown as T);
	}
}
