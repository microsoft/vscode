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

interface IWindowsTerminalProcess {
	pid: number;
	executable: string;
}

interface IWindowsProcessStackItem {
	pid: number;
	children: IWindowsTerminalProcess[];
}

export class WindowsShellHelper {
	private _childProcessIdStack: IWindowsProcessStackItem[];
	private _onCheckShell: Emitter<TPromise<string>>;
	private _isSearchInProgress: boolean;

	public constructor(
		private _rootProcessId: number,
		private _rootShellExecutable: string,
		private _terminalInstance: ITerminalInstance,
		private _xterm: XTermTerminal
	) {
		if (!platform.isWindows) {
			throw new Error(`WindowsShellHelper cannot be instantiated on ${platform.platform}`);
		}

		this._childProcessIdStack = [{ pid: this._rootProcessId, children: [] }];

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
		if (platform.isWindows && this._terminalInstance.isTitleSetByProcess && !this._isSearchInProgress) {
			this._isSearchInProgress = true;
			this.getShellName().then(title => this._terminalInstance.setTitle(title, true)).then(() => { this._isSearchInProgress = false; });
		}
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

	private refreshShellProcessTree(process: IWindowsProcessStackItem, parent: string, useCached: boolean): TPromise<string> {
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
			const lastResult = result[result.length - 1];
			const baseName = path.basename(lastResult.executable);
			if (SHELL_EXECUTABLES.indexOf(baseName) === -1) {
				if (baseName === 'conhost.exe') {
					// We're inside an external console, as below for example:
					// |___ powershell.exe   <-- Get back to here
					// | |___ cmd.exe        <-- Remove this
					// | | |___ conhost.exe  <-- We're here
					// We'll need to go up 2 levels and remove the console from the children.
					this._childProcessIdStack.pop();
					const grandParent = this._childProcessIdStack[this._childProcessIdStack.length - 1];
					grandParent.children.splice(grandParent.children.map(p => p.pid).indexOf(process.pid), 1);
					return this.refreshShellProcessTree(grandParent, null, true);
				}
				return TPromise.as(lastResult.executable);
			}
			// Save the pid in the stack and keep looking for children of that child
			this._childProcessIdStack.push({ pid: lastResult.pid, children: [] });
			return this.refreshShellProcessTree({ pid: lastResult.pid, children: [] }, lastResult.executable, false);
		}, error => { return error; });
	}

	/**
	 * Returns the innermost shell executable running in the terminal
	 */
	public getShellName(): TPromise<string> {
		return this.refreshShellProcessTree(this._childProcessIdStack[this._childProcessIdStack.length - 1], null, false);
	}
}
