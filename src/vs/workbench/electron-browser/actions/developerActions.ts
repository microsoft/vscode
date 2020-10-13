/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CATEGORIES } from 'vs/workbench/common/actions';

class ToggleSharedProcessAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleSharedProcess',
			title: { value: nls.localize('toggleSharedProcess', "Toggle Shared Process"), original: 'Toggle Shared Process' },
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ISharedProcessService).toggleSharedProcessWindow();
	}
}

registerAction2(ToggleSharedProcessAction);
