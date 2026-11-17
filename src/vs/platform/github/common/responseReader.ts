/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from '../../../base/common/platform.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ILogService } from '../../log/common/log.js';

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
	cancellationToken: CancellationToken,
	logService?: ILogService,
): Promise<{ readonly bytes: Uint8Array; readonly truncated: boolean }> {
	const limit = Math.max(0, maximumBytes);
	if (!response.body) {
		CancellationToken.throwIfCanceled(cancellationToken);
		return { bytes: new Uint8Array(), truncated: false };
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	let complete = false;
	try {
		while (true) {
			CancellationToken.throwIfCanceled(cancellationToken);
			const result = await raceCancellationError(reader.read(), cancellationToken);
			CancellationToken.throwIfCanceled(cancellationToken);
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
		// releaseLock() can hang WebKit (regressed by https://bugs.webkit.org/show_bug.cgi?id=309882), and the body is already finished or cancelled.
		if (!isSafari) {
			reader.releaseLock();
		}
	}
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
