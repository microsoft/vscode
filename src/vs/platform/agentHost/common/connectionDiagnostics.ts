/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { onUnexpectedError } from '../../../base/common/errors.js';

export interface IConnectionDiagnosticEvent {
	readonly operationId: string;
	readonly attemptId?: string;
	readonly phase: string;
	readonly timestamp: number;
	readonly outcome: 'started' | 'succeeded' | 'failed' | 'info';
	readonly durationMs?: number;
	readonly detail?: string;
	readonly error?: IConnectionDiagnosticError;
}

export interface IConnectionDiagnosticError {
	readonly name: string;
	readonly message: string;
	readonly code?: string;
	readonly status?: number;
	readonly requestId?: string;
	readonly cause?: IConnectionDiagnosticError;
}

export type ConnectionDiagnosticObserver = (event: IConnectionDiagnosticEvent) => void;

export function emitConnectionDiagnostic(observer: ConnectionDiagnosticObserver | undefined, event: IConnectionDiagnosticEvent): void {
	try {
		observer?.(event);
	} catch (error) {
		onUnexpectedError(error);
	}
}

/** Best-effort redaction for connection errors, never protocol bodies or authentication objects. */
export function sanitizeConnectionDiagnosticText(value: string, limit = 1024): string {
	return value
		.replace(/\u001b\[[0-9;]*m/g, '')
		.replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[redacted authorization]')
		.replace(/((?:https?|wss?):\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@')
		.replace(/((?:https?|wss?):\/\/[^\s?#]+)[?#][^\s]*/gi, '$1?[redacted]')
		.replace(/((?:access[_-]?token|refresh[_-]?token|token|tkn|password|secret|authorization|cookie)\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
		.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[redacted token]')
		.replace(/[\r\n\t]+/g, ' ')
		.slice(0, limit);
}

interface IErrorFields {
	readonly name?: unknown;
	readonly message?: unknown;
	readonly code?: unknown;
	readonly statusCode?: unknown;
	readonly status?: unknown;
	readonly requestId?: unknown;
	readonly correlationId?: unknown;
	readonly cause?: unknown;
	readonly response?: unknown;
	readonly headers?: unknown;
}

interface IErrorHeaders {
	readonly get?: unknown;
	readonly 'x-request-id'?: unknown;
	readonly 'x-ms-request-id'?: unknown;
	readonly 'x-ms-correlation-request-id'?: unknown;
}

function isErrorHeaders(value: unknown): value is IErrorHeaders {
	return typeof value === 'object' && value !== null;
}

function getRequestId(headers: unknown): unknown {
	if (!isErrorHeaders(headers)) {
		return undefined;
	}
	if (typeof headers.get === 'function') {
		for (const name of ['x-request-id', 'x-ms-request-id', 'x-ms-correlation-request-id']) {
			const value: unknown = headers.get(name);
			if (typeof value === 'string') {
				return value;
			}
		}
		return undefined;
	}
	return headers['x-request-id'] ?? headers['x-ms-request-id'] ?? headers['x-ms-correlation-request-id'];
}

function isErrorFields(error: unknown): error is IErrorFields {
	return typeof error === 'object' && error !== null;
}

/** Reads only known error metadata, not response bodies, stacks, or arbitrary object properties. */
export function getConnectionDiagnosticError(error: unknown, depth = 0): IConnectionDiagnosticError {
	if (!isErrorFields(error)) {
		return { name: 'Error', message: typeof error === 'string' ? sanitizeConnectionDiagnosticText(error) : 'No error description available' };
	}
	const response = isErrorFields(error.response) ? error.response : undefined;
	const status = error.statusCode ?? error.status ?? response?.statusCode ?? response?.status;
	const requestId = error.requestId ?? error.correlationId ?? getRequestId(error.headers ?? response?.headers);
	return {
		name: typeof error.name === 'string' ? sanitizeConnectionDiagnosticText(error.name, 80) : 'Error',
		message: typeof error.message === 'string' ? sanitizeConnectionDiagnosticText(error.message) : 'No error description available',
		code: typeof error.code === 'number' || typeof error.code === 'string' ? sanitizeConnectionDiagnosticText(String(error.code), 80) : undefined,
		status: typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
		requestId: typeof requestId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(requestId) && sanitizeConnectionDiagnosticText(requestId) === requestId ? requestId : undefined,
		cause: depth < 2 && error.cause !== undefined && error.cause !== error ? getConnectionDiagnosticError(error.cause, depth + 1) : undefined,
	};
}

export function formatConnectionDiagnosticError(error: IConnectionDiagnosticError): string {
	return [
		`${error.name}: ${error.message}`,
		error.code === undefined ? undefined : `code=${error.code}`,
		error.status === undefined ? undefined : `HTTP ${error.status}`,
		error.requestId === undefined ? undefined : `requestId=${error.requestId}`,
		error.cause === undefined ? undefined : `cause: ${formatConnectionDiagnosticError(error.cause)}`,
	].filter(value => value !== undefined).join('; ');
}

/** Records an operation without adding an asynchronous boundary to its caller. */
export class ConnectionDiagnosticOperation {
	private readonly operationId = generateUuid();
	private readonly started = Date.now();

	constructor(
		private readonly observer: ConnectionDiagnosticObserver,
		private readonly phase: string,
		detail?: string,
	) {
		emitConnectionDiagnostic(observer, { operationId: this.operationId, phase, timestamp: this.started, outcome: 'started', detail });
	}

	succeeded(detail?: string): void {
		this.complete('succeeded', { detail });
	}

	failed(error: unknown): void {
		this.complete('failed', { error: getConnectionDiagnosticError(error) });
	}

	private complete(outcome: 'succeeded' | 'failed', details: Pick<IConnectionDiagnosticEvent, 'detail' | 'error'>): void {
		const timestamp = Date.now();
		emitConnectionDiagnostic(this.observer, { operationId: this.operationId, phase: this.phase, timestamp, outcome, durationMs: timestamp - this.started, ...details });
	}
}

/** A single operation ID ties its start to its completion without modifying errors or results. */
export async function traceConnectionOperation<T>(observer: ConnectionDiagnosticObserver | undefined, phase: string, operation: () => Promise<T>): Promise<T> {
	if (!observer) {
		return operation();
	}
	const diagnostic = new ConnectionDiagnosticOperation(observer, phase);
	try {
		const result = await operation();
		diagnostic.succeeded();
		return result;
	} catch (error) {
		diagnostic.failed(error);
		throw error;
	}
}

export interface IRemoteConnectionDiagnosticEvent extends IConnectionDiagnosticEvent {
	readonly address: string;
}

/** Bounded in-memory evidence; never persisted or sent as telemetry. */
export class ConnectionDiagnosticBuffer {
	private readonly events: IRemoteConnectionDiagnosticEvent[] = [];

	record(address: string, event: IConnectionDiagnosticEvent): void {
		this.events.push({ ...event, address });
		if (this.events.length > 200) {
			this.events.shift();
		}
	}

	getEvents(): readonly IRemoteConnectionDiagnosticEvent[] {
		return [...this.events];
	}
}
