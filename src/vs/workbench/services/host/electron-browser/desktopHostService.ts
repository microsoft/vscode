/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWindowOpenable, IOpenInWindowOptions, isFolderToOpen, isWorkspaceToOpen, IOpenEmptyWindowOptions } from 'vs/platform/windows/common/windows';
import { Disposable } from 'vs/base/common/lifecycle';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';

export class DesktopHostService extends Disposable implements IHostService {

	_serviceBrand: undefined;

	//#region Events

	get onDidChangeFocus(): Event<boolean> { return this._onDidChangeFocus; }
	private _onDidChangeFocus: Event<boolean> = Event.any(
		Event.map(Event.filter(this.electronService.onWindowFocus, id => id === this.electronEnvironmentService.windowId), _ => true),
		Event.map(Event.filter(this.electronService.onWindowBlur, id => id === this.electronEnvironmentService.windowId), _ => false)
	);

	//#endregion

	constructor(
		@IElectronService private readonly electronService: IElectronService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IElectronEnvironmentService private readonly electronEnvironmentService: IElectronEnvironmentService
	) {
		super();

		// Resolve initial window focus state
		this._hasFocus = document.hasFocus();
		electronService.isWindowFocused().then(focused => this._hasFocus = focused);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidChangeFocus(focus => this._hasFocus = focus));
	}

	//#region Window

	private _hasFocus: boolean;
	get hasFocus(): boolean { return this._hasFocus; }

	get windowCount(): Promise<number> { return this.electronService.getWindowCount(); }

	openInWindow(toOpen: IWindowOpenable[], options?: IOpenInWindowOptions): Promise<void> {
		if (!!this.environmentService.configuration.remoteAuthority) {
			toOpen.forEach(openable => openable.label = openable.label || this.getRecentLabel(openable));
		}

		return this.electronService.openInWindow(toOpen, options);
	}

	private getRecentLabel(openable: IWindowOpenable): string {
		if (isFolderToOpen(openable)) {
			return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: true });
		}

		if (isWorkspaceToOpen(openable)) {
			return this.labelService.getWorkspaceLabel({ id: '', configPath: openable.workspaceUri }, { verbose: true });
		}

		return this.labelService.getUriLabel(openable.fileUri);
	}

	openEmptyWindow(options?: IOpenEmptyWindowOptions): Promise<void> {
		return this.electronService.openEmptyWindow(options);
	}

	toggleFullScreen(): Promise<void> {
		return this.electronService.toggleFullScreen();
	}

	focus(): Promise<void> {
		return this.electronService.focusWindow();
	}

	//#endregion

	restart(): Promise<void> {
		return this.electronService.relaunch();
	}

	reload(): Promise<void> {
		return this.electronService.reload();
	}

	closeWorkspace(): Promise<void> {
		return this.electronService.closeWorkpsace();
	}
}

registerSingleton(IHostService, DesktopHostService, true);
