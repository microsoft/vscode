/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Client } from 'chrome-remote-interface';
import { timeout } from '../common/async.js';

export interface ProfileResult {
	profile: Profile;
}

export interface Profile {
	nodes: ProfileNode[];
	samples?: number[];
	timeDeltas?: number[];
	startTime: number;
	endTime: number;
}

export interface ProfileNode {
	id: number;
	hitCount?: number;
	children?: number[];
	callFrame: {
		url: string;
		scriptId: string;
		functionName: string;
		lineNumber: number;
		columnNumber: number;
	};
	deoptReason?: string;
	positionTicks?: { line: number; ticks: number }[];
}

export interface ProfilingSession {
	stop(afterDelay?: number): Promise<ProfileResult>;
}

export interface Target {
	description: string;
	devtoolsFrontendUrl: string;
	id: string;
	title: string;
	type: string;
	url: string;
	webSocketDebuggerUrl: string;
}

export interface StartOptions {
	host?: string;
	port: number;
	tries?: number;
	retryWait?: number;
	checkForPaused?: boolean;
	target?: (targets: Target[]) => Target;
}


async function connectWithRetry(host: string | undefined, port: number, tries: number = 10, retryWait: number = 50, errors: Error[] = [], target?: (targets: Target[]) => Target): Promise<Client> {
	if (typeof target === 'undefined') {
		target = function (targets: Target[]) {
			const target = targets.find(target => {
				if (target.webSocketDebuggerUrl) {
					if (target.type === 'page') {
						return target.url.indexOf('bootstrap/index.html') > 0;
					} else {
						return true;
					}
				}
				return false;
			});
			if (!target) {
				throw new class extends Error {
					code: string;
					constructor() {
						super('no target');
						this.code = 'ECONNREFUSED';
					}
				};
			}
			return target;
		};
	}

	const { default: cdp } = await import('chrome-remote-interface');

	try {
		return await cdp({
			host,
			port,
			target,
			local: true,
		});
	} catch (e) {
		errors.push(e);
		if (tries <= 1) {
			throw new class extends Error {
				errors: Error[];
				constructor() {
					super('failed to connect');
					this.errors = errors;
				}
			};
		}
		await timeout(retryWait);
		return connectWithRetry(host, port, tries - 1, retryWait, errors, target);
	}
}

export async function startProfiling(options: StartOptions): Promise<ProfilingSession> {

	const client = await connectWithRetry(options.host, options.port, options.tries, options.retryWait, [], options.target);
	const { Runtime, Profiler } = client;

	if (options.checkForPaused) {
		// ensure the runtime isn't being debugged
		const { Debugger } = client;
		let isPaused = false;
		client.on('event', (message) => {
			if (message.method === 'Debugger.paused') {
				isPaused = true;
			}
		});
		await Debugger.enable();
		if (isPaused) {
			// client.close();
			// ^ this leaks the connection but there is an issue in
			// chrome that it will resume the runtime whenever a client
			// disconnects. Because things are relatively short-lived
			// we trade the leakage for being able to debug
			throw new Error('runtime is paused');
		}
	} else {
		// resume from inspect-brk
		await Runtime.runIfWaitingForDebugger();
	}

	// now start profiling
	await Profiler.enable();
	await Profiler.setSamplingInterval({ interval: 100 });
	await Profiler.start();

	return {
		stop: async function (n: number = 0) {
			if (n > 0) {
				await timeout(n);
			}
			const data = await Profiler.stop();
			await client.close();
			return data as ProfileResult;
		}
	};
}
