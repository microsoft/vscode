/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Table } from '../../../../base/browser/ui/table/tableWidget.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';

interface IColumnResizeQuickPickItem extends IQuickPickItem {
	index: number;
}

export class TableColumnResizeQuickPick extends Disposable {
	constructor(
		private readonly _table: Table<unknown>,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();
	}

	async show(): Promise<void> {
		const items: IColumnResizeQuickPickItem[] = [];
		this._table.getColumnLabels().forEach((label, index) => {
			if (label) {
				items.push({ label, index });
			}
		});
		const column = await this._quickInputService.pick<IColumnResizeQuickPickItem>(items, { placeHolder: localize('table.column.selection', "Select the column to resize, type to filter.") });
		if (!column) {
			return;
		}
		const value = await this._quickInputService.input({
			placeHolder: localize('table.column.resizeValue.placeHolder', "i.e. 20, 60, 100..."),
			prompt: localize('table.column.resizeValue.prompt', "Please enter a width in percentage for the '{0}' column.", column.label),
			validateInput: (input: string) => this._validateColumnResizeValue(input)
		});
		const percentageValue = value ? Number.parseInt(value) : undefined;
		if (!percentageValue) {
			return;
		}
		this._table.resizeColumn(column.index, percentageValue);
	}

	private async _validateColumnResizeValue(input: string): Promise<string | { content: string; severity: Severity } | null | undefined> {
		const percentage = Number.parseInt(input);
		if (input && !Number.isInteger(percentage)) {
			return localize('table.column.resizeValue.invalidType', "Please enter an integer.");
		} else if (percentage < 0 || percentage > 100) {
			return localize('table.column.resizeValue.invalidRange', "Please enter a number greater than 0 and less than or equal to 100.");
		}
		return null;
	}
}
