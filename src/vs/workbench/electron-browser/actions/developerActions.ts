/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';

export class ToggleDevToolsAction extends Action {

	static readonly ID = 'workbench.action.toggleDevTools';
	static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IWindowService private readonly windowsService: IWindowService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.toggleDevTools();
	}
}

export class ToggleSharedProcessAction extends Action {

	static readonly ID = 'workbench.action.toggleSharedProcess';
	static LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(id: string, label: string, @IWindowsService private readonly windowsService: IWindowsService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.toggleSharedProcess();
	}
}
