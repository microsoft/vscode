/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { AuxiliaryWindow, AuxiliaryWindowMode, BrowserAuxiliaryWindowService, IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
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
import { getZoomLevel, isFullscreen, setFullscreen } from 'vs/base/browser/browser';
import { getActiveWindow } from 'vs/base/browser/dom';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { isMacintosh } from 'vs/base/common/platform';

type NativeCodeWindow = CodeWindow & {
	readonly vscode: ISandboxGlobals;
};

export class NativeAuxiliaryWindow extends AuxiliaryWindow {

	private skipUnloadConfirmation = false;

	private maximized = false;

	constructor(
		window: CodeWindow,
		container: HTMLElement,
		stylesHaveLoaded: Barrier,
		@IConfigurationService configurationService: IConfigurationService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(window, container, stylesHaveLoaded, configurationService, hostService, environmentService);

		if (!isMacintosh) {
			// For now, limit this to platforms that have clear maximised
			// transitions (Windows, Linux) via window buttons.
			this.handleMaximizedState();
		}

		this.handleFullScreenState();
	}

	private handleMaximizedState(): void {
		(async () => {
			this.maximized = await this.nativeHostService.isMaximized({ targetWindowId: this.window.vscodeWindowId });
		})();

		this._register(this.nativeHostService.onDidMaximizeWindow(windowId => {
			if (windowId === this.window.vscodeWindowId) {
				this.maximized = true;
			}
		}));

		this._register(this.nativeHostService.onDidUnmaximizeWindow(windowId => {
			if (windowId === this.window.vscodeWindowId) {
				this.maximized = false;
			}
		}));
	}

	private async handleFullScreenState(): Promise<void> {
		const fullscreen = await this.nativeHostService.isFullScreen({ targetWindowId: this.window.vscodeWindowId });
		if (fullscreen) {
			setFullscreen(true, this.window);
		}
	}

	protected override async handleVetoBeforeClose(e: BeforeUnloadEvent, veto: string): Promise<void> {
		this.preventUnload(e);

		await this.dialogService.error(veto, localize('backupErrorDetails', "Try saving or reverting the editors with unsaved changes first and then try again."));
	}

	protected override async confirmBeforeClose(e: BeforeUnloadEvent): Promise<void> {
		if (this.skipUnloadConfirmation) {
			return;
		}

		this.preventUnload(e);

		const confirmed = await this.instantiationService.invokeFunction(accessor => NativeAuxiliaryWindow.confirmOnShutdown(accessor, ShutdownReason.CLOSE));
		if (confirmed) {
			this.skipUnloadConfirmation = true;
			this.nativeHostService.closeWindow({ targetWindowId: this.window.vscodeWindowId });
		}
	}

	protected override preventUnload(e: BeforeUnloadEvent): void {
		e.preventDefault();
		e.returnValue = true;
	}

	override createState(): IAuxiliaryWindowOpenOptions {
		const state = super.createState();
		const fullscreen = isFullscreen(this.window);
		return {
			...state,
			bounds: state.bounds,
			mode: this.maximized ? AuxiliaryWindowMode.Maximized : fullscreen ? AuxiliaryWindowMode.Fullscreen : AuxiliaryWindowMode.Normal
		};
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
		return new NativeAuxiliaryWindow(targetWindow, container, stylesHaveLoaded, this.configurationService, this.nativeHostService, this.instantiationService, this.hostService, this.environmentService, this.dialogService);
	}
}

registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, InstantiationType.Delayed);
