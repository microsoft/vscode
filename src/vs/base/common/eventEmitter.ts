/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Errors = require('vs/base/common/errors');
import { IDisposable } from 'vs/base/common/lifecycle';

export class EmitterEvent {

	private _type: string;
	private _data: any;

	constructor(eventType: string = null, data: any = null) {
		this._type = eventType;
		this._data = data;
	}

	public getType(): string {
		return this._type;
	}

	public getData(): any {
		return this._data;
	}
}

export interface ListenerCallback {
	(value: any): void;
}

export interface BulkListenerCallback {
	(value: EmitterEvent[]): void;
}

export interface IEventEmitter extends IDisposable {
	addListener2(eventType: string, listener: ListenerCallback): IDisposable;
	addOneTimeDisposableListener(eventType: string, listener: ListenerCallback): IDisposable;
	addBulkListener2(listener: BulkListenerCallback): IDisposable;
	addEmitter2(eventEmitter: IEventEmitter): IDisposable;
}

export interface IListenersMap {
	[key: string]: ListenerCallback[];
}

export class EventEmitter implements IEventEmitter {

	protected _listeners: IListenersMap;
	protected _bulkListeners: ListenerCallback[];
	private _collectedEvents: EmitterEvent[];
	private _deferredCnt: number;
	private _allowedEventTypes: { [eventType: string]: boolean; };

	constructor(allowedEventTypes: string[] = null) {
		this._listeners = {};
		this._bulkListeners = [];
		this._collectedEvents = [];
		this._deferredCnt = 0;
		if (allowedEventTypes) {
			this._allowedEventTypes = {};
			for (var i = 0; i < allowedEventTypes.length; i++) {
				this._allowedEventTypes[allowedEventTypes[i]] = true;
			}
		} else {
			this._allowedEventTypes = null;
		}
	}

	public dispose(): void {
		this._listeners = {};
		this._bulkListeners = [];
		this._collectedEvents = [];
		this._deferredCnt = 0;
		this._allowedEventTypes = null;
	}

	private addListener(eventType: string, listener: ListenerCallback): IDisposable {
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

		var bound = this;
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

	public addListener2(eventType: string, listener: ListenerCallback): IDisposable {
		return this.addListener(eventType, listener);
	}

	public addOneTimeDisposableListener(eventType: string, listener: ListenerCallback): IDisposable {
		const disposable = this.addListener(eventType, value => {
			disposable.dispose();
			listener(value);
		});

		return disposable;
	}

	protected addBulkListener(listener: BulkListenerCallback): IDisposable {

		this._bulkListeners.push(listener);

		return {
			dispose: () => {
				this._removeBulkListener(listener);
			}
		};
	}

	public addBulkListener2(listener: BulkListenerCallback): IDisposable {
		return this.addBulkListener(listener);
	}

	private addEmitter(eventEmitter: IEventEmitter): IDisposable {
		return eventEmitter.addBulkListener2((events: EmitterEvent[]): void => {
			var newEvents = events;

			if (this._deferredCnt === 0) {
				this._emitEvents(<EmitterEvent[]>newEvents);
			} else {
				// Collect for later
				this._collectedEvents.push.apply(this._collectedEvents, newEvents);
			}
		});
	}

	public addEmitter2(eventEmitter: IEventEmitter): IDisposable {
		return this.addEmitter(eventEmitter);
	}

	private _removeListener(eventType: string, listener: ListenerCallback): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			var listeners = this._listeners[eventType];
			for (var i = 0, len = listeners.length; i < len; i++) {
				if (listeners[i] === listener) {
					listeners.splice(i, 1);
					break;
				}
			}

		}
	}

	private _removeBulkListener(listener: BulkListenerCallback): void {
		for (var i = 0, len = this._bulkListeners.length; i < len; i++) {
			if (this._bulkListeners[i] === listener) {
				this._bulkListeners.splice(i, 1);
				break;
			}
		}
	}

	protected _emitToSpecificTypeListeners(eventType: string, data: any): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			var listeners = this._listeners[eventType].slice(0);
			for (var i = 0, len = listeners.length; i < len; i++) {
				safeInvoke1Arg(listeners[i], data);
			}
		}
	}

	protected _emitToBulkListeners(events: EmitterEvent[]): void {
		var bulkListeners = this._bulkListeners.slice(0);
		for (var i = 0, len = bulkListeners.length; i < len; i++) {
			safeInvoke1Arg(bulkListeners[i], events);
		}
	}

	protected _emitEvents(events: EmitterEvent[]): void {
		if (this._bulkListeners.length > 0) {
			this._emitToBulkListeners(events);
		}
		for (var i = 0, len = events.length; i < len; i++) {
			var e = events[i];

			this._emitToSpecificTypeListeners(e.getType(), e.getData());
		}
	}

	public emit(eventType: string, data: any = {}): void {
		if (this._allowedEventTypes && !this._allowedEventTypes.hasOwnProperty(eventType)) {
			throw new Error('Cannot emit this event type because it wasn\'t white-listed!');
		}
		// Early return if no listeners would get this
		if (!this._listeners.hasOwnProperty(eventType) && this._bulkListeners.length === 0) {
			return;
		}
		var emitterEvent = new EmitterEvent(eventType, data);

		if (this._deferredCnt === 0) {
			this._emitEvents([emitterEvent]);
		} else {
			// Collect for later
			this._collectedEvents.push(emitterEvent);
		}
	}

	protected _beginDeferredEmit(): void {
		this._deferredCnt = this._deferredCnt + 1;
	}

	protected _endDeferredEmit(): void {
		this._deferredCnt = this._deferredCnt - 1;

		if (this._deferredCnt === 0) {
			this._emitCollected();
		}
	}

	public deferredEmit<T>(callback: () => T): T {
		this._beginDeferredEmit();

		let result: T = safeInvokeNoArg<T>(callback);

		this._endDeferredEmit();

		return result;
	}

	private _emitCollected(): void {
		// Flush collected events
		var events = this._collectedEvents;
		this._collectedEvents = [];

		if (events.length > 0) {
			this._emitEvents(events);
		}
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

	constructor(allowedEventTypes: string[] = null) {
		super(allowedEventTypes);
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

	protected _emitToBulkListeners(events: EmitterEvent[]): void {
		let bulkListeners = this._bulkListeners;
		for (let i = 0, len = bulkListeners.length; i < len; i++) {
			this._emitQueue.push(new EmitQueueElement(bulkListeners[i], events));
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
