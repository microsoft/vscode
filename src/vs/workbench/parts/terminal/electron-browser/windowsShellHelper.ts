/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as platform from 'vs/base/common/platform';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter, debounceEvent } from 'vs/base/common/event';
import { ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import XTermTerminal = require('xterm');

const SHELL_EXECUTABLES = ['cmd.exe', 'powershell.exe', 'bash.exe'];

export class WindowsShellHelper {
	private _childProcessIdStack: number[];
	private _onCheckShell: Emitter<TPromise<string>>;
	private _wmicProcess: cp.ChildProcess;
	private _isDisposed: boolean;

	public constructor(
		private _rootProcessId: number,
		private _rootShellExecutable: string,
		private _terminalInstance: ITerminalInstance,
		private _xterm: XTermTerminal
	) {
		if (!platform.isWindows) {
			throw new Error(`WindowsShellHelper cannot be instantiated on ${platform.platform}`);
		}

		this._childProcessIdStack = [this._rootProcessId];
		this._isDisposed = false;
		this._onCheckShell = new Emitter<TPromise<string>>();
		// The debounce is necessary to prevent multiple processes from spawning when
		// the enter key or output is spammed
		debounceEvent(this._onCheckShell.event, (l, e) => e, 200, true)(() => {
			this.checkShell();
		});

		this._xterm.on('lineFeed', () => this._onCheckShell.fire());
		this._xterm.on('keypress', () => this._onCheckShell.fire());
	}

	private checkShell(): void {
		if (platform.isWindows && this._terminalInstance.isTitleSetByProcess) {
			this.getShellName().then(title => {
				if (!this._isDisposed) {
					this._terminalInstance.setTitle(title, true);
				}
			});
		}
	}

	private getChildProcessDetails(pid: number): TPromise<{ executable: string, pid: number }[]> {
		return new TPromise((resolve, reject) => {
			this._wmicProcess = cp.execFile('wmic.exe', ['process', 'where', `parentProcessId=${pid}`, 'get', 'ExecutablePath,ProcessId'], (err, stdout, stderr) => {
				this._wmicProcess = null;
				if (this._isDisposed) {
					reject(null);
				}
				if (err) {
					reject(err);
				} else if (stderr.length > 0) {
					resolve([]); // No processes found
				} else {
					const childProcessLines = stdout.split('\n').slice(1).filter(str => !/^\s*$/.test(str));
					const childProcessDetails = childProcessLines.map(str => {
						const s = str.split('  ');
						return { executable: s[0], pid: Number(s[1]) };
					});
					resolve(childProcessDetails);
				}
			});
		});
	}

	private refreshShellProcessTree(pid: number, parent: string): TPromise<string> {
		return this.getChildProcessDetails(pid).then(result => {
			// When we didn't find any child processes of the process
			if (result.length === 0) {
				// Case where we found a child process already and are checking further down the pid tree
				// We have reached the end here so we know that parent is the deepest first child of the tree
				if (parent) {
					return TPromise.as(parent);
				}
				// Case where we haven't found a child and only the root shell is left
				if (this._childProcessIdStack.length === 1) {
					return TPromise.as(this._rootShellExecutable);
				}
				// Otherwise, we go up the tree to find the next valid deepest child of the root
				this._childProcessIdStack.pop();
				return this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], null);
			}
			// We only go one level deep when checking for children of processes other then shells
			if (SHELL_EXECUTABLES.indexOf(path.basename(result[0].executable)) === -1) {
				return TPromise.as(result[0].executable);
			}
			// Save the pid in the stack and keep looking for children of that child
			this._childProcessIdStack.push(result[0].pid);
			return this.refreshShellProcessTree(result[0].pid, result[0].executable);
		}, error => {
			if (!this._isDisposed) {
				return error;
			}
		});
	}

	public dispose(): void {
		this._isDisposed = true;
		if (this._wmicProcess) {
			this._wmicProcess.kill();
		}
	}

	/**
	 * Returns the innermost shell executable running in the terminal
	 */
	public getShellName(): TPromise<string> {
		return this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], null);
	}
}