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
import { IWindowOpenable, IOpenWindowOptions, isFolderToOpen, isWorkspaceToOpen, IOpenEmptyWindowOptions } from 'vs/platform/windows/common/windows';
import { Disposable } from 'vs/base/common/lifecycle';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';

export class DesktopHostService extends Disposable implements IHostService {

	_serviceBrand: undefined;

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

	get onDidChangeFocus(): Event<boolean> { return this._onDidChangeFocus; }
	private _onDidChangeFocus: Event<boolean> = Event.any(
		Event.map(Event.filter(this.electronService.onWindowFocus, id => id === this.electronEnvironmentService.windowId), _ => true),
		Event.map(Event.filter(this.electronService.onWindowBlur, id => id === this.electronEnvironmentService.windowId), _ => false)
	);

	private _hasFocus: boolean;
	get hasFocus(): boolean { return this._hasFocus; }

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;
	openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> {
		if (Array.isArray(arg1)) {
			return this.doOpenWindow(arg1, arg2);
		}

		return this.doOpenEmptyWindow(arg1);
	}

	private doOpenWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
		if (!!this.environmentService.configuration.remoteAuthority) {
			toOpen.forEach(openable => openable.label = openable.label || this.getRecentLabel(openable));
		}

		return this.electronService.openWindow(toOpen, options);
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

	private doOpenEmptyWindow(options?: IOpenEmptyWindowOptions): Promise<void> {
		return this.electronService.openWindow(options);
	}

	toggleFullScreen(): Promise<void> {
		return this.electronService.toggleFullScreen();
	}

	focus(): Promise<void> {
		return this.electronService.focusWindow();
	}

	restart(): Promise<void> {
		return this.electronService.relaunch();
	}

	reload(): Promise<void> {
		return this.electronService.reload();
	}

	closeWorkspace(): Promise<void> {
		return this.electronService.closeWorkspace();
	}
}

registerSingleton(IHostService, DesktopHostService, true);
