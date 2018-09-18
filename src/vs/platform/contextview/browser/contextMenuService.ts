/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ContextMenuHandler } from './contextMenuHandler';
import { IContextViewService, IContextMenuService } from './contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Event, Emitter } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Disposable } from 'vs/base/common/lifecycle';

export class ContextMenuService extends Disposable implements IContextMenuService {
	_serviceBrand: any;

	private _onDidContextMenu = this._register(new Emitter<void>());
	get onDidContextMenu(): Event<void> { return this._onDidContextMenu.event; }

	private contextMenuHandler: ContextMenuHandler;

	constructor(
		container: HTMLElement,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IContextViewService contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService
	) {
		super();

		this.contextMenuHandler = this._register(new ContextMenuHandler(container, contextViewService, telemetryService, notificationService, keybindingService, themeService));
	}

	dispose(): void {
		this.contextMenuHandler.dispose();
	}

	setContainer(container: HTMLElement): void {
		this.contextMenuHandler.setContainer(container);
	}

	// ContextMenu

	showContextMenu(delegate: IContextMenuDelegate): void {
		this.contextMenuHandler.showContextMenu(delegate);
		this._onDidContextMenu.fire();
	}
}
