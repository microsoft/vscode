/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Errors = require('vs/base/common/errors');
import { IDisposable } from 'vs/base/common/lifecycle';

export class EmitterEvent {

	public readonly type: string;
	public readonly data: any;

	constructor(eventType: string = null, data: any = null) {
		this.type = eventType;
		this.data = data;
	}
}

export interface ListenerCallback {
	(value: any): void;
}

export interface IEventEmitter extends IDisposable {
	addListener(eventType: string, listener: ListenerCallback): IDisposable;
	addOneTimeListener(eventType: string, listener: ListenerCallback): IDisposable;
}

export interface IListenersMap {
	[key: string]: ListenerCallback[];
}

export class EventEmitter implements IEventEmitter {

	protected _listeners: IListenersMap;
	private _collectedEvents: EmitterEvent[];
	private _deferredCnt: number;
	private _allowedEventTypes: { [eventType: string]: boolean; };

	constructor(allowedEventTypes: string[] = null) {
		this._listeners = {};
		this._collectedEvents = [];
		this._deferredCnt = 0;
		if (allowedEventTypes) {
			this._allowedEventTypes = {};
			for (let i = 0; i < allowedEventTypes.length; i++) {
				this._allowedEventTypes[allowedEventTypes[i]] = true;
			}
		} else {
			this._allowedEventTypes = null;
		}
	}

	public dispose(): void {
		this._listeners = {};
		this._collectedEvents = [];
		this._deferredCnt = 0;
		this._allowedEventTypes = null;
	}

	public addListener(eventType: string, listener: ListenerCallback): IDisposable {
		if (eventType === '*') {
			throw new Error('Use addBulkListener(listener) to register your listener!');
		}

		if (this._allowedEventTypes && !this._allowedEventTypes.hasOwnProperty(eventType)) {
			throw new Error('This object will never emit this event type!');
		}

		if (this._listeners.hasOwnProperty(eventType)) {
			this._listeners[eventType].push(listener);
		} else {
			this._listeners[eventType] = [listener];
		}

		let bound = this;
		return {
			dispose: () => {
				if (!bound) {
					// Already called
					return;
				}

				bound._removeListener(eventType, listener);

				// Prevent leakers from holding on to the event emitter
				bound = null;
				listener = null;
			}
		};
	}

	public addOneTimeListener(eventType: string, listener: ListenerCallback): IDisposable {
		const disposable = this.addListener(eventType, value => {
			disposable.dispose();
			listener(value);
		});

		return disposable;
	}

	private _removeListener(eventType: string, listener: ListenerCallback): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			let listeners = this._listeners[eventType];
			for (let i = 0, len = listeners.length; i < len; i++) {
				if (listeners[i] === listener) {
					listeners.splice(i, 1);
					break;
				}
			}
		}
	}

	protected _emitToSpecificTypeListeners(eventType: string, data: any): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			const listeners = this._listeners[eventType].slice(0);
			for (let i = 0, len = listeners.length; i < len; i++) {
				safeInvoke1Arg(listeners[i], data);
			}
		}
	}

	protected _emitEvents(events: EmitterEvent[]): void {
		for (let i = 0, len = events.length; i < len; i++) {
			const e = events[i];

			this._emitToSpecificTypeListeners(e.type, e.data);
		}
	}

	public emit(eventType: string, data: any = {}): void {
		if (this._allowedEventTypes && !this._allowedEventTypes.hasOwnProperty(eventType)) {
			throw new Error('Cannot emit this event type because it wasn\'t listed!');
		}
		// Early return if no listeners would get this
		if (!this._listeners.hasOwnProperty(eventType)) {
			return;
		}
		const emitterEvent = new EmitterEvent(eventType, data);

		if (this._deferredCnt === 0) {
			this._emitEvents([emitterEvent]);
		} else {
			// Collect for later
			this._collectedEvents.push(emitterEvent);
		}
	}

	public beginDeferredEmit(): void {
		this._deferredCnt = this._deferredCnt + 1;
	}

	public endDeferredEmit(): void {
		this._deferredCnt = this._deferredCnt - 1;

		if (this._deferredCnt === 0) {
			this._emitCollected();
		}
	}

	public deferredEmit<T>(callback: () => T): T {
		this.beginDeferredEmit();

		let result: T = safeInvokeNoArg<T>(callback);

		this.endDeferredEmit();

		return result;
	}

	private _emitCollected(): void {
		if (this._collectedEvents.length === 0) {
			return;
		}
		// Flush collected events
		const events = this._collectedEvents;
		this._collectedEvents = [];
		this._emitEvents(events);
	}
}

class EmitQueueElement {
	public target: Function;
	public arg: any;

	constructor(target: Function, arg: any) {
		this.target = target;
		this.arg = arg;
	}
}

/**
 * Same as EventEmitter, but guarantees events are delivered in order to each listener
 */
export class OrderGuaranteeEventEmitter extends EventEmitter {

	private _emitQueue: EmitQueueElement[];

	constructor() {
		super(null);
		this._emitQueue = [];
	}

	protected _emitToSpecificTypeListeners(eventType: string, data: any): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			let listeners = this._listeners[eventType];
			for (let i = 0, len = listeners.length; i < len; i++) {
				this._emitQueue.push(new EmitQueueElement(listeners[i], data));
			}
		}
	}

	protected _emitEvents(events: EmitterEvent[]): void {
		super._emitEvents(events);

		while (this._emitQueue.length > 0) {
			let queueElement = this._emitQueue.shift();
			safeInvoke1Arg(queueElement.target, queueElement.arg);
		}
	}
}

function safeInvokeNoArg<T>(func: Function): T {
	try {
		return func();
	} catch (e) {
		Errors.onUnexpectedError(e);
	}
	return undefined;
}

function safeInvoke1Arg(func: Function, arg1: any): any {
	try {
		return func(arg1);
	} catch (e) {
		Errors.onUnexpectedError(e);
	}
}
