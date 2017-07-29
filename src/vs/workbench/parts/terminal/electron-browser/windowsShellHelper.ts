/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as platform from 'vs/base/common/platform';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter, debounceEvent } from 'vs/base/common/event';

const SHELL_EXECUTABLES = ['cmd.exe', 'powershell.exe', 'bash.exe'];

interface IWindowsTerminalProcess {
	pid: number;
	executable: string;
}

interface IWindowsProcTreeItem {
	pid: number;
	children: IWindowsTerminalProcess[];
}

export class WindowsShellHelper {
	private _childProcessIdStack: IWindowsProcTreeItem[];
	private _onCheckWindowsShell: Emitter<string>;
	private _rootShellExecutable: string;
	private _rootProcessId: number;

	public constructor(rootProcessId: number, rootShellExecutable: string) {
		this._childProcessIdStack = [];
		this._rootShellExecutable = rootShellExecutable;
		this._rootProcessId = rootProcessId;

		if (!platform.isWindows) {
			throw new Error(`WindowsShellHelper cannot be instantiated on ${platform.platform}`);
		}

		this._onCheckWindowsShell = new Emitter<string>();
		debounceEvent(this._onCheckWindowsShell.event, (l, e) => e, 100, true)(() => {
			this.getShellName();
		});
	}

	private getChildProcessDetails(pid: number): TPromise<IWindowsTerminalProcess[]> {
		return new TPromise((resolve, reject) => {
			cp.execFile('wmic.exe', ['process', 'where', `parentProcessId=${pid}`, 'get', 'ExecutablePath,ProcessId'], (err, stdout, stderr) => {
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

	private refreshShellProcessTree(process: IWindowsProcTreeItem, parent: string, useCached: boolean): TPromise<string> {
		return (useCached ? TPromise.as(process.children) : this.getChildProcessDetails(process.pid)).then(result => {
			process.children = result;
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
				return this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], null, false);
			}
			// We only go one level deep when checking for children of processes other then shells
			const baseName = path.basename(result[0].executable);
			if (SHELL_EXECUTABLES.indexOf(baseName) === -1) {
				if (baseName === 'conhost.exe') {
					// We're inside an external console; go up 2 levels and remove the console from the children
					this._childProcessIdStack.pop();
					const grandParent = this._childProcessIdStack[this._childProcessIdStack.length - 1];
					grandParent.children.splice(grandParent.children.map(p => p.pid).indexOf(process.pid), 1);
					return this.refreshShellProcessTree(grandParent, null, true);
				}
				return TPromise.as(result[0].executable);
			}
			// Save the pid in the stack and keep looking for children of that child
			this._childProcessIdStack.push({ pid: result[0].pid, children: [] });
			return this.refreshShellProcessTree({ pid: result[0].pid, children: [] }, result[0].executable, false);
		}, error => { return error; });
	}

	/**
	 * Returns the innermost shell executable running in the terminal
	 */
	public getShellName(): TPromise<string> {
		if (this._childProcessIdStack.length === 0) {
			this._childProcessIdStack.push({ pid: this._rootProcessId, children: [] });
		}
		return new TPromise<string>((resolve) => {
			this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], null, false).then(result => {
				resolve(result);
			}, error => { return error; });
		});
	}
}
