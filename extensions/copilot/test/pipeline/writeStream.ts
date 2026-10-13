/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/**
 * A small wrapper around `fs.WriteStream` that:
 * - attaches an `'error'` listener immediately so async write failures (ENOSPC,
 *   EIO, …) never bubble up as `uncaughtException` and abort the process;
 * - awaits backpressure via the per-write callback;
 * - surfaces stream errors through the next `write`/`close` rejection.
 *
 * Always `close()` the returned writer (including on error paths) to release
 * the underlying file descriptor.
 */
export function openWriteStream(filePath: string): {
	write: (data: string) => Promise<void>;
	close: () => Promise<void>;
} {
	const stream = fs.createWriteStream(filePath);
	let fatalError: Error | undefined;
	let closed = false;
	stream.on('error', err => {
		fatalError = err;
	});

	return {
		write(data: string): Promise<void> {
			if (fatalError) {
				return Promise.reject(fatalError);
			}
			return new Promise<void>((resolve, reject) => {
				stream.write(data, err => {
					if (err) {
						reject(err);
					} else if (fatalError) {
						reject(fatalError);
					} else {
						resolve();
					}
				});
			});
		},
		close(): Promise<void> {
			if (closed) {
				return Promise.resolve();
			}
			closed = true;
			return new Promise<void>((resolve, reject) => {
				stream.end(() => {
					if (fatalError) {
						reject(fatalError);
					} else {
						resolve();
					}
				});
			});
		},
	};
}
