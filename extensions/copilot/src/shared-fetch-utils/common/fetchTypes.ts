/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface HttpRequest {
	readonly url: string;
	readonly headers: Record<string, string>;
	method?: 'GET' | 'POST' | 'PUT';
	// Arbitrary state that can be passed through the middleware pipeline
	state?: Record<string, unknown>;
}

export interface HttpHeaders {
	get(name: string): string | null | undefined;
}

export interface HttpResponse {
	readonly status: number;
	readonly headers: HttpHeaders;
	readonly body: ReadableStream<Uint8Array> | null;
	json(): Promise<unknown>;
	text(): Promise<string>;
}

/**
 * A function that performs an HTTP fetch given a request.
 *
 * Callers bridge their particular HTTP client (e.g. `IFetcherService`) into
 * this shape so the middleware stack can remain transport-agnostic.
 */
export type HttpFetchFn = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * A middleware wraps an {@link HttpFetchFn} and returns a new one. Middleware
 * can inspect/modify the request, short-circuit the call, or post-process
 * the response.
 *
 * Middlewares are composed left-to-right: the first middleware in the array
 * is the outermost wrapper and executes first.
 */
export type FetchMiddleware = (next: HttpFetchFn) => HttpFetchFn;

/**
 * Minimal interface for checking window activity state. Compatible with
 * `IEnvService` without depending on it directly.
 */
export interface WindowStateProvider {
	readonly isActive: boolean;
}

export class FetchBlockedError extends Error {
	constructor(message: string, readonly retryAfterMs: number) {
		super(message);
	}
}
