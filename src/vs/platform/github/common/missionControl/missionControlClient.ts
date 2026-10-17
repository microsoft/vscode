/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import { ApiRequest, ApiResponse, IApiRequestProvider } from '../client/request.js';
import { collectPages, nextPagePath, PaginatedApiRequest } from '../client/pagination.js';
import { parse } from '../client/schema.js';
import { normalizeReadApiBaseUri } from '../githubEndpoints.js';
import { GitHubRequestError } from '../githubTypes.js';
import { parseResponseJson } from '../responseReader.js';
import { RequestError, RequestErrorKind } from '../types.js';
import { ActivationContext, ApiError, ApiErrorResponse, CodedApiErrorResponse, PaginatedResponse, User } from './missionControl.js';
import { parseMissionControlErrorCode, MissionControlErrorMetadata } from './missionControlError.js';

/** An approved Mission Control API endpoint and its request-header configuration. */
export interface ApiEndpoint {
	/** The complete HTTPS base, including the Mission Control route prefix. */
	readonly apiBaseUri: string;
	/** The integration identity supplied by the hosting application. */
	readonly integrationId: string;
	/** The optional GitHub API version; omitted unless explicitly configured. */
	readonly apiVersion?: string;
}

/** Endpoint configuration for Mission Control operations. */
export interface MissionControlClientOptions {
	/** The approved Mission Control endpoint, which may use a Copilot-hosted /agents proxy. */
	readonly endpoint: ApiEndpoint;
}

/** An HTTP failure with structured diagnostics but no retained raw response body. */
export class ApiRequestError extends GitHubRequestError implements ApiError {
	readonly code: string | undefined;
	readonly limitedResource: string | undefined;

	constructor(
		/** HTTP status reported by the service. */
		override readonly statusCode: number,
		kind: RequestErrorKind,
		/** Parsed API diagnostics retained with the failure. */
		readonly response?: ApiErrorResponse | CodedApiErrorResponse,
		/** Server request identifier for diagnostics, when supplied. */
		readonly requestId?: string,
		/** Server-directed retry delay, in seconds. */
		readonly retryAfterSeconds?: number,
		/** Set when the dispatched mutation may already have been accepted. */
		readonly outcome?: 'indeterminate',
		metadata?: MissionControlErrorMetadata,
	) {
		const code = metadata?.code ?? response?.error_code ?? (response && hasKey(response, { code: true }) ? response.code : undefined);
		super(`API request failed (HTTP ${statusCode})${code ? ` code=${code}` : ''}${requestId ? ` requestId=${requestId}` : ''}`,
			code === 'rate_limit_exceeded' ? 'rateLimit' : kind, statusCode);
		this.name = 'ApiRequestError';
		this.code = code;
		this.limitedResource = metadata?.limitedResource ?? response?.limited_resource;
	}
}

/** The service may have accepted a mutation whose result is unknown. Check its state before retrying. */
export class MutationUncertainError extends GitHubRequestError {
	/** Indicates that the dispatched mutation may already have taken effect. */
	readonly outcome = 'indeterminate';

	constructor(kind: RequestErrorKind, statusCode?: number) {
		super('The API may have accepted the operation; reconcile before trying again', kind, statusCode);
		this.name = 'MutationUncertainError';
	}
}

export class MissionControlClient {
	/** Validates and normalizes the approved endpoint and integration headers. */
	static normalizeOptions(options: MissionControlClientOptions | undefined): MissionControlClientOptions | undefined {
		return options && Object.freeze({
			endpoint: normalizeEndpoint(options.endpoint),
		});
	}

	constructor(private readonly _provider?: IApiRequestProvider) { }

	async requestPages<T>(request: PaginatedApiRequest, signal: AbortSignal, parser: (response: ApiResponse) => T, merge: (pages: readonly T[]) => T): Promise<T> {
		const { maxPages, pageLimitBehavior, ...options } = request.options ?? {};
		if (maxPages === undefined) {
			const data = await this.request({ ...request, options }, signal, parser);
			signal.throwIfAborted();
			return data;
		}
		const response = await collectPages(
			request.path,
			path => this.request({ ...request, path: path ?? request.path, options }, signal, response => ({ ...response, data: parser(response) })),
			page => nextPagePath(page.metadata),
			pages => ({ ...pages[pages.length - 1], data: merge(pages.map(page => page.data)) }),
			signal,
			{ maxPages, pageLimitBehavior },
		);
		return response.data;
	}

	/** Executes a Mission Control request and returns the result of the response parser. */
	async request<T>(request: ApiRequest, signal: AbortSignal, parser: (response: ApiResponse<unknown>) => T): Promise<T> {
		signal.throwIfAborted();
		const provider = this._provider;
		if (!provider) {
			throw new GitHubRequestError('No approved Mission Control API endpoint is configured for this client', 'validation');
		}
		const operation: ApiRequest = {
			...request,
			authentication: 'required',
			accept: request.accept ?? 'application/json',
		};
		const response = request.responseBody === 'none'
			? await provider.request({ ...operation, responseBody: 'none' }, signal)
			: await provider.request({ ...operation, responseBody: 'text' }, signal, parse.string);
		try {
			signal.throwIfAborted();
			const data = request.responseBody === 'text' || typeof response.data !== 'string'
				? response.data
				: parseResponseJson<unknown>(response.data, () => new GitHubRequestError('API response was not valid JSON', 'malformedResponse', response.status));
			return parser({ ...response, data });
		} catch (error) {
			if (missionControlRequestPolicy(operation).mutation) {
				throw new MutationUncertainError(error instanceof RequestError ? error.kind : 'unknown', error instanceof RequestError ? error.statusCode : undefined);
			}
			throw error;
		}
	}
}

export const parseMissionControlOptions = parse.object<MissionControlClientOptions>({
	endpoint: parse.object<ApiEndpoint>({
		apiBaseUri: parse.nonEmptyString, integrationId: parse.nonEmptyString, apiVersion: parse.optional(parse.string),
	}),
});

/** Returns the mutation, sensitivity, and retry rules for a Mission Control request. */
export function missionControlRequestPolicy(request: Pick<ApiRequest, 'method' | 'path' | 'policy'>): { mutation: boolean; sensitive: boolean; retry: false | undefined } {
	let path: string;
	try {
		path = decodeURIComponent(new URL(`https://api.invalid${request.path}`).pathname);
	} catch {
		throw new GitHubRequestError('Invalid Mission Control path encoding', 'validation');
	}
	const environment = path === '/environments' || path.startsWith('/environments/');
	const credential = request.policy?.credential === true || environment && /\/(?:connect|reconnect)$/.test(path);
	const mutation = request.method !== 'GET' || credential;
	return {
		mutation,
		sensitive: environment || credential || request.policy?.sensitive === true,
		retry: mutation || /^\/tasks\/[^/]+\/events$/.test(path) ? false : request.policy?.retry,
	};
}

/** Validates an advertised Mission Control environment kind. */
export const parseEnvironmentKind = parse.oneOf('managed-actions', 'managed-sandbox', 'managed-cca', 'user-local', 'user-codespace');

/** Parses a Mission Control user reference. */
export const parseUser = parse.object<User>({
	id: parse.optional(parse.integer),
	login: parse.optional(parse.string),
	node_id: parse.optional(parse.string),
	url: parse.optional(parse.string),
});

/** Parses activation trace metadata and validates the version and canonical positive uint64 sequence. */
export const parseActivationContext = parse.object<ActivationContext>({
	version: parse.exact(2),
	sequence: parse.refine(
		parse.string,
		sequence => /^[1-9]\d{0,19}$/.test(sequence) && BigInt(sequence) <= 18446744073709551615n,
		'Invalid activation sequence',
	),
	traceparent: parse.string,
	tracestate: parse.optional(parse.string),
});

/** Parses the API's structured error response. */
export const parseApiError: parse.Parser<ApiErrorResponse | CodedApiErrorResponse> = parse.object({
	message: parse.string,
	code: value => parseMissionControlErrorCode(value),
	error_code: value => parseMissionControlErrorCode(value),
	limited_resource: value => parseMissionControlErrorCode(value),
	documentation_url: parse.string,
	errors: parse.optional(parse.arrayOf(parse.object({
		code: parse.oneOf('missing', 'missing_field', 'invalid', 'already_exists', 'unprocessable', 'active_limit_reached', 'revision_limit_reached', 'custom'),
		message: parse.optional(parse.string),
	}))),
	activation_context: parse.optional(parseActivationContext),
});

function normalizeEndpoint(endpoint: ApiEndpoint): ApiEndpoint {
	const apiBaseUri = normalizeReadApiBaseUri(endpoint.apiBaseUri);
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(endpoint.integrationId)
		|| endpoint.apiVersion !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(endpoint.apiVersion)) {
		throw new GitHubRequestError('Invalid API endpoint or headers', 'validation');
	}
	return Object.freeze({ apiBaseUri, integrationId: endpoint.integrationId, apiVersion: endpoint.apiVersion });
}

/** Combines page data with pagination and server-time metadata. */
export function paginated<T>(response: ApiResponse<unknown>, data: T): PaginatedResponse<T> {
	return { data, nextLink: response.metadata?.nextLink, serverDate: response.metadata?.serverDate };
}
