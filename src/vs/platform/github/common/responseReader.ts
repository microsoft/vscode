/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';

/** String-valued details from a JSON error object, without interpreting a service's error envelope. */
export interface IResponseError {
	readonly code?: string;
	readonly type?: string;
	readonly message?: string;
}

/** Reads structured error details while leaving absent or malformed fields to the caller's policy. */
export function getResponseError(value: unknown): IResponseError | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const error: unknown = Reflect.get(value, 'error');
	if (!error || typeof error !== 'object' || Array.isArray(error)) {
		return undefined;
	}
	const code: unknown = Reflect.get(error, 'code');
	const type: unknown = Reflect.get(error, 'type');
	const message: unknown = Reflect.get(error, 'message');
	return {
		code: typeof code === 'string' ? code : undefined,
		type: typeof type === 'string' ? type : undefined,
		message: typeof message === 'string' ? message : undefined,
	};
}

/** Parses JSON using the caller's domain error for invalid syntax, without exposing response content. */
export function parseResponseJson<T>(body: string, errorFactory: () => Error): T {
	try {
		return JSON.parse(body);
	} catch {
		throw errorFactory();
	}
}

/** Reads at most the byte budget, cancelling incomplete bodies without blocking caller deadlines. */
export async function readBoundedResponse(
	response: Response,
	maximumBytes: number,
	signal: AbortSignal,
	logService?: ILogService,
): Promise<{ readonly bytes: Uint8Array; readonly truncated: boolean }> {
	const limit = Math.max(0, maximumBytes);
	if (!response.body) {
		signal.throwIfAborted();
		return { bytes: new Uint8Array(), truncated: false };
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	let complete = false;
	try {
		while (true) {
			const result = await readResponseChunk(reader, signal);
			signal.throwIfAborted();
			if (result.done) {
				complete = true;
				break;
			}
			if (length + result.value.byteLength > limit) {
				const remaining = Math.max(0, limit - length);
				if (remaining > 0) {
					chunks.push(result.value.slice(0, remaining));
					length += remaining;
				}
				return { bytes: concatenateBytes(chunks, length), truncated: true };
			}
			if (result.value.byteLength > 0) {
				chunks.push(result.value);
			}
			length += result.value.byteLength;
		}
		return { bytes: concatenateBytes(chunks, length), truncated: false };
	} finally {
		if (!complete) {
			cancelResponseBody(reader, logService);
		}
		reader.releaseLock();
	}
}

function readResponseChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		void reader.read().then(
			result => {
				signal.removeEventListener('abort', onAbort);
				resolve(result);
			},
			error => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			},
		);
	});
}

export function cancelResponseBody(body: { cancel(): Promise<void> }, logService?: ILogService): void {
	// A stalled underlying source must not prevent cancellation from settling.
	void body.cancel().catch(() => logService?.warn('[Request] Failed to cancel a response body'));
}

function concatenateBytes(chunks: readonly Uint8Array[], length: number): Uint8Array {
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}
