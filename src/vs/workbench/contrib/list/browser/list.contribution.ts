/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TableColumnResizeQuickPick } from 'vs/workbench/contrib/list/browser/tableColumnResizeQuickPick';
import { Table } from 'vs/base/browser/ui/table/tableWidget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchListFocusContextKey, IListService } from 'vs/platform/list/browser/listService';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';

export class ListContext implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.listContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		contextKeyService.createKey<boolean>('listSupportsTypeNavigation', true);

		// @deprecated in favor of listSupportsTypeNavigation
		contextKeyService.createKey('listSupportsKeyboardNavigation', true);
	}
}

registerWorkbenchContribution2(ListContext.ID, ListContext, WorkbenchPhase.BlockStartup);


KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'resizeColumn',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.F8,
	handler: async (accessor) => {
		const listService = accessor.get(IListService);
		const instantiationService = accessor.get(IInstantiationService);
		const widget = listService.lastFocusedList;
		if (!(widget instanceof Table)) {
			return;
		}
		await instantiationService.createInstance(TableColumnResizeQuickPick, widget).show();
	}
});
