/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict'

import Platform = require('vs/platform/platform');
import types = require('vs/base/common/types');
import winjs = require('vs/base/common/winjs.base');
import thread = require('./thread');

export var THREAD_SERVICE_PROPERTY_NAME = '__$$__threadService';

function findMember(proto:any, target:any): string {
	for (var i in proto) {
		if (proto[i] === target) {
			return i;
		}
	}
	throw new Error('Member not found in prototype');
}

function findThreadService(obj:any): thread.IThreadService {
	var threadService:thread.IThreadService = obj[THREAD_SERVICE_PROPERTY_NAME];
	if (!threadService) {
		throw new Error('Objects that use thread attributes must be instantiated with the thread service');
	}
	return threadService;
}

export function MainThreadAttr(type:Function, target:Function): void {
	var methodName = findMember(type.prototype, target);
	type.prototype[methodName] = function(...param:any[]) {
		return findThreadService(this).MainThread(this, methodName, target, param);
	};
}

export interface IOneWorkerAnnotation {
	(type: Function, target: Function, affinity?: thread.ThreadAffinity): void;
	(type: Function, target: Function, condition: () => winjs.TPromise<any>, affinity?: thread.ThreadAffinity): void;
}

function OneWorkerFn(type: Function, target: Function, conditionOrAffinity?: any, affinity:thread.ThreadAffinity = thread.ThreadAffinity.None): void {

	var methodName = findMember(type.prototype, target),
		condition: () => winjs.TPromise<any>;

	if(typeof conditionOrAffinity === 'function') {
		condition = conditionOrAffinity;

	} else if(typeof conditionOrAffinity !== 'undefined') {
		affinity = conditionOrAffinity;
	}

	type.prototype[methodName] = function(...param:any[]) {

		if(!condition) {
			return findThreadService(this).OneWorker(this, methodName, target, param, affinity);

		} else {
			var that = this,
				promise = condition.call(that);

			if(!winjs.Promise.is(promise)) {
				promise = winjs.Promise.as(promise);
			}

			return promise.then(function() {
				return findThreadService(that).OneWorker(that, methodName, target, param, affinity);
			});
		}

	};
}

export var OneWorkerAttr: IOneWorkerAnnotation = OneWorkerFn;

export function AllWorkersAttr(type:Function, target:Function): void {
	var methodName = findMember(type.prototype, target);
	type.prototype[methodName] = function(...param:any[]) {
		return findThreadService(this).AllWorkers(this, methodName, target, param);
	};
}

export function EverywhereAttr(type:Function, target:Function): void {
	var methodName = findMember(type.prototype, target);
	type.prototype[methodName] = function(...param:any[]) {
		return findThreadService(this).Everywhere(this, methodName, target, param);
	};
}

class SynchronizableObjectsRegistry {
	private _list: thread.IThreadSynchronizableObject<any>[] = [];

	constructor() {
		this._list = [];
	}

	public register(obj: thread.IThreadSynchronizableObject<any>): void {
		this._list.push(obj);
	}

	public read(): thread.IThreadSynchronizableObject<any>[] {
		return this._list;
	}
}

export var Extensions = {
	SynchronizableObjects: 'SynchronizableObjects'
};

Platform.Registry.add(Extensions.SynchronizableObjects, new SynchronizableObjectsRegistry())

export function registerThreadSynchronizableObject(obj: thread.IThreadSynchronizableObject<any>): void {
	var registry = <SynchronizableObjectsRegistry>Platform.Registry.as(Extensions.SynchronizableObjects);
	registry.register(obj);
}

export function readThreadSynchronizableObjects(): thread.IThreadSynchronizableObject<any>[] {
	var registry = <SynchronizableObjectsRegistry>Platform.Registry.as(Extensions.SynchronizableObjects);
	return registry.read();
}