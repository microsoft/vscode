/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../../../base/common/path.js';
import { debounce, throttle } from '../../../base/common/decorators.js';
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
 * Monitors a process for child processes, checking at differing times depending on input and output
 * calls into the monitor.
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

	constructor(
		private readonly _pid: number,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	/**
	 * Input was triggered on the process.
	 */
	handleInput() {
		this._refreshActive();
	}

	/**
	 * Output was triggered on the process.
	 */
	handleOutput() {
		this._refreshInactive();
	}

	@debounce(Constants.ActiveDebounceDuration)
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

	@throttle(Constants.InactiveThrottleDuration)
	private _refreshInactive(): void {
		this._refreshActive();
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
