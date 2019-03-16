/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MainThreadStatusBarShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

type ColorItem = {
	id: number,
	disposable: IDisposable
};

@extHostNamedCustomer(MainContext.MainThreadStatusBar)
export class MainThreadStatusBar implements MainThreadStatusBarShape {

	private readonly _entries: { [id: number]: IDisposable };
	private _stackColor: ColorItem[];

	constructor(
		extHostContext: IExtHostContext,
		@IStatusbarService private readonly _statusbarService: IStatusbarService
	) {
		this._entries = Object.create(null);
		this._stackColor = [];
	}

	dispose(): void {
		for (const key in this._entries) {
			this._entries[key].dispose();
		}
	}

	$setEntry(id: number, extensionId: ExtensionIdentifier, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: MainThreadStatusBarAlignment, priority: number): void {

		// Dispose any old
		this.$dispose(id);

		// Add new
		const entry = this._statusbarService.addEntry({ text, tooltip, command, color, extensionId }, alignment, priority);
		this._entries[id] = entry;
	}

	$setBackground(id: number, color: string): void {
		const disposable = this._statusbarService.setBackgroundColor(color);
		this._stackColor.push({ id, disposable });
	}
	$disposeBackground(id: number) {
		let index; // find not working
		this._stackColor.forEach((e, idx) => { if (e.id === id) { index = idx; } });

		if (index /*&& index === this._stackColor.length -1*/) {
			this._stackColor[index].disposable.dispose();
		}

		this._stackColor = this._stackColor.filter(e => e.id === id);
	}
	$dispose(id: number) {
		const disposeable = this._entries[id];
		if (disposeable) {
			disposeable.dispose();
		}

		delete this._entries[id];
	}
}
