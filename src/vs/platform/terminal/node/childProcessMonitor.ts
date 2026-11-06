/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { parse } from '../../../base/common/path.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ProcessItem } from '../../../base/common/processes.js';
import { listProcesses } from '../../../base/node/ps.js';
import { ILogService } from '../../log/common/log.js';

const enum Constants {
	/**
	 * The amount of time to throttle checks when the process receives output.
	 */
	InactiveThrottleDuration = 5000,
	/**
	 * The amount of time to debounce check when the process receives input.
	 */
	ActiveDebounceDuration = 1000,
}

export const ignoreProcessNames: string[] = [];

/**
 * Monitors child processes at different intervals after input and output.
 * Pending checks are canceled when the monitor is disposed.
 */
export class ChildProcessMonitor extends Disposable {
	private _hasChildProcesses: boolean = false;
	private set hasChildProcesses(value: boolean) {
		if (this._hasChildProcesses !== value) {
			this._hasChildProcesses = value;
			this._logService.debug('ChildProcessMonitor: Has child processes changed', value);
			this._onDidChangeHasChildProcesses.fire(value);
		}
	}
	/**
	 * Whether the process has child processes.
	 */
	get hasChildProcesses(): boolean { return this._hasChildProcesses; }

	private readonly _onDidChangeHasChildProcesses = this._register(new Emitter<boolean>());
	/**
	 * An event that fires when whether the process has child processes changes.
	 */
	readonly onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;

	private readonly _refreshActiveScheduler = this._register(new RunOnceScheduler(() => this._refreshActive(), Constants.ActiveDebounceDuration));
	private readonly _refreshInactiveScheduler = this._register(new RunOnceScheduler(() => this._refreshInactive(), Constants.InactiveThrottleDuration));
	private _lastInactiveRefreshTime = -Number.MAX_VALUE;

	constructor(
		private _pid: number,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	/**
	 * Updates the pid to monitor. This is needed when the pid is not available
	 * immediately after spawn (e.g. node-pty deferred conpty connection).
	 */
	setPid(pid: number): void {
		this._pid = pid;
	}

	/**
	 * Input was triggered on the process.
	 */
	handleInput() {
		if (!this._store.isDisposed) {
			this._refreshActiveScheduler.schedule();
		}
	}

	/**
	 * Output was triggered on the process.
	 */
	handleOutput() {
		if (this._store.isDisposed || this._refreshInactiveScheduler.isScheduled()) {
			return;
		}
		const delay = this._lastInactiveRefreshTime + Constants.InactiveThrottleDuration - Date.now();
		if (delay <= 0) {
			this._refreshInactive();
		} else {
			this._refreshInactiveScheduler.schedule(delay);
		}
	}

	private async _refreshActive(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		try {
			const processItem = await listProcesses(this._pid);
			this.hasChildProcesses = this._processContainsChildren(processItem);
		} catch (e) {
			this._logService.debug('ChildProcessMonitor: Fetching process tree failed', e);
		}
	}

	private _refreshInactive(): void {
		this._lastInactiveRefreshTime = Date.now();
		this._refreshActiveScheduler.schedule();
	}

	private _processContainsChildren(processItem: ProcessItem): boolean {
		// No child processes
		if (!processItem.children) {
			return false;
		}

		// A single child process, handle special cases
		if (processItem.children.length === 1) {
			const item = processItem.children[0];
			let cmd: string;
			if (item.cmd.startsWith(`"`)) {
				cmd = item.cmd.substring(1, item.cmd.indexOf(`"`, 1));
			} else {
				const spaceIndex = item.cmd.indexOf(` `);
				if (spaceIndex === -1) {
					cmd = item.cmd;
				} else {
					cmd = item.cmd.substring(0, spaceIndex);
				}
			}
			return ignoreProcessNames.indexOf(parse(cmd).name) === -1;
		}

		// Fallback, count child processes
		return processItem.children.length > 0;
	}
}
