/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Errors = require('vs/base/common/errors');
import Lifecycle = require('vs/base/common/lifecycle');

export interface IEmitterEvent {
	getType():string;
	getData():any;
}

export class EmitterEvent implements IEmitterEvent {

	private _type:string;
	private _data:any;
	private _emitterType:string;

	constructor(eventType:string, data:any, emitterType:string=null) {
		this._type = eventType;
		this._data = data;
		this._emitterType = emitterType;
	}

	public getType():string {
		return this._type;
	}

	public getData():any {
		return this._data;
	}

	public getEmitterType():string {
		return this._emitterType;
	}
}

export interface ListenerCallback {
	(value:any):void;
}

export interface IBulkListenerCallback {
	(value:IEmitterEvent[]):void;
}

export interface ListenerUnbind {
	():void;
}

export interface IEventEmitter extends Lifecycle.IDisposable {
	addListener(eventType:string, listener:ListenerCallback):ListenerUnbind;
	addListener2(eventType:string, listener:ListenerCallback):Lifecycle.IDisposable;
	addOneTimeListener(eventType:string, listener:ListenerCallback):ListenerUnbind;

	addBulkListener(listener:IBulkListenerCallback):ListenerUnbind;
	addBulkListener2(listener:IBulkListenerCallback):Lifecycle.IDisposable;

	addEmitter(eventEmitter:IEventEmitter, emitterType?:string):ListenerUnbind;
	addEmitter2(eventEmitter:IEventEmitter, emitterType?:string):Lifecycle.IDisposable;

	addEmitterTypeListener(eventType:string, emitterType:string, listener:ListenerCallback):ListenerUnbind;
	emit(eventType:string, data?:any):void;
}

export interface IListenersMap {
	[key:string]:ListenerCallback[];
}

export class EventEmitter implements IEventEmitter {

	protected _listeners:IListenersMap;
	protected _bulkListeners:ListenerCallback[];
	private _collectedEvents:EmitterEvent[];
	private _deferredCnt:number;
	private _allowedEventTypes:{[eventType:string]:boolean;};

	constructor(allowedEventTypes:string[] = null) {
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

	public addListener(eventType:string, listener:ListenerCallback):ListenerUnbind {
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
		return () => {
			if (!bound) {
				// Already called
				return;
			}

			bound._removeListener(eventType, listener);

			// Prevent leakers from holding on to the event emitter
			bound = null;
			listener = null;
		};
	}

	public addListener2(eventType:string, listener:ListenerCallback):Lifecycle.IDisposable {
		var dispose = this.addListener(eventType, listener);
		return {
			dispose: dispose
		};
	}

	public on(eventType:string, listener:ListenerCallback):ListenerUnbind {
		return this.addListener(eventType, listener);
	}

	public addOneTimeListener(eventType:string, listener:ListenerCallback):ListenerUnbind {
		var unbind:ListenerUnbind = this.addListener(eventType, function(value:any) {
			unbind();
			listener(value);
		});
		return unbind;
	}

	public addOneTimeDisposableListener(eventType:string, listener:ListenerCallback):Lifecycle.IDisposable {
		var dispose = this.addOneTimeListener(eventType, listener);
		return {
			dispose: dispose
		};
	}

	public addBulkListener(listener:IBulkListenerCallback):ListenerUnbind {

		this._bulkListeners.push(listener);

		return () => {
			this._removeBulkListener(listener);
		};
	}

	public addBulkListener2(listener:IBulkListenerCallback):Lifecycle.IDisposable {
		var dispose = this.addBulkListener(listener);
		return {
			dispose: dispose
		};
	}

	public addEmitter(eventEmitter:IEventEmitter, emitterType:string=null):ListenerUnbind {
		return eventEmitter.addBulkListener((events:IEmitterEvent[]):void => {
			var newEvents = events;

			if (emitterType) {
				// If the emitter has an emitterType, recreate events
				newEvents = [];
				for (var i = 0, len = events.length; i < len; i++) {
					newEvents.push(new EmitterEvent(events[i].getType(), events[i].getData(), emitterType));
				}
			}

			if (this._deferredCnt === 0) {
				this._emitEvents(<EmitterEvent[]>newEvents);
			} else {
				// Collect for later
				this._collectedEvents.push.apply(this._collectedEvents, newEvents);
			}
		});
	}

	public addEmitter2(eventEmitter:IEventEmitter, emitterType?:string):Lifecycle.IDisposable {
		var dispose = this.addEmitter(eventEmitter, emitterType);
		return {
			dispose: dispose
		};
	}

	public addEmitterTypeListener(eventType:string, emitterType:string, listener:ListenerCallback):ListenerUnbind {
		if (emitterType) {
			if (eventType === '*') {
				throw new Error('Bulk listeners cannot specify an emitter type');
			}

			return this.addListener(eventType + '/' + emitterType, listener);
		} else {
			return this.addListener(eventType, listener);
		}
	}

	private _removeListener(eventType:string, listener:ListenerCallback): void {
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

	private _removeBulkListener(listener:IBulkListenerCallback): void {
		for (var i = 0, len = this._bulkListeners.length; i < len; i++) {
			if (this._bulkListeners[i] === listener) {
				this._bulkListeners.splice(i, 1);
				break;
			}
		}
	}

	protected _emitToSpecificTypeListeners(eventType:string, data:any): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			var listeners = this._listeners[eventType].slice(0);
			for (var i = 0, len = listeners.length; i < len; i++) {
				try {
					listeners[i](data);
				} catch(e) {
					Errors.onUnexpectedError(e);
				}
			}
		}
	}

	protected _emitToBulkListeners(events:EmitterEvent[]): void {
		var bulkListeners = this._bulkListeners.slice(0);
		for (var i = 0, len = bulkListeners.length; i < len; i++) {
			try {
				bulkListeners[i](events);
			} catch(e) {
				Errors.onUnexpectedError(e);
			}
		}
	}

	protected _emitEvents(events:EmitterEvent[]): void {
		if (this._bulkListeners.length > 0) {
			this._emitToBulkListeners(events);
		}
		for (var i = 0, len = events.length; i < len; i++) {
			var e = events[i];

			this._emitToSpecificTypeListeners(e.getType(), e.getData());
			if (e.getEmitterType()) {
				this._emitToSpecificTypeListeners(e.getType() + '/' + e.getEmitterType(), e.getData());
			}
		}
	}

	public emit(eventType:string, data:any={}):void {
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

	public deferredEmit(callback:()=>any):any {
		this._deferredCnt = this._deferredCnt + 1;
		var result: any = null;
		try {
			result = callback();
		} catch (e) {
			Errors.onUnexpectedError(e);
		}
		this._deferredCnt = this._deferredCnt - 1;

		if (this._deferredCnt === 0) {
			this._emitCollected();
		}
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

	constructor(allowedEventTypes:string[] = null) {
		super(allowedEventTypes);
		this._emitQueue = [];
	}

	protected _emitToSpecificTypeListeners(eventType:string, data:any): void {
		if (this._listeners.hasOwnProperty(eventType)) {
			let listeners = this._listeners[eventType];
			for (let i = 0, len = listeners.length; i < len; i++) {
				this._emitQueue.push(new EmitQueueElement(listeners[i], data));
			}
		}
	}

	protected _emitToBulkListeners(events:EmitterEvent[]): void {
		let bulkListeners = this._bulkListeners;
		for (let i = 0, len = bulkListeners.length; i < len; i++) {
			this._emitQueue.push(new EmitQueueElement(bulkListeners[i], events));
		}
	}

	protected _emitEvents(events:EmitterEvent[]): void {
		super._emitEvents(events);

		while (this._emitQueue.length > 0) {
			let queueElement = this._emitQueue.shift();
			try {
				queueElement.target(queueElement.arg);
			} catch(e) {
				Errors.onUnexpectedError(e);
			}
		}
	}
}
