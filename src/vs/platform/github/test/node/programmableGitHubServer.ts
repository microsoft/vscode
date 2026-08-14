/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import type * as net from 'net';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IGitHubEndpointProvider } from '../../common/githubTypes.js';

export type GitHubMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type GitHubQueryPrimitive = string | number | boolean;
export type GitHubQueryValue = GitHubQueryPrimitive | readonly GitHubQueryPrimitive[];
export type GitHubQuery = Readonly<Record<string, GitHubQueryValue | undefined>>;
export type CapturedGitHubHeaderValue = string | readonly string[];

export interface IRecordedGraphQLRequest {
	readonly query?: string;
	readonly variables?: unknown;
	readonly operationName?: string;
}

export interface IRecordedGitHubRequest {
	readonly service: 'rest' | 'graphql' | 'unknown';
	readonly method: string;
	readonly url: string;
	readonly pathname: string;
	readonly servicePath: string;
	readonly search: string;
	readonly headers: Readonly<Record<string, CapturedGitHubHeaderValue | undefined>>;
	readonly bodyText: string;
	readonly bodyJson: unknown;
	readonly bodyJsonError?: string;
	readonly graphQl?: IRecordedGraphQLRequest;
}

interface IGitHubResponseBase {
	readonly status?: number;
	readonly headers?: Readonly<Record<string, string>>;
	readonly etag?: string;
	readonly link?: string;
}

export interface IJsonGitHubResponse extends IGitHubResponseBase {
	readonly kind: 'json';
	readonly body: unknown;
}

export interface ITextGitHubResponse extends IGitHubResponseBase {
	readonly kind: 'text';
	readonly body: string;
	readonly contentType?: string;
}

export interface IRawGitHubResponse extends IGitHubResponseBase {
	readonly kind: 'raw';
	readonly body: string | Uint8Array;
	readonly contentType?: string;
}

export interface INotModifiedGitHubResponse extends Omit<IGitHubResponseBase, 'status'> {
	readonly kind: 'notModified';
}

export interface IRedirectGitHubResponse {
	readonly kind: 'redirect';
	readonly location: string;
	readonly status?: 301 | 302 | 307 | 308;
	readonly headers?: Readonly<Record<string, string>>;
}

export interface IDisconnectGitHubResponse {
	readonly kind: 'disconnect';
}

export interface IMalformedJsonGitHubResponse extends Omit<IGitHubResponseBase, 'status'> {
	readonly kind: 'malformedJson';
	readonly status?: number;
	readonly body?: string;
}

export interface IRateLimitGitHubResponse extends IGitHubResponseBase {
	readonly kind: 'rateLimit';
	readonly status?: 403 | 429;
	readonly resource?: string;
	readonly limit?: number;
	readonly remaining?: number;
	readonly used?: number;
	readonly resetAt?: number;
	readonly retryAfterSeconds?: number;
	readonly message?: string;
}

export type GitHubServerResponse =
	| IJsonGitHubResponse
	| ITextGitHubResponse
	| IRawGitHubResponse
	| INotModifiedGitHubResponse
	| IRedirectGitHubResponse
	| IDisconnectGitHubResponse
	| IMalformedJsonGitHubResponse
	| IRateLimitGitHubResponse;

export interface IGitHubGraphQLError {
	readonly message: string;
	readonly type?: string;
	readonly path?: readonly (string | number)[];
	readonly extensions?: {
		readonly code?: string;
	};
}

interface IGitHubServerStepBase {
	readonly label?: string;
	readonly waitFor?: PromiseLike<void>;
	readonly assert?: (request: IRecordedGitHubRequest) => void | Promise<void>;
}

export interface IRestGitHubServerStep extends IGitHubServerStepBase {
	readonly kind: 'rest';
	readonly method?: GitHubMethod;
	readonly path: string;
	readonly query?: string | GitHubQuery;
	readonly response: GitHubServerResponse;
}

export interface IGraphQLGitHubServerStep extends IGitHubServerStepBase {
	readonly kind: 'graphql';
	readonly operationName?: string;
	readonly queryIncludes?: string | readonly string[];
	readonly response: GitHubServerResponse;
}

export type GitHubServerStep = IRestGitHubServerStep | IGraphQLGitHubServerStep;

const restBasePath = '/api/v3';
const graphQlPath = '/api/graphql';

export function gitHubRestStep(step: Omit<IRestGitHubServerStep, 'kind'>): IRestGitHubServerStep {
	return { kind: 'rest', ...step };
}

export function gitHubGraphQLStep(step: Omit<IGraphQLGitHubServerStep, 'kind'>): IGraphQLGitHubServerStep {
	return { kind: 'graphql', ...step };
}

export function gitHubJsonResponse(body: unknown, options: Omit<IJsonGitHubResponse, 'kind' | 'body'> = {}): IJsonGitHubResponse {
	return { kind: 'json', body, ...options };
}

export function gitHubTextResponse(body: string, options: Omit<ITextGitHubResponse, 'kind' | 'body'> = {}): ITextGitHubResponse {
	return { kind: 'text', body, ...options };
}

export function gitHubRawResponse(body: string | Uint8Array, options: Omit<IRawGitHubResponse, 'kind' | 'body'> = {}): IRawGitHubResponse {
	return { kind: 'raw', body, ...options };
}

export function gitHubNotModifiedResponse(options: Omit<INotModifiedGitHubResponse, 'kind'> = {}): INotModifiedGitHubResponse {
	return { kind: 'notModified', ...options };
}

export function gitHubRedirectResponse(location: string, options: Omit<IRedirectGitHubResponse, 'kind' | 'location'> = {}): IRedirectGitHubResponse {
	return { kind: 'redirect', location, ...options };
}

export function gitHubDisconnectResponse(): IDisconnectGitHubResponse {
	return { kind: 'disconnect' };
}

export function gitHubAbortResponse(): IDisconnectGitHubResponse {
	return gitHubDisconnectResponse();
}

export function gitHubMalformedJsonResponse(options: Omit<IMalformedJsonGitHubResponse, 'kind'> = {}): IMalformedJsonGitHubResponse {
	return {
		kind: 'malformedJson',
		body: options.body ?? '{"malformed": true',
		...options,
	};
}

export function gitHubRateLimitResponse(options: Omit<IRateLimitGitHubResponse, 'kind'> = {}): IRateLimitGitHubResponse {
	return { kind: 'rateLimit', ...options };
}

export function gitHubGraphQLResponse<T>(
	data: T | undefined,
	errors: readonly IGitHubGraphQLError[] = [],
	options: Omit<IJsonGitHubResponse, 'kind' | 'body'> = {},
): IJsonGitHubResponse {
	return gitHubJsonResponse({
		data,
		...(errors.length > 0 ? { errors } : {}),
	}, options);
}

/**
 * A loopback-only GitHub test server with an ordered request script.
 */
export class ProgrammableGitHubServer extends Disposable {

	static async start(): Promise<ProgrammableGitHubServer> {
		const http = await import('http');
		const server = new ProgrammableGitHubServer(http.createServer);
		await server._start();
		return server;
	}

	private readonly _server: http.Server;
	private readonly _closeComplete = new DeferredPromise<void>();
	private readonly _disposeRequested = new DeferredPromise<void>();
	private readonly _sockets = new Set<net.Socket>();
	private readonly _steps: GitHubServerStep[] = [];
	private readonly _requests: IRecordedGitHubRequest[] = [];
	private readonly _failures: Error[] = [];
	private _origin = '';
	private _disposed = false;

	private constructor(createServer: typeof http.createServer) {
		super();

		this._server = createServer((request, response) => {
			void this._handle(request, response);
		});
		this._server.on('clientError', (_error, socket) => socket.destroy());
		this._server.on('connection', socket => {
			this._sockets.add(socket);
			socket.on('close', () => this._sockets.delete(socket));
		});
		this._server.on('close', () => {
			void this._closeComplete.complete();
		});
	}

	get origin(): string {
		return this._origin;
	}

	get enterpriseUri(): string {
		return this._origin;
	}

	get apiBaseUrl(): string {
		return `${this._origin}${restBasePath}`;
	}

	get graphQlUrl(): string {
		return `${this._origin}${graphQlPath}`;
	}

	get requests(): readonly IRecordedGitHubRequest[] {
		return this._requests;
	}

	get remainingStepCount(): number {
		return this._steps.length;
	}

	createEndpointService(): IGitHubEndpointProvider {
		return {
			onDidChange: Event.None,
			getApiBaseUri: () => this.apiBaseUrl,
			getGraphQlUri: () => this.graphQlUrl,
		};
	}

	enqueue(...steps: readonly GitHubServerStep[]): this {
		this._steps.push(...steps);
		return this;
	}

	assertSatisfied(): void {
		if (this._failures.length === 1 && this._steps.length === 0) {
			throw this._failures[0];
		}

		const messages: string[] = [];
		if (this._failures.length > 0) {
			messages.push(...this._failures.map(error => `GitHub server failure: ${error.message}`));
		}
		if (this._steps.length > 0) {
			messages.push(`Unconsumed GitHub steps: ${this._steps.map(describeStep).join(', ')}`);
		}

		if (messages.length > 0) {
			throw new Error(messages.join('\n'));
		}
	}

	async disposeAsync(): Promise<void> {
		this.dispose();
		await this._closeComplete.p;
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		void this._disposeRequested.complete();
		for (const socket of this._sockets) {
			socket.destroy();
		}

		if (this._server.listening) {
			this._server.close();
		} else {
			void this._closeComplete.complete();
		}

		super.dispose();
	}

	private async _start(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this._server.off('listening', onListening);
				reject(error);
			};
			const onListening = () => {
				this._server.off('error', onError);
				const address = this._server.address();
				if (!address || typeof address === 'string') {
					reject(new Error('GitHub test server did not expose a TCP address'));
					return;
				}
				this._origin = `http://127.0.0.1:${address.port}`;
				resolve();
			};

			this._server.once('error', onError);
			this._server.once('listening', onListening);
			this._server.listen(0, '127.0.0.1');
		});
	}

	private async _handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
		const step = this._steps.shift();
		if (!step) {
			this._recordFailure(new Error(`Unexpected GitHub request: ${request.method ?? 'GET'} ${request.url ?? '/'}`));
			this._writeFailure(response, new Error('Unexpected GitHub request'));
			return;
		}

		try {
			const captured = await this._captureRequest(request);
			this._requests.push(captured);
			await this._assertStep(step, captured);
			if (step.waitFor) {
				await this._waitForRelease(step.waitFor);
			}
			if (!this._disposed) {
				this._writeResponse(step.response, response);
			}
		} catch (error) {
			if (this._disposed) {
				return;
			}
			const normalized = asError(error);
			this._recordFailure(normalized);
			if (response.headersSent) {
				response.destroy(normalized);
			} else {
				this._writeFailure(response, normalized);
			}
		}
	}

	private async _captureRequest(request: http.IncomingMessage): Promise<IRecordedGitHubRequest> {
		const body = await new Promise<Buffer>((resolve, reject) => {
			const chunks: Buffer[] = [];
			request.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
			request.on('end', () => resolve(Buffer.concat(chunks)));
			request.on('error', reject);
			request.on('aborted', () => reject(new Error('GitHub request aborted before the body completed')));
		});

		const bodyText = body.toString('utf8');
		let bodyJson: unknown = undefined;
		let bodyJsonError: string | undefined;
		if (bodyText.length > 0) {
			try {
				bodyJson = JSON.parse(bodyText);
			} catch (error) {
				bodyJsonError = asError(error).message;
			}
		}

		const url = new URL(request.url ?? '/', this._origin || 'http://127.0.0.1');
		const { service, servicePath } = classifyRequestPath(url.pathname);
		return {
			service,
			method: request.method ?? 'GET',
			url: url.toString(),
			pathname: url.pathname,
			servicePath,
			search: url.search,
			headers: normalizeHeaders(request.headers),
			bodyText,
			bodyJson,
			bodyJsonError,
			graphQl: readGraphQlRequest(bodyJson),
		};
	}

	private async _assertStep(step: GitHubServerStep, request: IRecordedGitHubRequest): Promise<void> {
		const expectedMethod = step.kind === 'graphql' ? 'POST' : step.method;
		if (expectedMethod && request.method !== expectedMethod) {
			throw new Error(`Expected ${expectedMethod} for ${describeStep(step)}, got ${request.method}`);
		}

		if (step.kind === 'rest') {
			if (request.service !== 'rest') {
				throw new Error(`Expected REST request for ${describeStep(step)}, got ${request.pathname}`);
			}
			if (request.servicePath !== normalizePath(step.path)) {
				throw new Error(`Expected REST path ${normalizePath(step.path)}, got ${request.servicePath}`);
			}
			if (step.query !== undefined && !queryMatches(step.query, request.search)) {
				throw new Error(`Expected query ${formatExpectedQuery(step.query)}, got ${request.search || '?'}`);
			}
		} else {
			if (request.service !== 'graphql') {
				throw new Error(`Expected GraphQL request for ${describeStep(step)}, got ${request.pathname}`);
			}
			if (step.operationName !== undefined && request.graphQl?.operationName !== step.operationName) {
				throw new Error(`Expected GraphQL operation ${step.operationName}, got ${request.graphQl?.operationName ?? '<none>'}`);
			}
			const queryFragments = Array.isArray(step.queryIncludes) ? step.queryIncludes : step.queryIncludes ? [step.queryIncludes] : [];
			for (const fragment of queryFragments) {
				if (!request.graphQl?.query?.includes(fragment)) {
					throw new Error(`Expected GraphQL query to include ${JSON.stringify(fragment)}`);
				}
			}
		}

		await step.assert?.(request);
	}

	private async _waitForRelease(waitFor: PromiseLike<void>): Promise<void> {
		await Promise.race([
			Promise.resolve(waitFor),
			this._disposeRequested.p.then(() => Promise.reject(new Error('GitHub server was disposed before the response was released'))),
		]);
	}

	private _writeResponse(step: GitHubServerResponse, response: http.ServerResponse): void {
		switch (step.kind) {
			case 'json':
				this._writeBodyResponse(response, step.status ?? 200, JSON.stringify(step.body), 'application/json', step);
				return;
			case 'text':
				this._writeBodyResponse(response, step.status ?? 200, step.body, step.contentType ?? 'text/plain; charset=utf-8', step);
				return;
			case 'raw':
				this._writeBodyResponse(response, step.status ?? 200, step.body, step.contentType ?? 'application/octet-stream', step);
				return;
			case 'notModified':
				this._applyHeaders(response, step);
				response.writeHead(304);
				response.end();
				return;
			case 'redirect':
				response.writeHead(step.status ?? 302, {
					...step.headers,
					Location: step.location,
				});
				response.end();
				return;
			case 'disconnect':
				response.destroy(new Error('GitHub scripted disconnect'));
				return;
			case 'malformedJson':
				this._writeBodyResponse(response, step.status ?? 200, step.body ?? '{"malformed": true', 'application/json', step);
				return;
			case 'rateLimit': {
				const headers: Record<string, string> = {};
				if (step.limit !== undefined) {
					headers['x-ratelimit-limit'] = String(step.limit);
				}
				if (step.remaining !== undefined) {
					headers['x-ratelimit-remaining'] = String(step.remaining);
				}
				if (step.used !== undefined) {
					headers['x-ratelimit-used'] = String(step.used);
				}
				if (step.resetAt !== undefined) {
					headers['x-ratelimit-reset'] = String(Math.floor(step.resetAt / 1000));
				}
				if (step.retryAfterSeconds !== undefined) {
					headers['retry-after'] = String(step.retryAfterSeconds);
				}
				if (step.resource) {
					headers['x-ratelimit-resource'] = step.resource;
				}
				this._writeBodyResponse(response, step.status ?? 403, JSON.stringify({
					message: step.message ?? 'You have exceeded a secondary rate limit.',
				}), 'application/json', { ...step, headers: { ...headers, ...step.headers } });
				return;
			}
		}
	}

	private _writeBodyResponse(
		response: http.ServerResponse,
		status: number,
		body: string | Uint8Array,
		contentType: string,
		metadata: IGitHubResponseBase,
	): void {
		const rawBody = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
		this._applyHeaders(response, {
			...metadata,
			headers: {
				'Content-Length': String(rawBody.byteLength),
				'Content-Type': contentType,
				...metadata.headers,
			},
		});
		response.writeHead(status);
		response.end(rawBody);
	}

	private _applyHeaders(response: http.ServerResponse, metadata: IGitHubResponseBase): void {
		const headers = {
			...metadata.headers,
			...(metadata.etag ? { ETag: metadata.etag } : undefined),
			...(metadata.link ? { Link: metadata.link } : undefined),
		};
		for (const [name, value] of Object.entries(headers)) {
			response.setHeader(name, value);
		}
	}

	private _writeFailure(response: http.ServerResponse, error: Error): void {
		response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end(error.message);
	}

	private _recordFailure(error: Error): void {
		this._failures.push(error);
	}
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Readonly<Record<string, CapturedGitHubHeaderValue | undefined>> {
	const normalized: Record<string, CapturedGitHubHeaderValue | undefined> = {};
	for (const [name, value] of Object.entries(headers)) {
		if (typeof value === 'string') {
			normalized[name] = value;
		} else if (Array.isArray(value)) {
			normalized[name] = value.slice();
		}
	}
	return normalized;
}

function readGraphQlRequest(bodyJson: unknown): IRecordedGraphQLRequest | undefined {
	if (!bodyJson || typeof bodyJson !== 'object') {
		return undefined;
	}
	const query = Reflect.get(bodyJson, 'query');
	const variables = Reflect.get(bodyJson, 'variables');
	const operationName = Reflect.get(bodyJson, 'operationName');
	return {
		query: typeof query === 'string' ? query : undefined,
		variables,
		operationName: typeof operationName === 'string' ? operationName : undefined,
	};
}

function classifyRequestPath(pathname: string): Pick<IRecordedGitHubRequest, 'service' | 'servicePath'> {
	if (pathname === graphQlPath) {
		return { service: 'graphql', servicePath: '/' };
	}
	if (pathname.startsWith(restBasePath)) {
		const servicePath = pathname.substring(restBasePath.length) || '/';
		return { service: 'rest', servicePath: normalizePath(servicePath) };
	}
	return { service: 'unknown', servicePath: pathname || '/' };
}

function normalizePath(path: string): string {
	if (!path || path === '/') {
		return '/';
	}
	return path.startsWith('/') ? path : `/${path}`;
}

function queryMatches(expected: string | GitHubQuery, actualSearch: string): boolean {
	return JSON.stringify(normalizeQueryEntries(expected)) === JSON.stringify(normalizeQueryEntries(actualSearch));
}

function normalizeQueryEntries(query: string | GitHubQuery): readonly [string, string][] {
	if (typeof query === 'string') {
		const search = query.startsWith('?') ? query.substring(1) : query;
		return Array.from(new URLSearchParams(search).entries()).sort(compareEntries);
	}

	const entries: [string, string][] = [];
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const element of value) {
				entries.push([key, String(element)]);
			}
		} else {
			entries.push([key, String(value)]);
		}
	}
	return entries.sort(compareEntries);
}

function compareEntries(left: readonly [string, string], right: readonly [string, string]): number {
	return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);
}

function formatExpectedQuery(query: string | GitHubQuery): string {
	if (typeof query === 'string') {
		return query.startsWith('?') ? query : `?${query}`;
	}
	const params = new URLSearchParams();
	for (const [key, value] of normalizeQueryEntries(query)) {
		params.append(key, value);
	}
	return `?${params.toString()}`;
}

function describeStep(step: GitHubServerStep): string {
	const label = step.label ? ` (${step.label})` : '';
	return step.kind === 'rest'
		? `REST ${step.method ?? 'ANY'} ${normalizePath(step.path)}${label}`
		: `GraphQL ${step.operationName ?? '<anonymous>'}${label}`;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
