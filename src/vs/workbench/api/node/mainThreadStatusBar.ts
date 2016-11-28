/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MainThreadStatusBarShape } from './extHost.protocol';

export class MainThreadStatusBar extends MainThreadStatusBarShape {
	private mapIdToDisposable: { [id: number]: IDisposable };

	constructor(
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		super();
		this.mapIdToDisposable = Object.create(null);
	}

	$setEntry(id: number, extensionId: string, text: string, tooltip: string, command: string, color: string, alignment: MainThreadStatusBarAlignment, priority: number): void {

		// Dispose any old
		this.$dispose(id);

		// Add new
		let disposeable = this.statusbarService.addEntry({ text, tooltip, command, color, extensionId }, alignment, priority);
		this.mapIdToDisposable[id] = disposeable;
	}

	$dispose(id: number) {
		let disposeable = this.mapIdToDisposable[id];
		if (disposeable) {
			disposeable.dispose();
		}

		delete this.mapIdToDisposable[id];
	}
}
