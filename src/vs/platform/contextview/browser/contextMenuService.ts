/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ContextMenuHandler } from './contextMenuHandler';
import { IContextViewService, IContextMenuService } from './contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import Event, { Emitter } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';


export class ContextMenuService implements IContextMenuService {
	public _serviceBrand: any;

	private contextMenuHandler: ContextMenuHandler;
	private _onDidContextMenu = new Emitter<void>();

	constructor(container: HTMLElement, telemetryService: ITelemetryService, notificationService: INotificationService, contextViewService: IContextViewService) {
		this.contextMenuHandler = new ContextMenuHandler(container, contextViewService, telemetryService, notificationService);
	}

	public dispose(): void {
		this.contextMenuHandler.dispose();
	}

	public setContainer(container: HTMLElement): void {
		this.contextMenuHandler.setContainer(container);
	}

	// ContextMenu

	public showContextMenu(delegate: IContextMenuDelegate): void {
		this.contextMenuHandler.showContextMenu(delegate);
		this._onDidContextMenu.fire();
	}

	public get onDidContextMenu(): Event<void> {
		return this._onDidContextMenu.event;
	}
}
