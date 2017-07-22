/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { ViewEvent } from 'vs/editor/common/view/viewEvents';

export class ViewEventDispatcher {

	private _eventHandlerGateKeeper: (callback: () => void) => void;
	private _eventHandlers: ViewEventHandler[];
	private _eventQueue: ViewEvent[];
	private _isConsumingQueue: boolean;

	constructor(eventHandlerGateKeeper: (callback: () => void) => void) {
		this._eventHandlerGateKeeper = eventHandlerGateKeeper;
		this._eventHandlers = [];
		this._eventQueue = null;
		this._isConsumingQueue = false;
	}

	public addEventHandler(eventHandler: ViewEventHandler): void {
		for (let i = 0, len = this._eventHandlers.length; i < len; i++) {
			if (this._eventHandlers[i] === eventHandler) {
				console.warn('Detected duplicate listener in ViewEventDispatcher', eventHandler);
			}
		}
		this._eventHandlers.push(eventHandler);
	}

	public removeEventHandler(eventHandler: ViewEventHandler): void {
		for (let i = 0; i < this._eventHandlers.length; i++) {
			if (this._eventHandlers[i] === eventHandler) {
				this._eventHandlers.splice(i, 1);
				break;
			}
		}
	}

	public emit(event: ViewEvent): void {

		if (this._eventQueue) {
			this._eventQueue.push(event);
		} else {
			this._eventQueue = [event];
		}

		if (!this._isConsumingQueue) {
			this.consumeQueue();
		}
	}

	public emitMany(events: ViewEvent[]): void {
		if (this._eventQueue) {
			this._eventQueue = this._eventQueue.concat(events);
		} else {
			this._eventQueue = events;
		}

		if (!this._isConsumingQueue) {
			this.consumeQueue();
		}
	}

	private consumeQueue(): void {
		this._eventHandlerGateKeeper(() => {
			try {
				this._isConsumingQueue = true;

				this._doConsumeQueue();

			} finally {
				this._isConsumingQueue = false;
			}
		});
	}

	private _doConsumeQueue(): void {
		while (this._eventQueue) {
			// Empty event queue, as events might come in while sending these off
			let events = this._eventQueue;
			this._eventQueue = null;

			// Use a clone of the event handlers list, as they might remove themselves
			let eventHandlers = this._eventHandlers.slice(0);
			for (let i = 0, len = eventHandlers.length; i < len; i++) {
				eventHandlers[i].handleEvents(events);
			}
		}
	}
}
