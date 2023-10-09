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
	moveTop: () => void;
};

export function isAuxiliaryWindow(obj: unknown): obj is AuxiliaryWindow {
	const candidate = obj as AuxiliaryWindow | undefined;

	return typeof candidate?.vscode?.ipcRenderer?.send === 'function';
}

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

			auxiliaryWindow.vscode.ipcRenderer.send('vscode:focusAuxiliaryWindow');
		};

		// Add a method to move window to the top (TODO@bpasero better to go entirely through native host service)
		Object.defineProperty(auxiliaryWindow, 'moveTop', {
			value: () => {
				auxiliaryWindow.vscode.ipcRenderer.send('vscode:moveAuxiliaryWindowTop');
			},
			writable: false,
			enumerable: false,
			configurable: false
		});
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
