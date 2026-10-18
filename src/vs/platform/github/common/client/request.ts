/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { GitHubRequestError, MissingCommitError } from '../githubTypes.js';
import { parseResponseJson } from '../responseReader.js';
import { RequestPriority } from '../types.js';
import { ContentType } from './headers.js';
import { parse } from './schema.js';

/** Caller attribution, scheduling, cache policy, and an optional tighter absolute request deadline. */
export interface ApiRequestOptions {
	/** The identifier of the caller making the request, for attribution purposes. */
	readonly caller?: string;
	/** An optional absolute deadline for the request, expressed as a Unix timestamp in milliseconds. */
	readonly deadline?: number;
	/** Scheduling lane; omission preserves the provider's default for the operation. */
	readonly priority?: RequestPriority;
	/** Bypasses transport response-cache reads and writes without disabling compatible in-flight sharing. */
	readonly noCache?: boolean;
}

/** Request options with separately scoped API query parameters. */
export interface ApiQueryOptions<TQuery> extends ApiRequestOptions {
	readonly query?: TQuery;
}

/** Opt-in limits for collecting a paginated result. */
export interface PaginationOptions {
	/** Maximum pages to collect, including the initial page; omission requests only that page. */
	readonly maxPages?: number;
	/** Behavior when more pages remain at maxPages; defaults to throw. Ignored when maxPages is omitted. */
	readonly pageLimitBehavior?: 'throw' | 'returnPartial';
}

/** Query and request options for an API that supports page collection. */
export interface ApiPaginationOptions<TQuery> extends ApiQueryOptions<TQuery>, PaginationOptions { }

/** An API-relative operation; credentials and conditional-request headers belong to the provider. */
export interface ApiRequest {
	/** HTTP method. */
	readonly method: 'HEAD' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	/** Encoded REST/raw-relative path; '/' selects the fixed GraphQL endpoint. */
	readonly path: string;
	/** JSON request payload, serialized once before crossing the execution boundary. */
	readonly body?: object;
	/** Required authentication rejects an anonymous client without prompting for sign-in. */
	readonly authentication?: 'optional' | 'required';
	/** Expected HTTP status code, or a nonempty list of accepted status codes. */
	readonly expectedStatus: number | readonly number[];
	/** Accepted response content type. */
	readonly accept?: ContentType;
	/** Response body type (defaults to 'json'). */
	readonly responseBody?: 'json' | 'text' | 'none';
	/** Manual redirects expose a download target without forwarding credentials to it. */
	readonly redirect?: 'manual';
	/** Caller-owned execution options for this request. */
	readonly options?: ApiRequestOptions;
	/** The request's cache and retry policy. */
	readonly policy?: {
		readonly retry?: false;
		readonly credential?: boolean;
		readonly sensitive?: boolean;
		readonly rateLimitResource?: 'agents:sandbox';
	};
}

/** Semantic response hints, not a transport header collection. */
export interface ApiResponseMetadata {
	readonly nextLink?: string;
	/** Validated API-relative continuation, or null when an advertised continuation is invalid. */
	readonly nextPath?: string | null;
	readonly serverDate?: string;
	readonly retryAfterSeconds?: number;
}

/** A decoded response without exposing transport-owned headers or cache state. */
export interface ApiResponse<T = unknown> {
	readonly data: T;
	/** Retains accepted-but-not-completed outcomes such as HTTP 202. */
	readonly status: number;
	readonly metadata?: ApiResponseMetadata;
}

/** Provider for executing API requests. */
export interface IApiRequestProvider {

	/** Executes an API request and returns the parsed response. */
	request(request: ApiRequest & { readonly responseBody: 'none' }, signal: AbortSignal): Promise<ApiResponse<void>>;

	/** Executes an API request and returns the parsed response with the specified parser. */
	request<T>(request: ApiRequest & { readonly responseBody?: 'json' | 'text' }, signal: AbortSignal, parser: parse.Parser<T>): Promise<ApiResponse<T>>;

	/** Forwards a dynamically selected response mode and parser for runtime validation. */
	request<T>(request: ApiRequest, signal: AbortSignal, parser: parse.Parser<T> | undefined): Promise<ApiResponse<T | void>>;
}

/** Shares body serialization, response parsing, and lease cancellation across execution providers. */
export abstract class BufferedApiRequestProvider implements IApiRequestProvider {
	constructor(private readonly clientSignal?: AbortSignal) { }

	request(request: ApiRequest & { readonly responseBody: 'none' }, signal: AbortSignal): Promise<ApiResponse<void>>;
	request<T>(request: ApiRequest & { readonly responseBody?: 'json' | 'text' }, signal: AbortSignal, parser: parse.Parser<T>): Promise<ApiResponse<T>>;
	request<T>(request: ApiRequest, signal: AbortSignal, parser: parse.Parser<T> | undefined): Promise<ApiResponse<T | void>>;
	async request<T>(request: ApiRequest, signal: AbortSignal, parser?: parse.Parser<T>): Promise<ApiResponse<T | void>> {
		signal.throwIfAborted();
		this.clientSignal?.throwIfAborted();
		const bodyText = serializeRequestBody(request.body);
		let response: ApiResponse<string | undefined>;
		try {
			response = await this.requestText(request, signal, bodyText);
		} catch (error) {
			if (isMissingCommitResponse(error)) {
				throw new MissingCommitError(error);
			}
			throw error;
		}
		return parseResponse(request, response, parser);
	}

	async requestText(request: Omit<ApiRequest, 'body'>, signal: AbortSignal, bodyText?: string): Promise<ApiResponse<string | undefined>> {
		signal = this.clientSignal ? AbortSignal.any([signal, this.clientSignal]) : signal;
		signal.throwIfAborted();
		const response = await this.execute(request, signal, bodyText);
		this.checkResponseCancellation(request, signal);
		return response;
	}

	protected checkResponseCancellation(_request: Omit<ApiRequest, 'body'>, signal: AbortSignal): void {
		signal.throwIfAborted();
	}

	protected abstract execute(request: Omit<ApiRequest, 'body'>, signal: AbortSignal, bodyText?: string): Promise<ApiResponse<string | undefined>>;
}

const parseErrorMessage = parse.object({ message: parse.string });

function isMissingCommitResponse(error: unknown): error is GitHubRequestError {
	if (!(error instanceof GitHubRequestError) || error instanceof MissingCommitError || error.statusCode !== 422 || !error.responseBody) {
		return false;
	}
	try {
		return parseErrorMessage(JSON.parse(error.responseBody)).message.startsWith('No commit found for SHA: ');
	} catch {
		return false;
	}
}

const parseStatus = parse.range(100, 599);
const parseStatuses = parse.refine(parse.arrayOf(parseStatus), statuses => statuses.length > 0, 'Expected at least one HTTP status');

/** Validates wire metadata without parsing the separately serialized request body. */
export const parseRequest = parse.object<Omit<ApiRequest, 'body'>>({
	method: parse.oneOf('HEAD', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
	path: parse.refine(parse.nonEmptyString, path => path.startsWith('/') && !path.startsWith('//') && !/[\\#\r\n]/.test(path), 'Expected an API-relative path'),
	authentication: parse.optional(parse.oneOf('optional', 'required')),
	expectedStatus: value => typeof value === 'number' ? parseStatus(value) : parseStatuses(value),
	accept: parse.optional(parse.oneOf<ContentType>(
		'application/json',
		'application/vnd.github.ahp+json',
		'application/vnd.github+json',
		'application/vnd.github.object+json',
		'application/vnd.github.raw+json',
		'application/vnd.github.sha',
		'application/vnd.github.diff',
		'application/vnd.github.patch',
		'text/plain, application/octet-stream',
		'text/event-stream, application/json',
	)),
	responseBody: parse.optional(parse.oneOf('json', 'text', 'none')),
	redirect: parse.optional(parse.exact('manual')),
	options: parse.optional(parse.object<ApiRequestOptions>({
		caller: parse.optional(parse.refine(parse.string, caller => caller.trim().length > 0, 'Expected a non-empty caller')),
		deadline: parse.optional(parse.finiteNumber),
		priority: parse.optional(parse.oneOf<RequestPriority>('mutationReconciliation', 'mutation', 'interactive', 'mergeGate', 'visible', 'background', 'enrichment')),
		noCache: parse.optional(parse.boolean),
	})),
	policy: parse.optional(parse.object({
		retry: parse.optional(parse.exact(false)),
		credential: parse.optional(parse.boolean),
		sensitive: parse.optional(parse.boolean),
		rateLimitResource: parse.optional(parse.exact('agents:sandbox')),
	})),
});

/** Serializes a request payload once, without accepting an already-serialized string as JSON. */
export function serializeRequestBody(body: object | undefined): string | undefined {
	if (body === undefined) {
		return undefined;
	}
	const bodyText = JSON.stringify(body);
	if (bodyText === undefined) {
		throw new GitHubRequestError('GitHub request body did not serialize to JSON', 'validation');
	}
	return bodyText;
}

/** Decodes a buffered response in the calling process, leaving HTTP headers in the engine. */
export function parseResponse<T>(request: ApiRequest, response: ApiResponse<string | undefined>, parser?: parse.Parser<T>): ApiResponse<T | void> {
	if (!asArray(request.expectedStatus).includes(response.status)) {
		throw new GitHubRequestError('Unexpected GitHub response status', 'malformedResponse', response.status);
	}
	if (request.responseBody === 'none') {
		return { ...response, data: undefined };
	}
	if (response.data === undefined || !parser) {
		throw new GitHubRequestError('Expected a GitHub response body and parser', 'malformedResponse', response.status);
	}
	const value = request.responseBody === 'text'
		? response.data
		: parseResponseJson<unknown>(response.data, () => new GitHubRequestError('Invalid GitHub JSON response', 'malformedResponse', response.status));
	return { ...response, data: parser(value) };
}
