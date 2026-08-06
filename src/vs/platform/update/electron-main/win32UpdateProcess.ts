/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../base/common/async.js';
import { killTree } from '../../../base/node/processes.js';

export interface IUpdateChildProcess {
	readonly pid?: number;
	readonly exitCode: number | null;
	readonly signalCode: NodeJS.Signals | null;
	once(event: 'error', listener: (error: Error) => void): this;
	once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export type UpdateProcessResult =
	| { readonly type: 'error'; readonly error: Error }
	| { readonly type: 'exit'; readonly code: number | null; readonly signal: NodeJS.Signals | null };

export interface IUpdateProcessStopResult {
	readonly cancelError?: Error;
	readonly killed: boolean;
}

const gracefulTerminationTimeout = 30 * 1000;

export class Win32UpdateProcess {
	readonly whenTerminated: Promise<UpdateProcessResult>;
	private stopPromise: Promise<IUpdateProcessStopResult> | undefined;
	private terminated: boolean;

	constructor(
		private readonly process: IUpdateChildProcess,
		private readonly signalCancellation: () => Promise<void>,
		private readonly killProcess = (pid: number) => killTree(pid, true),
	) {
		this.terminated = process.exitCode !== null || process.signalCode !== null;
		this.whenTerminated = new Promise(resolve => {
			process.once('error', error => {
				this.terminated = true;
				resolve({ type: 'error', error });
			});
			process.once('exit', (code, signal) => {
				this.terminated = true;
				resolve({ type: 'exit', code, signal });
			});
		});
	}

	get isRunning(): boolean {
		return !this.terminated;
	}

	stop(): Promise<IUpdateProcessStopResult> {
		if (!this.stopPromise) {
			const stopPromise = this.doStop();
			this.stopPromise = stopPromise;
			stopPromise.then(undefined, () => {
				if (this.stopPromise === stopPromise) {
					this.stopPromise = undefined;
				}
			});
		}

		return this.stopPromise;
	}

	async waitForReady(isReady: () => boolean, readyDelay = 500): Promise<boolean> {
		if (isReady()) {
			return true;
		}

		await timeout(readyDelay);
		return isReady();
	}

	private async doStop(): Promise<IUpdateProcessStopResult> {
		if (!this.isRunning) {
			return { killed: false };
		}

		let cancelError: Error | undefined;
		try {
			await this.signalCancellation();
		} catch (error) {
			cancelError = error instanceof Error ? error : new Error(String(error));
		}

		const terminationTimeout = timeout(gracefulTerminationTimeout);
		let exited: boolean;
		try {
			exited = await Promise.race([
				this.whenTerminated.then(() => true),
				terminationTimeout.then(() => false)
			]);
		} finally {
			terminationTimeout.cancel();
		}

		const pid = this.process.pid;
		if (!exited && pid) {
			await this.killProcess(pid);
			return cancelError ? { cancelError, killed: true } : { killed: true };
		}

		return cancelError ? { cancelError, killed: false } : { killed: false };
	}
}
