/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { debounce, throttle } from 'vs/base/common/decorators';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { listProcesses } from 'vs/base/node/ps';
import { ILogService } from 'vs/platform/log/common/log';

const enum Constants {
	/**
	 * The amount of time to throttle checks when the process receives output.
	 */
	InactiveThrottleDuration = 10000,
	/**
	 * The amount of time to debounce check when the process receives input.
	 */
	ActiveDebounceDuration = 1000,
}

/**
 * Monitors a process for child processes, checking at differing times depending on input and output
 * calls into the monitor.
 */
export class ChildProcessMonitor extends Disposable {
	private _isDisposed: boolean = false;

	private _hasChildProcesses: boolean = false;
	private set hasChildProcesses(value: boolean) {
		if (this._hasChildProcesses !== value) {
			this._hasChildProcesses = value;
			this._logService.trace('ChildProcessMonitor: Has child processes changed', value);
			this._onDidChangeHasChildProcesses.fire(value);
		}
	}
	/**
	 * The process has child processes.
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
		this.onDidChangeHasChildProcesses((s) => console.log('changed state', s));
	}

	override dispose() {
		this._isDisposed = true;
		super.dispose();
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
		if (this._isDisposed) {
			return;
		}
		const processItem = await listProcesses(this._pid);
		this.hasChildProcesses = (processItem.children || false) && processItem.children.length > 0;
	}

	@throttle(Constants.InactiveThrottleDuration)
	private _refreshInactive(): void {
		this._refreshActive();
	}
}
