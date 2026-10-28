/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';

export interface InstallNodeGypHeadersOptions {
	/** Per-attempt deadline, so a stalled download is retried instead of hanging the install. */
	readonly timeoutMs?: number;
	/** Waits before each retry. One attempt is made per entry, plus the first. */
	readonly retryDelaysMs?: readonly number[];
	readonly log?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_DELAYS_MS = [10_000, 30_000];

/**
 * Runs `node-gyp install --dist-url <distUrl> <target>`, which downloads and unpacks the
 * headers into node-gyp's cache. The headers come from nodejs.org or electronjs.org, and a
 * single failed or stalled download used to fail the whole dependency install. node-gyp is
 * run through the current Node.js directly, so the deadline kills node-gyp itself.
 */
export function installNodeGypHeaders(nodeGypScript: string, distUrl: string, target: string, options: InstallNodeGypHeadersOptions = {}): void {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
	const log = options.log ?? (message => console.warn(message));
	const attempts = retryDelaysMs.length + 1;

	for (let attempt = 1; ; attempt++) {
		const result = child_process.spawnSync(process.execPath, [nodeGypScript, 'install', '--dist-url', distUrl, target], {
			stdio: 'inherit',
			timeout: timeoutMs,
		});
		if (result.status === 0) {
			return;
		}
		const reason = result.error?.message ?? (result.signal ? `signal ${result.signal}` : `exit code ${result.status}`);
		const message = `node-gyp install of ${target} headers from ${distUrl} failed (attempt ${attempt} of ${attempts}): ${reason}`;
		if (attempt >= attempts) {
			throw new Error(message);
		}
		const delayMs = retryDelaysMs[attempt - 1];
		log(`${message}. Retrying in ${delayMs / 1000} s.`);
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
	}
}
