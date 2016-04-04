/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import descriptors = require('vs/platform/instantiation/common/descriptors');
import instantiation = require('vs/platform/instantiation/common/instantiation');

// --- thread service (web workers)

export const IThreadService = instantiation.createDecorator<IThreadService>('threadService');

export interface IThreadService {
	serviceId: instantiation.ServiceIdentifier<any>;

	// --- BEGIN deprecated methods
	isInMainThread: boolean;

	addStatusListener(listener: IThreadServiceStatusListener): void;
	removeStatusListener(listener: IThreadServiceStatusListener): void;

	OneWorker(obj: IThreadSynchronizableObject, methodName: string, target: Function, param: any[], affinity: ThreadAffinity): TPromise<any>;
	AllWorkers(obj: IThreadSynchronizableObject, methodName: string, target: Function, param: any[]): TPromise<any>;

	createInstance<A1, T extends IThreadSynchronizableObject>(ctor: instantiation.IConstructorSignature1<A1, T>, a1: A1): T;
	createInstance<A1, T extends IThreadSynchronizableObject>(descriptor: descriptors.AsyncDescriptor1<A1, T>, a1: A1): TPromise<T>;

	// --- END deprecated methods

	getRemotable<T>(ctor: instantiation.IConstructorSignature0<T>): T;

	registerRemotableInstance(ctor: any, instance: any): void;
}

export class IRemotableCtorMap {
	[identifier: string]: Function;
}

export class IRemotableCtorAffinityMap {
	[identifier: string]: {
		ctor: Function;
		affinity: ThreadAffinity;
	};
}

export class Remotable {

	private static PROP_NAME = '$__REMOTABLE_ID';

	public static Registry = {
		MainContext: <IRemotableCtorMap>Object.create(null),
		ExtHostContext: <IRemotableCtorMap>Object.create(null),
		WorkerContext: <IRemotableCtorAffinityMap>Object.create(null),
	};

	public static getId(ctor: any): string {
		return (ctor[Remotable.PROP_NAME] || null);
	}

	public static MainContext(identifier: string) {
		return function(target: Function) {
			Remotable._ensureUnique(identifier);
			Remotable.Registry.MainContext[identifier] = target;
			target[Remotable.PROP_NAME] = identifier;
		};
	}

	public static ExtHostContext(identifier: string) {
		return function(target: Function) {
			Remotable._ensureUnique(identifier);
			Remotable.Registry.ExtHostContext[identifier] = target;
			target[Remotable.PROP_NAME] = identifier;
		};
	}

	public static WorkerContext(identifier: string, whichWorker: ThreadAffinity) {
		return function(target: Function) {
			Remotable._ensureUnique(identifier);
			Remotable.Registry.WorkerContext[identifier] = {
				ctor: target,
				affinity: whichWorker
			};
			target[Remotable.PROP_NAME] = identifier;
		};
	}

	private static _ensureUnique(identifier: string): void {
		if (Remotable.Registry.MainContext[identifier] || Remotable.Registry.ExtHostContext[identifier] || Remotable.Registry.WorkerContext[identifier]) {
			throw new Error('Duplicate Remotable identifier found');
		}
	}
}

export interface IThreadSynchronizableObject {
	getId(): string;

	creationDone?: () => void;

	asyncCtor?: () => TPromise<void>;
}

export enum ThreadAffinity {
	None = 0,
	Group1 = 1,
	Group2 = 2,
	Group3 = 3,
	Group4 = 4,
	Group5 = 5,
	Group6 = 6,
	Group7 = 7,
	Group8 = 8,
	Group9 = 9,
	All = 10
}

export interface IWorkerStatus {
	queueSize: number;
}

export interface IThreadServiceStatus {
	workers: IWorkerStatus[];
}

export interface IThreadServiceStatusListener {
	onThreadServiceStatus(status: IThreadServiceStatus): void;
}
