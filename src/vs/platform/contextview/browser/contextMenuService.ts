/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ContextMenuHandler } from './contextMenuHandler';
import { IContextViewService, IContextMenuService, IContextMenuDelegate } from './contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';

export class ContextMenuService implements IContextMenuService {
	public _serviceBrand: any;

	private contextMenuHandler: ContextMenuHandler;

	constructor(container: HTMLElement, telemetryService: ITelemetryService, messageService: IMessageService, contextViewService: IContextViewService) {
		this.contextMenuHandler = new ContextMenuHandler(container, contextViewService, telemetryService, messageService);
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
	}
}