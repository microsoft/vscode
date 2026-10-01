/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';

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
