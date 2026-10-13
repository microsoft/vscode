/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { parse, SchemaError } from '../client/schema.js';
import { IGitHubCredentials, withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { nextLink } from '../githubResponse.js';
import { IGitHubTransport } from '../githubTransport.js';
import { GitHubRequestError } from '../githubTypes.js';
import { parseResponseJson } from '../responseReader.js';
import { AccountHandle, RequestError, RequestErrorKind } from '../types.js';
import { ActivationContext, ApiError, ApiErrorResponse, CodedApiErrorResponse, PaginatedResponse, User } from './missionControl.js';

/** An explicitly approved API base and the headers allowed to accompany its credential. */
export interface ApiEndpoint {
	/** The complete HTTPS base, including /agents for Mission Control and no route for Copilot. */
	readonly apiBaseUri: string;
	/** The integration identity supplied by the hosting application. */
	readonly integrationId: string;
	/** The optional GitHub API version; omitted for Copilot unless explicitly configured. */
	readonly apiVersion?: string;
}

/** Trusted endpoints shared by the account client's Mission Control domains. */
export interface MissionControlClientOptions {
	/** The approved Mission Control endpoint, which may use a Copilot-hosted /agents proxy. */
	readonly endpoint: ApiEndpoint;
	/** The separately approved Copilot API endpoint used for model discovery. */
	readonly copilotEndpoint?: ApiEndpoint;
}

/** A domain operation with explicit success, retry, and response-body semantics. */
export interface ApiRequest {
	/** The HTTP method for the operation. */
	readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	/** An encoded path relative to the approved endpoint. */
	readonly path: string;
	/** The explicitly selected API, defaulting to Mission Control. */
	readonly api?: 'copilot';
	/** The JSON request body, preserving omitted fields and explicit empty values. */
	readonly body?: object;
	/** The accepted response representation, defaulting to application/json. */
	readonly accept?: string;
	/** The documented successful HTTP statuses. */
	readonly expectedStatus: readonly number[];
	/** Disable the single transient retry available to ordinary GETs. */
	readonly retry?: false;
	/** Credential-minting GETs have mutation semantics. */
	readonly credential?: boolean;
	/** Disable caching/sharing and suppress errors from endpoints that may return credentials. */
	readonly sensitive?: boolean;
	/** Ignore a successful body when the operation only acknowledges completion. */
	readonly responseBody?: 'none';
}

/** A buffered response and the metadata required by domain-level parsing. */
export interface ApiResponse {
	/** The parsed JSON body, or undefined for a bodyless acknowledgement. */
	readonly data: unknown;
	/** The successful HTTP status returned by the service. */
	readonly status: number;
	/** The collection's Link header when available. */
	readonly link?: string;
	/** The server's Date header when available. */
	readonly serverDate?: string;
	/** The server-directed delay in seconds, without an invented default. */
	readonly retryAfterSeconds?: number;
}

/** An HTTP failure with structured diagnostics but no retained raw response body. */
export class ApiRequestError extends GitHubRequestError implements ApiError {
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
	) {
		super(response?.message ?? `API request failed (HTTP ${statusCode})`, kind, statusCode);
		this.name = 'ApiRequestError';
	}
}

/** A dispatched mutation must be reconciled rather than blindly submitted again. */
export class MutationUncertainError extends GitHubRequestError {
	/** Indicates that the dispatched mutation may already have taken effect. */
	readonly outcome = 'indeterminate';

	constructor(kind: RequestErrorKind, statusCode?: number) {
		super('The API may have accepted the operation; reconcile before trying again', kind, statusCode);
		this.name = 'MutationUncertainError';
	}
}

export class MissionControlClient extends Disposable {
	private readonly _options: MissionControlClientOptions | undefined;
	private readonly _lifetime = new AbortController();

	/** Canonicalizes trusted configuration for client lease identity and request routing. */
	static normalizeOptions(options: MissionControlClientOptions | undefined): MissionControlClientOptions | undefined {
		return options && Object.freeze({
			endpoint: normalizeEndpoint(options.endpoint),
			copilotEndpoint: options.copilotEndpoint ? normalizeEndpoint(options.copilotEndpoint) : undefined,
		});
	}

	constructor(
		options: MissionControlClientOptions | undefined,
		private readonly _credentials: IGitHubCredentials,
		private readonly _transport: IGitHubTransport,
		private readonly _logService?: ILogService,
	) {
		super();
		this._options = MissionControlClient.normalizeOptions(options);
		this._register(_credentials.onDidInvalidate(({ credential }) => {
			if (credential) {
				for (const endpoint of [this._options?.endpoint, this._options?.copilotEndpoint]) {
					if (endpoint) {
						this._transport.invalidateAccount(serviceAccount(endpoint, credential.account), credential.signal.reason);
					}
				}
			}
		}));
	}

	/** Executes through the account's existing credentials and transport, then parses the domain response. */
	async request<T>(request: ApiRequest, signal: AbortSignal, parser: (response: ApiResponse) => T): Promise<T> {
		const operationSignal = AbortSignal.any([signal, this._lifetime.signal]);
		operationSignal.throwIfAborted();
		const endpoint = request.api === 'copilot' ? this._options?.copilotEndpoint : this._options?.endpoint;
		if (!endpoint) {
			throw new GitHubRequestError('No approved Mission Control API endpoint is configured for this client', 'validation');
		}
		const url = requestUrl(endpoint, request.path);
		const credential = await withGitHubCredentialDeadline(operationSignal, signal => this._credentials.getCredential(signal));
		const combinedSignal = AbortSignal.any([operationSignal, credential.signal]);
		combinedSignal.throwIfAborted();
		const mutation = request.method !== 'GET' || request.credential === true;
		const sensitive = request.sensitive === true || request.credential === true;
		let dispatched = false;
		try {
			const response = await this._transport.rest<unknown>(serviceAccount(endpoint, credential.account), credential.token, {
				method: request.method,
				url,
				body: request.body,
				accept: request.accept ?? 'application/json',
				apiVersion: endpoint.apiVersion ?? null,
				integrationId: endpoint.integrationId,
				rateLimitResource: 'agents',
				caller: 'github.missionControl',
				priority: mutation ? 'mutation' : 'interactive',
				retry: mutation ? false : request.retry,
				etag: !sensitive,
				coalesce: sensitive ? false : undefined,
				followRedirects: false,
				responseBody: request.responseBody,
				onDidDispatch: mutation ? () => { dispatched = true; } : undefined,
			}, combinedSignal);
			combinedSignal.throwIfAborted();
			const status = response.statusCode === 304 ? response.revalidatedStatusCode : response.statusCode;
			if (status === undefined || !request.expectedStatus.includes(status)) {
				throw new GitHubRequestError('API returned an unexpected success status', 'malformedResponse', response.statusCode);
			}
			return parser({
				data: response.data,
				status,
				link: response.link,
				serverDate: response.serverDate,
				retryAfterSeconds: response.retryAfterSeconds,
			});
		} catch (error) {
			this._credentials.handleRequestError(credential, error);
			if (error instanceof GitHubRequestError && error.statusCode !== undefined && error.responseMetadata) {
				let details: ApiErrorResponse | CodedApiErrorResponse | undefined;
				if (error.responseBody && !sensitive) {
					try {
						details = parseApiError(parseResponseJson<unknown>(error.responseBody, () => new SchemaError('API error body was not JSON')));
					} catch (error) {
						if (!(error instanceof SchemaError)) {
							throw error;
						}
						this._logService?.debug('[MissionControlClient] HTTP failure did not contain a supported error envelope');
					}
				}
				throw new ApiRequestError(error.statusCode, error.kind, details,
					error.responseMetadata.requestId, error.responseMetadata.retryAfterSeconds,
					mutation && dispatched && error.statusCode >= 500 ? 'indeterminate' : undefined);
			}
			if (mutation && dispatched) {
				throw new MutationUncertainError(error instanceof RequestError ? error.kind : 'unknown', error instanceof RequestError ? error.statusCode : undefined);
			}
			if (error instanceof RequestError && error.kind === 'network') {
				throw new GitHubRequestError('API network request failed', 'network');
			}
			throw error;
		}
	}

	/** Cancels this client's queued and in-flight operations before disposing owned resources. */
	override dispose(): void {
		this._lifetime.abort(new GitHubRequestError('API client was disposed', 'unknown'));
		super.dispose();
	}
}

/** Validates an advertised Mission Control environment kind. */
export const parseEnvironmentKind = parse.oneOf('managed-actions', 'managed-sandbox', 'managed-cca', 'user-local', 'user-codespace');

/** Parses a user reference while preserving omitted fields. */
export const parseUser = parse.object<User>({
	id: parse.optional(parse.integer),
	login: parse.optional(parse.string),
	node_id: parse.optional(parse.string),
	url: parse.optional(parse.string),
});

/** Parses activation trace metadata and validates the version and unsigned 64-bit sequence. */
export const parseActivationContext = parse.object<ActivationContext>({
	version: parse.oneOf(2),
	sequence: parse.refine(
		parse.string,
		sequence => /^\d{1,20}$/.test(sequence) && BigInt(sequence) <= 18446744073709551615n,
		'Invalid activation sequence',
	),
	traceparent: parse.string,
	tracestate: parse.optional(parse.string),
});

/** Retains only documented error fields, never an arbitrary response body. */
const parseApiError: parse.Parser<ApiErrorResponse | CodedApiErrorResponse> = parse.object({
	message: parse.string,
	code: parse.optional(parse.string),
	documentation_url: parse.string,
	errors: parse.optional(parse.arrayOf(parse.object({
		code: parse.oneOf('missing', 'missing_field', 'invalid', 'already_exists', 'unprocessable', 'active_limit_reached', 'revision_limit_reached', 'custom'),
		message: parse.optional(parse.string),
	}))),
	activation_context: parse.optional(parseActivationContext),
});

function normalizeEndpoint(endpoint: ApiEndpoint): ApiEndpoint {
	let url: URL;
	try {
		url = new URL(endpoint.apiBaseUri);
	} catch {
		throw new GitHubRequestError('Invalid API endpoint', 'validation');
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
		|| !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(endpoint.integrationId)
		|| endpoint.apiVersion !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(endpoint.apiVersion)) {
		throw new GitHubRequestError('Invalid API endpoint or headers', 'validation');
	}
	return Object.freeze({ apiBaseUri: url.href.replace(/\/+$/, ''), integrationId: endpoint.integrationId, apiVersion: endpoint.apiVersion });
}

function serviceAccount(endpoint: ApiEndpoint, account: AccountHandle): AccountHandle {
	return {
		host: new URL(endpoint.apiBaseUri).host,
		accountId: JSON.stringify([account.host.toLowerCase(), account.accountId]),
	};
}

function requestUrl(endpoint: ApiEndpoint, path: string): string {
	const base = new URL(endpoint.apiBaseUri);
	const url = new URL(`${endpoint.apiBaseUri}${path}`);
	if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n\t]/.test(path)
		|| url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/+$/, '')}/`)
		|| url.username || url.password || url.hash) {
		throw new GitHubRequestError('API request escaped its approved endpoint', 'validation');
	}
	return url.href;
}

/** Combines a parsed page with the server's continuation link and Date metadata. */
export function paginated<T>(response: ApiResponse, data: T): PaginatedResponse<T> {
	return { data, nextLink: nextLink(response.link), serverDate: response.serverDate };
}
