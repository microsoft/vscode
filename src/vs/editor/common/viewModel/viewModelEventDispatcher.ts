/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { ViewEvent, ViewEventsCollector } from 'vs/editor/common/view/viewEvents';
import { IContentSizeChangedEvent } from 'vs/editor/common/editorCommon';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export class ViewModelEventDispatcher extends Disposable {

	private readonly _onEvent = this._register(new Emitter<OutgoingViewModelEvent>());
	public readonly onEvent = this._onEvent.event;

	private readonly _eventHandlers: ViewEventHandler[];
	private _viewEventQueue: ViewEvent[] | null;
	private _isConsumingViewEventQueue: boolean;
	private _collector: ViewEventsCollector | null;
	private _collectorCnt: number;
	private _outgoingEvents: OutgoingViewModelEvent[];

	constructor() {
		super();
		this._eventHandlers = [];
		this._viewEventQueue = null;
		this._isConsumingViewEventQueue = false;
		this._collector = null;
		this._collectorCnt = 0;
		this._outgoingEvents = [];
	}

	public emitOutgoingEvent(e: OutgoingViewModelEvent): void {
		this._addOutgoingEvent(e);
		this._emitOugoingEvents();
	}

	private _addOutgoingEvent(e: OutgoingViewModelEvent): void {
		for (let i = 0, len = this._outgoingEvents.length; i < len; i++) {
			if (this._outgoingEvents[i].kind === e.kind) {
				this._outgoingEvents[i] = this._outgoingEvents[i].merge(e);
				return;
			}
		}
		// not merged
		this._outgoingEvents.push(e);
	}

	private _emitOugoingEvents(): void {
		while (this._outgoingEvents.length > 0) {
			if (this._collector || this._isConsumingViewEventQueue) {
				// right now collecting or emitting view events, so let's postpone emitting
				return;
			}
			const event = this._outgoingEvents.shift()!;
			this._onEvent.fire(event);
		}
	}

	public addViewEventHandler(eventHandler: ViewEventHandler): void {
		for (let i = 0, len = this._eventHandlers.length; i < len; i++) {
			if (this._eventHandlers[i] === eventHandler) {
				console.warn('Detected duplicate listener in ViewEventDispatcher', eventHandler);
			}
		}
		this._eventHandlers.push(eventHandler);
	}

	public removeViewEventHandler(eventHandler: ViewEventHandler): void {
		for (let i = 0; i < this._eventHandlers.length; i++) {
			if (this._eventHandlers[i] === eventHandler) {
				this._eventHandlers.splice(i, 1);
				break;
			}
		}
	}

	public beginEmitViewEvents(): ViewEventsCollector {
		this._collectorCnt++;
		if (this._collectorCnt === 1) {
			this._collector = new ViewEventsCollector();
		}
		return this._collector!;
	}

	public endEmitViewEvents(): void {
		this._collectorCnt--;
		if (this._collectorCnt === 0) {
			const events = this._collector!.finalize();
			this._collector = null;
			if (events.length > 0) {
				this._emitMany(events);
			}
		}
		this._emitOugoingEvents();
	}

	public emitSingleViewEvent(event: ViewEvent): void {
		try {
			const eventsCollector = this.beginEmitViewEvents();
			eventsCollector.emit(event);
		} finally {
			this.endEmitViewEvents();
		}
	}

	private _emitMany(events: ViewEvent[]): void {
		if (this._viewEventQueue) {
			this._viewEventQueue = this._viewEventQueue.concat(events);
		} else {
			this._viewEventQueue = events;
		}

		if (!this._isConsumingViewEventQueue) {
			this._consumeViewEventQueue();
		}
	}

	private _consumeViewEventQueue(): void {
		try {
			this._isConsumingViewEventQueue = true;
			this._doConsumeQueue();
		} finally {
			this._isConsumingViewEventQueue = false;
		}
	}

	private _doConsumeQueue(): void {
		while (this._viewEventQueue) {
			// Empty event queue, as events might come in while sending these off
			const events = this._viewEventQueue;
			this._viewEventQueue = null;

			// Use a clone of the event handlers list, as they might remove themselves
			const eventHandlers = this._eventHandlers.slice(0);
			for (const eventHandler of eventHandlers) {
				eventHandler.handleEvents(events);
			}
		}
	}
}

export const enum OutgoingViewModelEventKind {
	ContentSizeChanged,
}

export class ContentSizeChangedEvent implements IContentSizeChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.ContentSizeChanged;

	private readonly _oldContentWidth: number;
	private readonly _oldContentHeight: number;

	readonly contentWidth: number;
	readonly contentHeight: number;
	readonly contentWidthChanged: boolean;
	readonly contentHeightChanged: boolean;

	constructor(oldContentWidth: number, oldContentHeight: number, contentWidth: number, contentHeight: number) {
		this._oldContentWidth = oldContentWidth;
		this._oldContentHeight = oldContentHeight;
		this.contentWidth = contentWidth;
		this.contentHeight = contentHeight;
		this.contentWidthChanged = (this._oldContentWidth !== this.contentWidth);
		this.contentHeightChanged = (this._oldContentHeight !== this.contentHeight);
	}

	public merge(other: ContentSizeChangedEvent): ContentSizeChangedEvent {
		return new ContentSizeChangedEvent(this._oldContentWidth, this._oldContentHeight, other.contentWidth, other.contentHeight);
	}
}

export type OutgoingViewModelEvent = ContentSizeChangedEvent;
