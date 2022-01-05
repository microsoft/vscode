/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';
import { ModifierKeyEmitter } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ContextMenuHandler, IContextMenuHandlerOptions } from './contextMenuHandler';
import { IContextMenuService, IContextViewService } from './contextView';

export class ContextMenuService extends Disposable implements IContextMenuService {
	declare readonly _serviceBrand: undefined;

	private contextMenuHandler: ContextMenuHandler;

	private readonly _onDidShowContextMenu = new Emitter<void>();
	readonly onDidShowContextMenu = this._onDidShowContextMenu.event;

	private readonly _onDidHideContextMenu = new Emitter<void>();
	readonly onDidHideContextMenu = this._onDidHideContextMenu.event;

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
		this.contextMenuHandler.showContextMenu({
			...delegate,
			onHide: (didCancel) => {
				if (delegate.onHide) {
					delegate.onHide(didCancel);
				}

				this._onDidHideContextMenu.fire();
			}
		});
		ModifierKeyEmitter.getInstance().resetKeyStatus();
		this._onDidShowContextMenu.fire();
	}
}
