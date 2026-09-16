/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';

export interface IDownloadOptions {
	readonly headers?: Record<string, string>;
	readonly checksumSha256?: string;
	readonly attempts?: number;
	readonly retryDelay?: number;
	readonly timeout?: number;
	readonly onRetry?: (error: Error) => void;
}

export function sha256(contents: Uint8Array): string {
	return crypto.createHash('sha256').update(contents).digest('hex');
}

export async function download(url: string, options: IDownloadOptions = {}): Promise<Uint8Array> {
	const attempts = options.attempts ?? 3;
	const retryDelay = options.retryDelay ?? 1000;
	const timeout = options.timeout ?? 30_000;
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetch(url, {
				headers: options.headers,
				signal: AbortSignal.timeout(timeout)
			});
			if (!response.ok) {
				throw new Error(`Request ${url} failed with status code: ${response.status}`);
			}

			const contents = new Uint8Array(await response.arrayBuffer());
			if (options.checksumSha256) {
				const actualChecksum = sha256(contents);
				if (actualChecksum !== options.checksumSha256) {
					throw new Error(`Checksum mismatch for ${url} (expected ${options.checksumSha256}, actual ${actualChecksum})`);
				}
			}
			return contents;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < attempts) {
				options.onRetry?.(lastError);
				await new Promise(resolve => setTimeout(resolve, retryDelay));
			}
		}
	}

	throw lastError ?? new Error(`Failed to download ${url}`);
}
