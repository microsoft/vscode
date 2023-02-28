/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';

export const enum TabFocusContext {
	Terminal = 'terminalFocus',
	Editor = 'editorFocus'
}

class TabFocusImpl {
	private _tabFocusTerminal: boolean = false;
	private _tabFocusEditor: boolean = false;

	private readonly _onDidChangeTabFocus = new Emitter<void>();
	public readonly onDidChangeTabFocus: Event<void> = this._onDidChangeTabFocus.event;

	public getTabFocusMode(context: TabFocusContext): boolean {
		return context === TabFocusContext.Terminal ? this._tabFocusTerminal : this._tabFocusEditor;
	}

	public setTabFocusMode(tabFocusMode: boolean, context: TabFocusContext): void {
		if (context === TabFocusContext.Terminal) {
			this._tabFocusTerminal = tabFocusMode;
		} else {
			this._tabFocusEditor = tabFocusMode;
		}
		this._onDidChangeTabFocus.fire();
	}
}

/**
 * Control what pressing Tab does.
 * If it is false, pressing Tab or Shift-Tab will be handled by the editor.
 * If it is true, pressing Tab or Shift-Tab will move the browser focus.
 * Defaults to false.
 */
export const TabFocus = new TabFocusImpl();
