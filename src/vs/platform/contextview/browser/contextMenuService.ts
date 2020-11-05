/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextMenuHandler, IContextMenuHandlerOptions } from './contextMenuHandler';
import { IContextViewService, IContextMenuService } from './contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Disposable } from 'vs/base/common/lifecycle';
import { ModifierKeyEmitter } from 'vs/base/browser/dom';

export class ContextMenuService extends Disposable implements IContextMenuService {
	declare readonly _serviceBrand: undefined;

	private contextMenuHandler: ContextMenuHandler;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IContextViewService contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService
	) {
		super();

		this.contextMenuHandler = new ContextMenuHandler(contextViewService, telemetryService, notificationService, keybindingService, themeService);
	}

	configure(options: IContextMenuHandlerOptions): void {
		this.contextMenuHandler.configure(options);
	}

	// ContextMenu

	showContextMenu(delegate: IContextMenuDelegate): void {
		this.contextMenuHandler.showContextMenu(delegate);
		ModifierKeyEmitter.getInstance().resetKeyStatus();
	}
}
