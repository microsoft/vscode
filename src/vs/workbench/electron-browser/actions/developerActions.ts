/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';

export class ToggleSharedProcessAction extends Action {

	static readonly ID = 'workbench.action.toggleSharedProcess';
	static readonly LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(
		id: string,
		label: string,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.sharedProcessService.toggleSharedProcessWindow();
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

const developerCategory = nls.localize('developer', "Developer");
registry.registerWorkbenchAction(SyncActionDescriptor.from(ToggleSharedProcessAction), 'Developer: Toggle Shared Process', developerCategory);
