/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TableColumnResizeQuickPick } from './tableColumnResizeQuickPick';
import { Table } from '../../../../base/browser/ui/table/tableWidget';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { IListService, WorkbenchListFocusContextKey } from '../../../../platform/list/browser/listService';
import { Action2 } from '../../../../platform/actions/common/actions';
import { localize } from '../../../../nls';

export class ListResizeColumnAction extends Action2 {
	constructor() {
		super({
			id: 'list.resizeColumn',
			title: { value: localize('list.resizeColumn', "Resize Column"), original: 'Resize Column' },
			category: { value: localize('list', "List"), original: 'List' },
			precondition: WorkbenchListFocusContextKey,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const listService = accessor.get(IListService);
		const instantiationService = accessor.get(IInstantiationService);

		const list = listService.lastFocusedList;
		if (list instanceof Table) {
			await instantiationService.createInstance(TableColumnResizeQuickPick, list).show();
		}
	}
}

