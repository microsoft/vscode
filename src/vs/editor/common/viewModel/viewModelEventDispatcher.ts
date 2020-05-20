/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { ViewEvent } from 'vs/editor/common/view/viewEvents';
import { IContentSizeChangedEvent } from 'vs/editor/common/editorCommon';

export class ViewModelEventDispatcher {

	private readonly _eventHandlers: ViewEventHandler[];
	private _viewEventQueue: ViewEvent[] | null;
	private _isConsumingViewEventQueue: boolean;
	// private _outgoingContentSizeChangedEvent: OutgoingContentSizeChangedEvent | null;

	constructor() {
		this._eventHandlers = [];
		this._viewEventQueue = null;
		this._isConsumingViewEventQueue = false;
		// this._outgoingContentSizeChangedEvent = null;
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

	public emitMany(events: ViewEvent[]): void {
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

export class OutgoingContentSizeChangedEvent implements IContentSizeChangedEvent {

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
}
