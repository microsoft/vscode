/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment, IStatusbarEntryAccessor, IStatusbarEntry } from 'vs/platform/statusbar/common/statusbar';
import { MainThreadStatusBarShape, MainContext, IExtHostContext } from '../common/extHost.protocol';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { dispose } from 'vs/base/common/lifecycle';

@extHostNamedCustomer(MainContext.MainThreadStatusBar)
export class MainThreadStatusBar implements MainThreadStatusBarShape {

	private readonly entries: Map<number, { accessor: IStatusbarEntryAccessor, alignment: MainThreadStatusBarAlignment, priority: number }> = new Map();

	constructor(
		_extHostContext: IExtHostContext,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) { }

	dispose(): void {
		this.entries.forEach(entry => entry.accessor.dispose());
		this.entries.clear();
	}

	$setEntry(id: number, statusId: string, statusName: string, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: MainThreadStatusBarAlignment, priority: number): void {
		const entry: IStatusbarEntry = { text, tooltip, command, color };

		// Reset existing entry if alignment or priority changed
		let existingEntry = this.entries.get(id);
		if (existingEntry && (existingEntry.alignment !== alignment || existingEntry.priority !== priority)) {
			dispose(existingEntry.accessor);
			this.entries.delete(id);
			existingEntry = undefined;
		}

		// Create new entry if not existing
		if (!existingEntry) {
			this.entries.set(id, { accessor: this.statusbarService.addEntry(entry, statusId, statusName, alignment, priority), alignment, priority });
		}

		// Otherwise update
		else {
			existingEntry.accessor.update(entry);
		}
	}

	$dispose(id: number) {
		const entry = this.entries.get(id);
		if (entry) {
			dispose(entry.accessor);
			this.entries.delete(id);
		}
	}
}
