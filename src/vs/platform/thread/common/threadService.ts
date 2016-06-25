/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from './thread';

export const THREAD_SERVICE_PROPERTY_NAME = '__$$__threadService';

function findMember(proto: any, target: any): string {
	for (let i in proto) {
		if (proto[i] === target) {
			return i;
		}
	}
	throw new Error('Member not found in prototype');
}

function findThreadService(obj: any): IThreadService {
	let threadService: IThreadService = obj[THREAD_SERVICE_PROPERTY_NAME];
	if (!threadService) {
		throw new Error('Objects that use thread attributes must be instantiated with the thread service');
	}
	return threadService;
}

export function CompatWorkerAttr(type: Function, target: Function): void {
	let methodName = findMember(type.prototype, target);
	type.prototype[methodName] = function(...param: any[]) {
		return findThreadService(this).CompatWorker(this, methodName, target, param);
	};
}
