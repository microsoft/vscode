/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IRawText} from 'vs/editor/common/editorCommon';

export var ICompatWorkerService = createDecorator<ICompatWorkerService>('compatWorkerService');

export interface IRawModelData {
	url: URI;
	versionId: number;
	value: IRawText;
	modeId: string;
}

export interface ICompatMode {
	getId(): string;
	compatWorkerService: ICompatWorkerService;
}

export interface ICompatWorkerService {
	_serviceBrand: any;
	isInMainThread: boolean;
	registerCompatMode(compatMode:ICompatMode): void;
	CompatWorker(obj: ICompatMode, methodName: string, target: Function, param: any[]): TPromise<any>;
}

function findMember(proto: any, target: any): string {
	for (let i in proto) {
		if (proto[i] === target) {
			return i;
		}
	}
	throw new Error('Member not found in prototype');
}

export function CompatWorkerAttr(type: Function, target: Function): void {
	let methodName = findMember(type.prototype, target);
	type.prototype[methodName] = function(...param: any[]) {
		let obj = <ICompatMode>this;
		return obj.compatWorkerService.CompatWorker(obj, methodName, target, param);
	};
}
