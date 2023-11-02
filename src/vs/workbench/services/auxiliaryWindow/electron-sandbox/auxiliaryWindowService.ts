/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { BrowserAuxiliaryWindowService, IAuxiliaryWindowService, AuxiliaryWindow as BrowserAuxiliaryWindow } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { ISandboxGlobals } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowsConfiguration } from 'vs/platform/window/common/window';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { getActiveWindow } from 'vs/base/browser/dom';

type NativeAuxiliaryWindow = BrowserAuxiliaryWindow & {
	readonly vscode: ISandboxGlobals;
};

export class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IDialogService dialogService: IDialogService
	) {
		super(layoutService, dialogService);
	}

	protected override create(auxiliaryWindow: NativeAuxiliaryWindow, disposables: DisposableStore) {

		// Zoom level
		const windowConfig = this.configurationService.getValue<IWindowsConfiguration>();
		const windowZoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;
		auxiliaryWindow.vscode.webFrame.setZoomLevel(windowZoomLevel);

		return super.create(auxiliaryWindow, disposables);
	}

	protected override resolveWindowId(auxiliaryWindow: NativeAuxiliaryWindow): Promise<number> {
		return auxiliaryWindow.vscode.ipcRenderer.invoke('vscode:registerAuxiliaryWindow', this.nativeHostService.windowId);
	}

	protected override async patchMethods(auxiliaryWindow: NativeAuxiliaryWindow): Promise<void> {
		await super.patchMethods(auxiliaryWindow);

		// Enable `window.focus()` to work in Electron by
		// asking the main process to focus the window.
		// https://github.com/electron/electron/issues/25578
		const that = this;
		const originalWindowFocus = auxiliaryWindow.focus.bind(auxiliaryWindow);
		auxiliaryWindow.focus = function () {
			originalWindowFocus();

			if (getActiveWindow() !== auxiliaryWindow) {
				that.nativeHostService.focusWindow({ targetWindowId: auxiliaryWindow.vscodeWindowId });
			}
		};
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
