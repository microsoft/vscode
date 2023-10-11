/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { BrowserAuxiliaryWindowService, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { getGlobals } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowsConfiguration } from 'vs/platform/window/common/window';
import { DisposableStore } from 'vs/base/common/lifecycle';

type AuxiliaryWindow = Window & typeof globalThis & {
	moveTop: () => void;
};

export function isAuxiliaryWindow(obj: unknown): obj is AuxiliaryWindow {
	const candidate = obj as AuxiliaryWindow | undefined;

	return typeof candidate?.moveTop === 'function';
}

export class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(layoutService);
	}


	protected override applyCSS(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore): void {
		super.applyCSS(auxiliaryWindow, disposables);

		// Zoom level
		const windowConfig = this.configurationService.getValue<IWindowsConfiguration>();
		const windowZoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;
		getGlobals(auxiliaryWindow)?.webFrame?.setZoomLevel(windowZoomLevel);
	}

	protected override patchMethods(auxiliaryWindow: AuxiliaryWindow): void {
		super.patchMethods(auxiliaryWindow);

		// Enable `window.focus()` to work in Electron by
		// asking the main process to focus the window.
		const originalWindowFocus = auxiliaryWindow.focus.bind(auxiliaryWindow);
		auxiliaryWindow.focus = function () {
			originalWindowFocus();

			getGlobals(auxiliaryWindow)?.ipcRenderer.send('vscode:focusAuxiliaryWindow');
		};

		// Add a method to move window to the top (TODO@bpasero better to go entirely through native host service)
		Object.defineProperty(auxiliaryWindow, 'moveTop', {
			value: () => {
				getGlobals(auxiliaryWindow)?.ipcRenderer.send('vscode:moveAuxiliaryWindowTop');
			},
			writable: false,
			enumerable: false,
			configurable: false
		});
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
