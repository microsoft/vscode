/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import { setTimeout as delay } from 'timers/promises';

export interface InstallNodeGypHeadersOptions {
	/** Per-attempt deadline, so a stalled download is retried instead of hanging the install. */
	readonly timeoutMs?: number;
	/** Waits before each retry. One attempt is made per entry, plus the first. */
	readonly retryDelaysMs?: readonly number[];
	readonly log?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_DELAYS_MS = [10_000, 30_000];

function runNodeGyp(nodeGypScript: string, args: readonly string[], timeoutMs: number): Promise<string | undefined> {
	return new Promise(resolve => {
		const child = child_process.spawn(process.execPath, [nodeGypScript, ...args], { stdio: 'inherit' });
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeoutMs);
		child.on('error', err => {
			clearTimeout(timer);
			resolve(err.message);
		});
		child.on('close', (code, signal) => {
			clearTimeout(timer);
			if (timedOut) {
				resolve(`timed out after ${timeoutMs / 1000} s`);
			} else if (code === 0) {
				resolve(undefined);
			} else {
				resolve(signal ? `signal ${signal}` : `exit code ${code}`);
			}
		});
	});
}

/**
 * Runs `node-gyp install --dist-url <distUrl> <target>`, which downloads and unpacks the
 * headers into node-gyp's cache. The headers come from nodejs.org or electronjs.org, and a
 * single failed or stalled download used to fail the whole dependency install. node-gyp is
 * run through the current Node.js directly, so the deadline kills node-gyp itself.
 */
export async function installNodeGypHeaders(nodeGypScript: string, distUrl: string, target: string, options: InstallNodeGypHeadersOptions = {}): Promise<void> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
	const log = options.log ?? (message => console.warn(message));
	const attempts = retryDelaysMs.length + 1;

	for (let attempt = 1; ; attempt++) {
		const failure = await runNodeGyp(nodeGypScript, ['install', '--dist-url', distUrl, target], timeoutMs);
		if (failure === undefined) {
			return;
		}
		const message = `node-gyp install of ${target} headers from ${distUrl} failed (attempt ${attempt} of ${attempts}): ${failure}`;
		if (attempt >= attempts) {
			throw new Error(message);
		}
		const delayMs = retryDelaysMs[attempt - 1];
		log(`${message}. Retrying in ${delayMs / 1000} s.`);
		await delay(delayMs);
	}
}
