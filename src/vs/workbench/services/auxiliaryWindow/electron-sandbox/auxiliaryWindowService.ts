/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { BrowserAuxiliaryWindowService, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';

type AuxiliaryWindow = Window & typeof globalThis & {
	vscode: {
		ipcRenderer: Pick<import('vs/base/parts/sandbox/electron-sandbox/electronTypes').IpcRenderer, 'send'>;
	};
};

export class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super(layoutService, environmentService, lifecycleService);
	}
	protected override patchMethods(auxiliaryWindow: AuxiliaryWindow): void {
		super.patchMethods(auxiliaryWindow);

		// Enable `window.focus()` to work in Electron by
		// asking the main process to focus the window.
		const originalWindowFocus = auxiliaryWindow.focus.bind(auxiliaryWindow);
		auxiliaryWindow.focus = function () {
			originalWindowFocus();

			auxiliaryWindow.vscode.ipcRenderer.send('vscode:windowFocus');
		};
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
