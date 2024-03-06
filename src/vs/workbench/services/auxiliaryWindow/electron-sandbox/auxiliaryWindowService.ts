/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { AuxiliaryWindow, BrowserAuxiliaryWindowService, IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { ISandboxGlobals } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { CodeWindow } from 'vs/base/browser/window';
import { mark } from 'vs/base/common/performance';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Barrier } from 'vs/base/common/async';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { applyZoom } from 'vs/platform/window/electron-sandbox/window';
import { getZoomLevel } from 'vs/base/browser/browser';
import { getActiveWindow } from 'vs/base/browser/dom';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

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
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super(window, container, stylesHaveLoaded, configurationService, hostService, environmentService);
	}

	protected override async confirmBeforeClose(e: BeforeUnloadEvent): Promise<void> {
		if (this.skipUnloadConfirmation) {
			return;
		}

		e.preventDefault();
		e.returnValue = true;

		const confirmed = await this.instantiationService.invokeFunction(accessor => NativeAuxiliaryWindow.confirmOnShutdown(accessor, ShutdownReason.CLOSE));
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
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super(layoutService, dialogService, configurationService, telemetryService, hostService, environmentService);
	}

	protected override async resolveWindowId(auxiliaryWindow: NativeCodeWindow): Promise<number> {
		mark('code/auxiliaryWindow/willResolveWindowId');
		const windowId = await auxiliaryWindow.vscode.ipcRenderer.invoke('vscode:registerAuxiliaryWindow', this.nativeHostService.windowId);
		mark('code/auxiliaryWindow/didResolveWindowId');

		return windowId;
	}

	protected override createContainer(auxiliaryWindow: NativeCodeWindow, disposables: DisposableStore, options?: IAuxiliaryWindowOpenOptions) {

		// Zoom level (either explicitly provided or inherited from main window)
		let windowZoomLevel: number;
		if (typeof options?.zoomLevel === 'number') {
			windowZoomLevel = options.zoomLevel;
		} else {
			windowZoomLevel = getZoomLevel(getActiveWindow());
		}

		applyZoom(windowZoomLevel, auxiliaryWindow);

		return super.createContainer(auxiliaryWindow, disposables);
	}

	protected override createAuxiliaryWindow(targetWindow: CodeWindow, container: HTMLElement, stylesHaveLoaded: Barrier,): AuxiliaryWindow {
		return new NativeAuxiliaryWindow(targetWindow, container, stylesHaveLoaded, this.configurationService, this.nativeHostService, this.instantiationService, this.hostService, this.environmentService);
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
