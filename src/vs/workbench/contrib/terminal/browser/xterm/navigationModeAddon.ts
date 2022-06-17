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
		this._terminal!.scrollLines(-this._terminal!.rows + 1);
		this.focusPreviousLine();
	}

	focusNextPage(): void {
		this._terminal!.scrollLines(this._terminal!.rows - 1);
		this.focusNextLine();
	}

	focusPreviousLine(): void {
		this._focusLine(true);
	}

	focusNextLine(): void {
		this._focusLine(false);
	}

	private _focusLine(previous: boolean): void {
		if (!this._terminal?.element) {
			return;
		}
		this._navigationModeActiveContextKey.set(true);
		// Focus row if a row is already focused
		if (document.activeElement && document.activeElement.parentElement && document.activeElement.parentElement.classList.contains('xterm-accessibility-tree')) {
			const element = previous ? <HTMLElement | null>document.activeElement.previousElementSibling : <HTMLElement | null>document.activeElement.nextElementSibling;
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
		if (previous) {
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
