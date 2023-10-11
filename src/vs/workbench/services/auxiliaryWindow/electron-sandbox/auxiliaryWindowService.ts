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
import { INativeHostService } from 'vs/platform/native/common/native';
import { DeferredPromise } from 'vs/base/common/async';

type AuxiliaryWindow = Window & typeof globalThis & {
	moveTop: () => void;
};

export function isAuxiliaryWindow(obj: unknown): obj is AuxiliaryWindow {
	const candidate = obj as AuxiliaryWindow | undefined;

	return typeof candidate?.moveTop === 'function';
}

export class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {

	private readonly windowId = new DeferredPromise<number>();

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super(layoutService);
	}

	protected override create(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore) {

		// Obtain window identifier
		(async () => {
			const windowId = await getGlobals(auxiliaryWindow)?.ipcRenderer.invoke('vscode:getWindowId');
			this.windowId.complete(windowId);
		})();

		// Zoom level
		const windowConfig = this.configurationService.getValue<IWindowsConfiguration>();
		const windowZoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;
		getGlobals(auxiliaryWindow)?.webFrame?.setZoomLevel(windowZoomLevel);

		return super.create(auxiliaryWindow, disposables);
	}

	protected override patchMethods(auxiliaryWindow: AuxiliaryWindow): void {
		super.patchMethods(auxiliaryWindow);

		const that = this;

		// Enable `window.focus()` to work in Electron by
		// asking the main process to focus the window.
		const originalWindowFocus = auxiliaryWindow.focus.bind(auxiliaryWindow);
		auxiliaryWindow.focus = async function () {
			originalWindowFocus();

			that.nativeHostService.focusWindow({ targetWindowId: await that.windowId.p });
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
