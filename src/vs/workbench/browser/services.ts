/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EditorEvent} from 'vs/workbench/browser/events';
import {EventType, ViewletEvent} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';

export abstract class ScopedService {
	private _eventService: IEventService;
	private scopeId: string;

	constructor(eventService: IEventService, scopeId: string) {
		this._eventService = eventService;
		this.scopeId = scopeId;

		this.registerListeners();
	}

	public get eventService(): IEventService {
		return this._eventService;
	}

	public registerListeners(): void {
		this.eventService.addListener(EventType.EDITOR_CLOSED, (e: EditorEvent) => {
			if (e.editorId === this.scopeId) {
				this.onScopeDeactivated();
			}
		});

		this.eventService.addListener(EventType.EDITOR_OPENED, (e: EditorEvent) => {
			if (e.editorId === this.scopeId) {
				this.onScopeActivated();
			}
		});

		this.eventService.addListener(EventType.VIEWLET_CLOSED, (e: ViewletEvent) => {
			if (e.viewletId === this.scopeId) {
				this.onScopeDeactivated();
			}
		});

		this.eventService.addListener(EventType.VIEWLET_OPENED, (e: ViewletEvent) => {
			if (e.viewletId === this.scopeId) {
				this.onScopeActivated();
			}
		});
	}

	public abstract onScopeActivated(): void;

	public abstract onScopeDeactivated(): void;
}