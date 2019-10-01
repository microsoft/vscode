/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';

export class ToggleDevToolsAction extends Action {

	static readonly ID = 'workbench.action.toggleDevTools';
	static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IElectronService private readonly electronService: IElectronService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.electronService.toggleDevTools();
	}
}

export class ToggleSharedProcessAction extends Action {

	static readonly ID = 'workbench.action.toggleSharedProcess';
	static LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(id: string, label: string, @ISharedProcessService private readonly sharedProcessService: ISharedProcessService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.sharedProcessService.toggleSharedProcessWindow();
	}
}
