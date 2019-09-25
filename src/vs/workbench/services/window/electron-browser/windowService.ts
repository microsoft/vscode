/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WindowService extends Disposable implements IWindowService {

	readonly onDidChangeFocus: Event<boolean>;
	readonly onDidChangeMaximize: Event<boolean>;

	_serviceBrand: undefined;

	private _windowId: number;

	private _hasFocus: boolean;
	get hasFocus(): boolean { return this._hasFocus; }

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWindowsService private readonly windowsService: IWindowsService,
	) {
		super();

		this._windowId = environmentService.configuration.windowId;

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

	getRecentlyOpened(): Promise<IRecentlyOpened> {
		return this.windowsService.getRecentlyOpened(this.windowId);
	}

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return this.windowsService.addRecentlyOpened(recents);
	}

	removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		return this.windowsService.removeFromRecentlyOpened(paths);
	}

	isFocused(): Promise<boolean> {
		return this.windowsService.isFocused(this.windowId);
	}
}

registerSingleton(IWindowService, WindowService);
