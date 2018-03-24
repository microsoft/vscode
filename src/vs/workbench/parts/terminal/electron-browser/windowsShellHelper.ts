/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter, debounceEvent } from 'vs/base/common/event';
import { ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import { Terminal as XTermTerminal } from 'vscode-xterm';
import WindowsProcessTreeType = require('windows-process-tree');

const SHELL_EXECUTABLES = ['cmd.exe', 'powershell.exe', 'bash.exe'];

let windowsProcessTree: typeof WindowsProcessTreeType;

export class WindowsShellHelper {
	private _onCheckShell: Emitter<TPromise<string>>;
	private _isDisposed: boolean;
	private _currentRequest: TPromise<string>;
	private _newLineFeed: boolean;

	public constructor(
		private _rootProcessId: number,
		private _terminalInstance: ITerminalInstance,
		private _xterm: XTermTerminal
	) {
		if (!platform.isWindows) {
			throw new Error(`WindowsShellHelper cannot be instantiated on ${platform.platform}`);
		}

		this._isDisposed = false;

		(import('windows-process-tree')).then(mod => {
			if (this._isDisposed) {
				return;
			}

			windowsProcessTree = mod;
			this._onCheckShell = new Emitter<TPromise<string>>();
			// The debounce is necessary to prevent multiple processes from spawning when
			// the enter key or output is spammed
			debounceEvent(this._onCheckShell.event, (l, e) => e, 150, true)(() => {
				setTimeout(() => {
					this.checkShell();
				}, 50);
			});

			// We want to fire a new check for the shell on a linefeed, but only
			// when parsing has finished which is indicated by the cursormove event.
			// If this is done on every linefeed, parsing ends up taking
			// significantly longer due to resetting timers. Note that this is
			// private API.
			this._xterm.on('linefeed', () => this._newLineFeed = true);
			this._xterm.on('cursormove', () => {
				if (this._newLineFeed) {
					this._onCheckShell.fire();
				}
			});

			// Fire a new check for the shell when any key is pressed.
			this._xterm.on('keypress', () => this._onCheckShell.fire());
		});
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

	private traverseTree(tree: any): string {
		if (!tree) {
			return '';
		}
		if (SHELL_EXECUTABLES.indexOf(tree.name) === -1) {
			return tree.name;
		}
		if (!tree.children || tree.children.length === 0) {
			return tree.name;
		}
		let favouriteChild = 0;
		for (; favouriteChild < tree.children.length; favouriteChild++) {
			const child = tree.children[favouriteChild];
			if (!child.children || child.children.length === 0) {
				break;
			}
			if (child.children[0].name !== 'conhost.exe') {
				break;
			}
		}
		if (favouriteChild >= tree.children.length) {
			return tree.name;
		}
		return this.traverseTree(tree.children[favouriteChild]);
	}

	public dispose(): void {
		this._isDisposed = true;
	}

	/**
	 * Returns the innermost shell executable running in the terminal
	 */
	public getShellName(): TPromise<string> {
		if (this._isDisposed) {
			return TPromise.as('');
		}
		// Prevent multiple requests at once, instead return current request
		if (this._currentRequest) {
			return this._currentRequest;
		}
		this._currentRequest = new TPromise<string>(resolve => {
			windowsProcessTree(this._rootProcessId, (tree) => {
				const name = this.traverseTree(tree);
				this._currentRequest = null;
				resolve(name);
			});
		});
		return this._currentRequest;
	}
}
