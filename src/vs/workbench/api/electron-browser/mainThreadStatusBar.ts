/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MainThreadStatusBarShape } from '../node/extHost.protocol';
import { ThemeColor } from 'vs/platform/theme/common/themeService';

export class MainThreadStatusBar extends MainThreadStatusBarShape {

	private readonly _entries: { [id: number]: IDisposable };

	constructor(
		@IStatusbarService private readonly _statusbarService: IStatusbarService
	) {
		super();
		this._entries = Object.create(null);
	}

	dispose(): void {
		for (const key in this._entries) {
			this._entries[key].dispose();
		}
	}

	$setEntry(id: number, extensionId: string, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: MainThreadStatusBarAlignment, priority: number): void {

		// Dispose any old
		this.$dispose(id);

		// Add new
		let entry = this._statusbarService.addEntry({ text, tooltip, command, color, extensionId }, alignment, priority);
		this._entries[id] = entry;
	}

	$dispose(id: number) {
		let disposeable = this._entries[id];
		if (disposeable) {
			disposeable.dispose();
		}

		delete this._entries[id];
	}
}
