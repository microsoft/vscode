/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Host-supplied fetch implementation for one request attempt and its response body. */
export type RequestFetch = typeof globalThis.fetch;

/** Wire operation category used for scheduling and diagnostics. */
export type RequestKind = 'rest' | 'graphql' | 'download';

/** Stable account quota identity at a service host, independent of its credential. */
export interface AccountHandle {
	readonly kind?: 'authenticated';
	readonly host: string;
	readonly accountId: string;
}

/** Anonymous quota identity shared by an API origin and the owning executor. */
export interface AnonymousAccount {
	readonly kind: 'anonymous';
	readonly host: string;
	readonly origin: string;
}

/** Explicit credential quota identity available before authentication has been published. */
export interface BootstrapAccount {
	readonly kind: 'bootstrap';
	readonly host: string;
	readonly origin: string;
	readonly accountId?: string;
}

/** Quota accounting identity; never a credential or authorization grant. */
export type RequestAccount = AccountHandle | AnonymousAccount | BootstrapAccount;

/** Internal scheduling lanes, ordered independently from caller authentication. */
export type RequestPriority = 'mutationReconciliation' | 'mutation' | 'interactive' | 'mergeGate' | 'visible' | 'background' | 'enrichment';

/** Content-free transport and admission failure categories shared by API services. */
export type RequestErrorKind = 'authentication' | 'authorization' | 'notFound' | 'validation' | 'schema' | 'rateLimit' | 'network' | 'server' | 'overloaded' | 'timeout' | 'responseTooLarge' | 'malformedResponse' | 'unknown';

/** Caller attribution and an optional tighter absolute request deadline. */
export interface RequestOptions {
	readonly caller?: string;
	readonly deadline?: number;
}

/** Immutable admission context for one governed operation and its owning consumer. */
export interface RequestContext {
	readonly kind: RequestKind;
	readonly account: RequestAccount;
	readonly caller: string;
	readonly resource: string;
	readonly priority: RequestPriority;
	readonly deadline: number;
	readonly signal: AbortSignal;
	readonly owner?: object;
}

/** Transport failure details without a service-specific response schema. */
export class RequestError extends Error {
	constructor(
		message: string,
		readonly kind: RequestErrorKind,
		readonly statusCode?: number,
		readonly responseBody?: string,
		readonly statusText?: string,
	) {
		super(message);
		this.name = 'RequestError';
	}
}

/** Deadline failure that records whether a physical request may have been dispatched. */
export class RequestTimeoutError extends RequestError {
	constructor(readonly requestDispatched = false) {
		super('Request timed out', 'timeout');
	}
}

/** A server-directed wait that cannot fit the remaining caller budget. */
export class RequestRateLimitError extends RequestError {
	constructor(readonly retryAfterMs: number) {
		super('The server cooldown exceeds the remaining request budget', 'rateLimit', 429);
	}
}

/** Stable completion categories for service-owned telemetry adapters. */
export type RequestOutcome = Exclude<RequestErrorKind, 'unknown'> | 'success' | 'cancelled' | 'other';

/** Timing callbacks attached only to admitted operations. */
export interface IRequestTiming {
	updateCooldown(delay: number): void;
	start(priority?: RequestPriority): void;
	finish(outcome: RequestOutcome): void;
}

/** Optional diagnostics supplied by the domain owning a request queue. */
export interface IRequestQueueTelemetry {
	startQueue(context: RequestContext): IRequestTiming | undefined;
	recordRejection(reason: 'engine' | 'account' | 'caller' | 'waiter'): void;
	recordQueueSize(active: number, pending: number): void;
}

export function requestOutcome(error: unknown, cancelled: boolean): RequestOutcome {
	if (error instanceof RequestError && error.kind !== 'unknown') {
		return error.kind;
	}
	return cancelled ? 'cancelled' : 'other';
}
