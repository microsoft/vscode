/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/errors.ts for stable perf testing.
 */

export interface ErrorListenerCallback {
	(error: any): void;
}

export interface ErrorListenerUnbind {
	(): void;
}

const _errorListeners: ErrorListenerCallback[] = [];

export function setUnexpectedErrorHandler(handler: ErrorListenerCallback): void {
	_errorListeners.length = 0;
	_errorListeners.push(handler);
}

export function onUnexpectedError(e: any): void {
	if (!isCancellationError(e)) {
		for (const listener of _errorListeners) {
			try { listener(e); } catch { }
		}
	}
}

export function onUnexpectedExternalError(e: any): void {
	if (!isCancellationError(e)) {
		for (const listener of _errorListeners) {
			try { listener(e); } catch { }
		}
	}
}

export function transformErrorForSerialization(error: any): any {
	if (error instanceof Error) {
		const { name, message, stack } = error;
		return { $isError: true, name, message, stack };
	}
	return error;
}

const canceledName = 'Canceled';

export function isCancellationError(error: any): boolean {
	if (error instanceof CancellationError) { return true; }
	return error instanceof Error && error.name === canceledName && error.message === canceledName;
}

export class CancellationError extends Error {
	constructor() {
		super(canceledName);
		this.name = this.message;
	}
}

export class NotSupportedError extends Error {
	constructor(message?: string) {
		super(message || 'NotSupported');
	}
}

export class NotImplementedError extends Error {
	constructor(message?: string) {
		super(message || 'NotImplemented');
	}
}

export class IllegalArgumentError extends Error {
	constructor(message?: string) {
		super(message || 'Illegal argument');
	}
}

export class BugIndicatingError extends Error {
	constructor(message?: string) {
		super(message || 'Bug Indicating Error');
	}
}
