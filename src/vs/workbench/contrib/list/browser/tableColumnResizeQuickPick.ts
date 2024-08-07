/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Table } from 'vs/base/browser/ui/table/tableWidget';
import { DisposableStore } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';

interface IColumnResizeQuickPickItem extends IQuickPickItem {
	index: number;
}

export class TableColumnResizeQuickPick extends DisposableStore {
	constructor(
		private readonly _table: Table<any>,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();
	}

	async show(): Promise<void> {
		const quickPick = this._quickInputService.createQuickPick<IColumnResizeQuickPickItem>();
		const items: IColumnResizeQuickPickItem[] = [];
		this._table.getColumnLabels().forEach((label, index) => {
			if (label) {
				items.push({ label, index });
			}
		});
		quickPick.items = items;
		quickPick.placeholder = localize('table.column.selection', "Select the column to resize, type to filter.");
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		quickPick.show();
		this.add(quickPick.onDidAccept(() => {
			const index = quickPick.selectedItems?.[0].index;
			if (index !== undefined) {
				this._selectColumn(quickPick, index);
			}
		}));
		this.add(quickPick.onDidHide(() => {
			quickPick.dispose();
			this.dispose();
		}));
	}

	private _selectColumn(quickPick: IQuickPick<IColumnResizeQuickPickItem>, index: number): void {
		quickPick.items = [];
		quickPick.placeholder = localize('table.column.resizeValue', "Please enter a width in percentage for the column.");
		quickPick.show();
		this.add(quickPick.onDidAccept(() => {
			const percentage = Number.parseInt(quickPick.value);
			if (!isNaN(percentage)) {
				this._table.resizeColumn(index, percentage);
				quickPick.hide();
				return;
			}
		}));
		this.add(quickPick.onDidChangeValue(() => this._validateColumnResizeValue(quickPick)));
	}

	private _validateColumnResizeValue(quickPick: IQuickPick<IColumnResizeQuickPickItem>): number | undefined {
		const percentage = Number.parseInt(quickPick.value);
		if (!Number.isInteger(percentage)) {
			quickPick.validationMessage = localize('table.column.resizeValue.invalidType', "Please enter an integer.");
			quickPick.severity = Severity.Error;
			return;
		} else if (percentage < 0 || percentage >= 100) {
			quickPick.validationMessage = localize('table.column.resizeValue.invalidRange', "Please enter a number between 0 and 100.");
			quickPick.severity = Severity.Error;
			return;
		} else {
			quickPick.validationMessage = undefined;
			quickPick.severity = Severity.Info;
			return percentage;
		}
	}
}
