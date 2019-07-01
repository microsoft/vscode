/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IWindowService, IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, IDevToolsOptions, IOpenSettings, IURIToOpen, isFolderToOpen, isWorkspaceToOpen } from 'vs/platform/windows/common/windows';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WindowService extends Disposable implements IWindowService {

	readonly onDidChangeFocus: Event<boolean>;
	readonly onDidChangeMaximize: Event<boolean>;

	_serviceBrand: any;

	private _windowId: number;
	private remoteAuthority: string | undefined;

	private _hasFocus: boolean;
	get hasFocus(): boolean { return this._hasFocus; }

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();

		this._windowId = environmentService.configuration.windowId;
		this.remoteAuthority = environmentService.configuration.remoteAuthority;

		const onThisWindowFocus = Event.map(Event.filter(windowsService.onWindowFocus, id => id === this._windowId), _ => true);
		const onThisWindowBlur = Event.map(Event.filter(windowsService.onWindowBlur, id => id === this._windowId), _ => false);
		const onThisWindowMaximize = Event.map(Event.filter(windowsService.onWindowMaximize, id => id === this._windowId), _ => true);
		const onThisWindowUnmaximize = Event.map(Event.filter(windowsService.onWindowUnmaximize, id => id === this._windowId), _ => false);
		this.onDidChangeFocus = Event.any(onThisWindowFocus, onThisWindowBlur);
		this.onDidChangeMaximize = Event.any(onThisWindowMaximize, onThisWindowUnmaximize);

		this._hasFocus = document.hasFocus();
		this.isFocused().then(focused => this._hasFocus = focused);
		this._register(this.onDidChangeFocus(focus => this._hasFocus = focus));
	}

	get windowId(): number {
		return this._windowId;
	}

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickFileFolderAndOpen(options);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickFileAndOpen(options);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickFolderAndOpen(options);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickWorkspaceAndOpen(options);
	}

	reloadWindow(args?: ParsedArgs): Promise<void> {
		return this.windowsService.reloadWindow(this.windowId, args);
	}

	openDevTools(options?: IDevToolsOptions): Promise<void> {
		return this.windowsService.openDevTools(this.windowId, options);
	}

	toggleDevTools(): Promise<void> {
		return this.windowsService.toggleDevTools(this.windowId);
	}

	closeWorkspace(): Promise<void> {
		return this.windowsService.closeWorkspace(this.windowId);
	}

	enterWorkspace(path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return this.windowsService.enterWorkspace(this.windowId, path);
	}

	openWindow(uris: IURIToOpen[], options: IOpenSettings = {}): Promise<void> {
		if (!!this.remoteAuthority) {
			uris.forEach(u => u.label = u.label || this.getRecentLabel(u));
		}

		return this.windowsService.openWindow(this.windowId, uris, options);
	}

	closeWindow(): Promise<void> {
		return this.windowsService.closeWindow(this.windowId);
	}

	toggleFullScreen(target?: HTMLElement): Promise<void> {
		return this.windowsService.toggleFullScreen(this.windowId);
	}

	setRepresentedFilename(fileName: string): Promise<void> {
		return this.windowsService.setRepresentedFilename(this.windowId, fileName);
	}

	getRecentlyOpened(): Promise<IRecentlyOpened> {
		return this.windowsService.getRecentlyOpened(this.windowId);
	}

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return this.windowsService.addRecentlyOpened(recents);
	}

	removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		return this.windowsService.removeFromRecentlyOpened(paths);
	}

	focusWindow(): Promise<void> {
		return this.windowsService.focusWindow(this.windowId);
	}

	isFocused(): Promise<boolean> {
		return this.windowsService.isFocused(this.windowId);
	}

	isMaximized(): Promise<boolean> {
		return this.windowsService.isMaximized(this.windowId);
	}

	maximizeWindow(): Promise<void> {
		return this.windowsService.maximizeWindow(this.windowId);
	}

	unmaximizeWindow(): Promise<void> {
		return this.windowsService.unmaximizeWindow(this.windowId);
	}

	minimizeWindow(): Promise<void> {
		return this.windowsService.minimizeWindow(this.windowId);
	}

	onWindowTitleDoubleClick(): Promise<void> {
		return this.windowsService.onWindowTitleDoubleClick(this.windowId);
	}

	setDocumentEdited(flag: boolean): Promise<void> {
		return this.windowsService.setDocumentEdited(this.windowId, flag);
	}

	showMessageBox(options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		return this.windowsService.showMessageBox(this.windowId, options);
	}

	showSaveDialog(options: Electron.SaveDialogOptions): Promise<string> {
		return this.windowsService.showSaveDialog(this.windowId, options);
	}

	showOpenDialog(options: Electron.OpenDialogOptions): Promise<string[]> {
		return this.windowsService.showOpenDialog(this.windowId, options);
	}

	updateTouchBar(items: ISerializableCommandAction[][]): Promise<void> {
		return this.windowsService.updateTouchBar(this.windowId, items);
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return this.windowsService.resolveProxy(this.windowId, url);
	}

	private getRecentLabel(u: IURIToOpen): string {
		if (isFolderToOpen(u)) {
			return this.labelService.getWorkspaceLabel(u.folderUri, { verbose: true });
		} else if (isWorkspaceToOpen(u)) {
			return this.labelService.getWorkspaceLabel({ id: '', configPath: u.workspaceUri }, { verbose: true });
		} else {
			return this.labelService.getUriLabel(u.fileUri);
		}
	}
}

registerSingleton(IWindowService, WindowService);