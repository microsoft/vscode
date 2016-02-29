/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import thread = require('./thread');

export const THREAD_SERVICE_PROPERTY_NAME = '__$$__threadService';

function findMember(proto: any, target: any): string {
	for (let i in proto) {
		if (proto[i] === target) {
			return i;
		}
	}
	throw new Error('Member not found in prototype');
}

function findThreadService(obj: any): thread.IThreadService {
	let threadService: thread.IThreadService = obj[THREAD_SERVICE_PROPERTY_NAME];
	if (!threadService) {
		throw new Error('Objects that use thread attributes must be instantiated with the thread service');
	}
	return threadService;
}

export interface IOneWorkerAnnotation {
	(type: Function, target: Function, affinity?: thread.ThreadAffinity): void;
	(type: Function, target: Function, condition: () => TPromise<any>, affinity?: thread.ThreadAffinity): void;
}

function OneWorkerFn(type: Function, target: Function, conditionOrAffinity?: any, affinity: thread.ThreadAffinity = thread.ThreadAffinity.None): void {

	let methodName = findMember(type.prototype, target),
		condition: () => TPromise<any>;

	if (typeof conditionOrAffinity === 'function') {
		condition = conditionOrAffinity;

	} else if (typeof conditionOrAffinity !== 'undefined') {
		affinity = conditionOrAffinity;
	}

	type.prototype[methodName] = function(...param: any[]) {

		if (!condition) {
			return findThreadService(this).OneWorker(this, methodName, target, param, affinity);

		} else {
			let that = this,
				promise = condition.call(that);

			if (!TPromise.is(promise)) {
				promise = TPromise.as(promise);
			}

			return promise.then(function() {
				return findThreadService(that).OneWorker(that, methodName, target, param, affinity);
			});
		}

	};
}

export let OneWorkerAttr: IOneWorkerAnnotation = OneWorkerFn;

export function AllWorkersAttr(type: Function, target: Function): void {
	let methodName = findMember(type.prototype, target);
	type.prototype[methodName] = function(...param: any[]) {
		return findThreadService(this).AllWorkers(this, methodName, target, param);
	};
}

