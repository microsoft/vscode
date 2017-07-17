/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as platform from 'vs/base/common/platform';
import { IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';

/** The amount of time to wait before getting the shell process name */
const WAIT_FOR_SHELL_UPDATE = 100;

export class WindowsShellService {
	private _pidStack: number[];
	private _processId: number;
	private _shellLaunchConfig: IShellLaunchConfig;

	public constructor(pid: number, shell: IShellLaunchConfig) {
		this._pidStack = [];
		this._processId = pid;
		this._shellLaunchConfig = shell;
	}

	private static getFirstWindowsChildProcess(pid: number): TPromise<{ executable: string, pid: number }[]> {
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

	private refreshWindowsShellProcessTree(pid: number, flag: boolean): TPromise<string> {
		return WindowsShellService.getFirstWindowsChildProcess(pid).then(result => {
			if (result.length === 0) {
				if (flag) {
					TPromise.as(result[0].executable);
				}
				if (this._pidStack.length > 1) {
					this._pidStack.pop();
					return this.refreshWindowsShellProcessTree(this._pidStack[this._pidStack.length - 1], false);
				}
				return TPromise.as([]);
			}
			this._pidStack.push(result[0].pid);
			return this.refreshWindowsShellProcessTree(result[0].pid, true);
		}, error => { return error; });
	}

	/**
	 * Returns the innermost shell running in the terminal. This is only implemented for Windows.
	 */
	public getShellName(): TPromise<string> {
		if (platform.platform !== platform.Platform.Windows) {
			throw null;
		}
		if (this._pidStack.length === 0) {
			this._pidStack.push(this._processId);
		}
		return new TPromise<string>((resolve) => {
			// We wait before checking the processes to give it time to update with the new child shell.
			// Otherwise, it would return old data.
			setTimeout(() => {
				this.refreshWindowsShellProcessTree(this._pidStack[this._pidStack.length - 1], false).then(result => {
					if (result.length > 0) {
						resolve(result);
					}
					resolve(this._shellLaunchConfig.executable);
				}, error => { return error; });
			}, WAIT_FOR_SHELL_UPDATE);
		});
	}
}