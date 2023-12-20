/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { AuxiliaryWindow, BrowserAuxiliaryWindowService, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { ISandboxGlobals } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowsConfiguration } from 'vs/platform/window/common/window';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { CodeWindow } from 'vs/base/browser/window';
import { mark } from 'vs/base/common/performance';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NativeWindow } from 'vs/workbench/electron-sandbox/window';
import { ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Barrier } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

type NativeCodeWindow = CodeWindow & {
	readonly vscode: ISandboxGlobals;
};

export class NativeAuxiliaryWindow extends AuxiliaryWindow {

	private skipUnloadConfirmation = false;

	constructor(
		window: CodeWindow,
		container: HTMLElement,
		stylesHaveLoaded: Barrier,
		@IConfigurationService configurationService: IConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(window, container, stylesHaveLoaded, configurationService);
	}

	protected override async confirmBeforeClose(e: BeforeUnloadEvent): Promise<void> {
		if (this.skipUnloadConfirmation) {
			return;
		}

		e.preventDefault();
		e.returnValue = true;

		const confirmed = await this.instantiationService.invokeFunction(accessor => NativeWindow.confirmOnShutdown(accessor, ShutdownReason.CLOSE));
		if (confirmed) {
			this.skipUnloadConfirmation = true;
			this.nativeHostService.closeWindow({ targetWindowId: this.window.vscodeWindowId });
		}
	}
}

export class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IConfigurationService configurationService: IConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IDialogService dialogService: IDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super(layoutService, dialogService, configurationService, telemetryService);
	}

	protected override async resolveWindowId(auxiliaryWindow: NativeCodeWindow): Promise<number> {
		mark('code/auxiliaryWindow/willResolveWindowId');
		const windowId = await auxiliaryWindow.vscode.ipcRenderer.invoke('vscode:registerAuxiliaryWindow', this.nativeHostService.windowId);
		mark('code/auxiliaryWindow/didResolveWindowId');

		return windowId;
	}

	protected override createContainer(auxiliaryWindow: NativeCodeWindow, disposables: DisposableStore) {

		// Zoom level
		const windowConfig = this.configurationService.getValue<IWindowsConfiguration>();
		const windowZoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;
		auxiliaryWindow.vscode.webFrame.setZoomLevel(windowZoomLevel);

		return super.createContainer(auxiliaryWindow, disposables);
	}

	protected override patchMethods(auxiliaryWindow: NativeCodeWindow): void {
		super.patchMethods(auxiliaryWindow);

		// Enable `window.focus()` to work in Electron by
		// asking the main process to focus the window.
		// https://github.com/electron/electron/issues/25578
		const that = this;
		const originalWindowFocus = auxiliaryWindow.focus.bind(auxiliaryWindow);
		auxiliaryWindow.focus = function () {
			if (that.environmentService.extensionTestsLocationURI) {
				return; // no focus when we are running tests from CLI
			}

			originalWindowFocus();

			if (!auxiliaryWindow.document.hasFocus()) {
				that.nativeHostService.focusWindow({ targetWindowId: auxiliaryWindow.vscodeWindowId });
			}
		};
	}

	protected override createAuxiliaryWindow(targetWindow: CodeWindow, container: HTMLElement, stylesHaveLoaded: Barrier,): AuxiliaryWindow {
		return new NativeAuxiliaryWindow(targetWindow, container, stylesHaveLoaded, this.configurationService, this.nativeHostService, this.instantiationService);
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
