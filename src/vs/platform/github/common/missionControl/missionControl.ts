/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A repository addressed by its owner login and name. */
export interface RepositoryRef {
	/** The repository owner's login, compared case-insensitively. */
	readonly owner: string;
	/** The repository name, compared case-insensitively. */
	readonly name: string;
}

/** A user reference returned by Mission Control. */
export interface User {
	/** The unique numeric identifier of the user. */
	readonly id?: number;
	/** The user's login name. */
	readonly login?: string;
	/** The user's global relay identifier. */
	readonly node_id?: string;
	/** The URL of the user's profile. */
	readonly url?: string;
}

/** The class of compute backing an environment. */
export type EnvironmentKind = 'managed-actions' | 'managed-sandbox' | 'managed-cca' | 'user-local' | 'user-codespace';

/** Query parameters selecting one page of a REST collection. */
export interface PaginationOptions {
	/** The one-based page number, defaulting to 1. */
	readonly page?: number;
	/** The number of results per page, from 1 to 100 and defaulting to 30. */
	readonly per_page?: number;
}

/** One response page with the HTTP metadata needed to continue a collection scan. */
export interface PaginatedResponse<T> {
	/** The response body for this page, without fetching or hydrating other records. */
	readonly data: T;
	/** The URL from Link rel="next", omitted when no next page is advertised. */
	readonly nextLink?: string;
	/** The HTTP Date header, when available, for server-clock incremental checkpoints. */
	readonly serverDate?: string;
}

/** Telemetry-only W3C context for a provisioning or wake activation. */
export interface ActivationContext {
	/** The activation context schema version. */
	readonly version: 2;
	/** The unsigned 64-bit activation sequence encoded as a decimal string. */
	readonly sequence: string;
	/** The W3C traceparent identifying the activation trace. */
	readonly traceparent: string;
	/** The optional W3C tracestate accompanying the traceparent. */
	readonly tracestate?: string;
}

/** A single validation error reported by the API. */
export interface ApiErrorDetail {
	/** The machine-readable validation error code. */
	readonly code: 'missing' | 'missing_field' | 'invalid' | 'already_exists' | 'unprocessable' | 'active_limit_reached' | 'revision_limit_reached' | 'custom';
	/** The human-readable explanation, populated for custom errors. */
	readonly message?: string;
}

/** A structured error response following the REST API error conventions. */
export interface ApiErrorResponse {
	/** A summary of the request failure. */
	readonly message: string;
	/** The URL of the relevant API documentation. */
	readonly documentation_url: string;
	/** Validation details returned with an HTTP 422 response. */
	readonly errors?: readonly ApiErrorDetail[];
	/** The activation associated with the failure, when one was established. */
	readonly activation_context?: ActivationContext;
}

/** An API failure with a stable machine-readable code. */
export interface CodedApiErrorResponse {
	/** The human-readable summary of the failure. */
	readonly message: string;
	/** The stable machine-readable error code. */
	readonly code: string;
	/** The URL of the relevant API documentation. */
	readonly documentation_url: string;
	/** The activation associated with the failure, when one was established. */
	readonly activation_context?: ActivationContext;
}

/** An HTTP failure retaining structured diagnostics and server-directed retry metadata. */
export interface ApiError extends Error {
	/** The HTTP status code returned by the service. */
	readonly statusCode: number;
	/** Parsed error details, excluding credential-bearing response bodies. */
	readonly response?: ApiErrorResponse | CodedApiErrorResponse;
	/** The server request identifier for diagnostics, when available. */
	readonly requestId?: string;
	/** The delay in seconds indicated by Retry-After, when available. */
	readonly retryAfterSeconds?: number;
}
