/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as platform from 'vs/base/common/platform';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter, debounceEvent } from 'vs/base/common/event';

/** The amount of time to wait before getting the shell process name */
const WAIT_AFTER_ENTER_TIME = 100;

export class WindowsShellHelper {
	private _childProcessIdStack: number[];
	private _onCheckWindowsShell: Emitter<string>;
	private _rootShellExecutable: string;
	private _processId: number;

	public constructor(pid: number, rootShellName: string) {
		this._childProcessIdStack = [];
		this._rootShellExecutable = rootShellName;
		if (!platform.isWindows) {
			throw new Error(`WindowsShellHelper cannot be instantiated on ${platform.platform}`);
		}

		this._onCheckWindowsShell = new Emitter<string>();
		debounceEvent(this._onCheckWindowsShell.event, (l, e) => e, 100, true)(() => {
			this.updateShellName();
		});
	}

	private getFirstChildProcess(pid: number): TPromise<{ executable: string, pid: number }[]> {
		return new TPromise((resolve, reject) => {
			cp.execFile('wmic.exe', ['process', 'where', `parentProcessId=${pid}`, 'get', 'ExecutablePath,ProcessId'], (err, stdout, stderr) => {
				if (err) {
					reject(err);
				} else if (stderr.length > 0) {
					resolve([]); // No processes found
				} else {
					resolve(stdout.split('\n').slice(1).filter(str => !/^\s*$/.test(str)).map(str => {
						const s = str.split('  ');
						return { executable: s[0], pid: Number(s[1]) };
					}));
				}
			});
		});
	}

	private refreshShellProcessTree(pid: number, parent: string): TPromise<string> {
		return this.getFirstChildProcess(pid).then(result => {
			if (result.length === 0) {
				if (parent.length > 0) {
					return TPromise.as(parent);
				}
				if (this._childProcessIdStack.length > 1) {
					this._childProcessIdStack.pop();
					return this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], '');
				}
				return TPromise.as([]);
			}
			this._childProcessIdStack.push(result[0].pid);
			return this.refreshShellProcessTree(result[0].pid, result[0].executable);
		}, error => { return error; });
	}

	/**
	 * Returns the innermost shell running in the terminal.
	 */
	private getShellName(pid: number, shell: string): TPromise<string> {
		if (this._childProcessIdStack.length === 0) {
			this._childProcessIdStack.push(pid);
		}
		return new TPromise<string>((resolve) => {
			// We wait before checking the processes to give it time to update with the new child shell.
			// Otherwise, it would return old data.
			setTimeout(() => {
				this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], '').then(result => {
					if (result.length > 0) {
						resolve(result);
					}
					resolve(shell);
				}, error => { return error; });
			}, WAIT_AFTER_ENTER_TIME);
		});
	}

	public updateShellName(): TPromise<string> {
		return this.getShellName(this._processId, this._rootShellExecutable).then(result => {
			if (result) {
				const fullPathName = result.split('.exe')[0];
				return path.basename(fullPathName);
			}
			return this._rootShellExecutable;
		});
	}
}