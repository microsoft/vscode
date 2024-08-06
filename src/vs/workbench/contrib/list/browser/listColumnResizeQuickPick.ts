/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Table } from 'vs/base/browser/ui/table/tableWidget';
import { DisposableStore } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';

interface IColumnResizeQuickPickItem extends IQuickPickItem {
	index: number;
}

export class ListColumnResizeQuickPick extends DisposableStore {

	constructor(
		private readonly _table: Table<any>,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();
	}

	async show(): Promise<void> {
		const pick = this._quickInputService.createQuickPick<IColumnResizeQuickPickItem>({ useSeparators: true });
		const picks: IColumnResizeQuickPickItem[] = [];
		this._table.getColumnLabels().forEach((label, index) => {
			if (label) {
				picks.push({ label, index });
			}
		});
		pick.items = picks;
		pick.placeholder = localize('table.column.selection', "Select the column to open, type to filter.");
		pick.sortByLabel = false;
		pick.show();
		this.add(pick.onDidAccept(() => {
			const index = pick.selectedItems[0].index;
			if (index !== undefined) {
				pick.items = [];
				pick.placeholder = localize('table.column.resizeValue', "Please enter a width in percentage for the column.");
				pick.show();
				this.add(pick.onDidAccept(() => {
					const percentage = Number(pick.value);
					if (!isNaN(percentage)) {
						this._table.resizeColumn(index, percentage);
					}
					pick.hide();
					this.dispose();
				}));
				this.add(pick.onDidChangeValue(() => {
					const value = Number.parseInt(pick.value);
					if (isNaN(value) || Number(value) < 0 || Number(value) >= 100) {
						pick.validationMessage = localize('table.column.resizeValue.invalid', "Please enter a valid number.");
						pick.severity = Severity.Error;
					}
				}));
			}
			this.add(pick.onDidHide(() => {
				pick.dispose();
				this.dispose();
			}));
		}
		));
	}
}
