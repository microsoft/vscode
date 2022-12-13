/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import type { Terminal, ITerminalAddon } from 'xterm';
import { addDisposableListener } from 'vs/base/browser/dom';
import { INavigationMode } from 'vs/workbench/contrib/terminal/common/terminal';

export class NavigationModeAddon implements INavigationMode, ITerminalAddon {
	private _terminal: Terminal | undefined;
	constructor(
		private _navigationModeContextKey: IContextKey<boolean>,
		private _navigationModeActiveContextKey: IContextKey<boolean>
	) { }

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	dispose() { }

	exitNavigationMode(): void {
		if (!this._terminal) {
			return;
		}
		this._terminal.scrollToBottom();
		this._terminal.focus();
		this._navigationModeActiveContextKey.set(false);
	}

	focusPreviousPage(): void {
		if (!this._terminal?.buffer.active) {
			return;
		}
		this._navigationModeActiveContextKey.set(true);
		if (this._terminal?.buffer.active.viewportY < this._terminal.rows) {
			this._terminal.scrollToTop();
			this._focusRow(0);
		} else {
			this._terminal.scrollLines(-this._terminal.rows);
			this._focusLine('current');
		}
	}

	focusNextPage(): void {
		if (!this._terminal?.buffer.active) {
			return;
		}
		this._navigationModeActiveContextKey.set(true);
		if (this._terminal.buffer.active.viewportY === this._terminal.buffer.active.baseY) {
			this._focusRow(this._terminal.rows - 1);
		} else {
			this._terminal.scrollLines(this._terminal.rows);
			this._focusLine('current');
		}
	}

	focusPreviousLine(): void {
		this._navigationModeActiveContextKey.set(true);
		this._focusLine('previous');
	}

	focusNextLine(): void {
		this._navigationModeActiveContextKey.set(true);
		this._focusLine('next');
	}

	private _focusLine(type: 'previous' | 'next' | 'current'): void {
		if (!this._terminal?.element) {
			return;
		}
		// Focus row if a row is already focused
		if (document.activeElement && document.activeElement.parentElement && document.activeElement.parentElement.classList.contains('xterm-accessibility-tree')) {
			let element = <HTMLElement | null>document.activeElement;
			if (type !== 'current') {
				element = type === 'previous' ? <HTMLElement | null>document.activeElement.previousElementSibling : <HTMLElement | null>document.activeElement.nextElementSibling;
			}
			if (element) {
				element.focus();
				const disposable = addDisposableListener(element, 'blur', () => {
					this._navigationModeContextKey.set(false);
					disposable.dispose();
				});
				this._navigationModeContextKey.set(true);
			}
			return;
		}

		let targetRow: number;
		if (type === 'previous') {
			targetRow = Math.max(this._terminal.buffer.active.cursorY - 1, 0);
		} else {
			targetRow = this._terminal.buffer.active.cursorY;
		}
		this._focusRow(targetRow);
	}

	private _focusRow(targetRow: number): void {
		if (!this._terminal) {
			return;
		}
		if (!this._terminal?.element) {
			return;
		}
		// Ensure a11y tree exists
		const treeContainer = this._terminal.element.querySelector('.xterm-accessibility-tree');
		if (!treeContainer) {
			return;
		}

		// Check bounds
		if (treeContainer.childElementCount < targetRow || targetRow < 0) {
			return;
		}

		const element = <HTMLElement>treeContainer.childNodes.item(targetRow);
		element.focus();
		const disposable = addDisposableListener(element, 'blur', () => {
			this._navigationModeContextKey.set(false);
			disposable.dispose();
		});
		this._navigationModeContextKey.set(true);
	}
}
