/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import descriptors = require('vs/platform/instantiation/common/descriptors');
import instantiation = require('vs/platform/instantiation/common/instantiation');
import {IDisposable} from 'vs/base/common/lifecycle';

// --- thread service (web workers)

export const IThreadService = instantiation.createDecorator<IThreadService>('threadService');

export interface IDynamicProxy<T> extends IDisposable {
	getProxyDefinition(): T;
}

export interface IThreadService {
	serviceId: instantiation.ServiceIdentifier<any>;

	// --- BEGIN deprecated methods
	isInMainThread: boolean;

	ensureWorkers(): void;
	addStatusListener(listener: IThreadServiceStatusListener): void;
	removeStatusListener(listener: IThreadServiceStatusListener): void;

	MainThread(obj: IThreadSynchronizableObject<any>, methodName: string, target: Function, param: any[]): TPromise<any>;
	OneWorker(obj: IThreadSynchronizableObject<any>, methodName: string, target: Function, param: any[], affinity: ThreadAffinity): TPromise<any>;
	AllWorkers(obj: IThreadSynchronizableObject<any>, methodName: string, target: Function, param: any[]): TPromise<any>;
	Everywhere(obj: IThreadSynchronizableObject<any>, methodName: string, target: Function, param: any[]): any;

	createInstance<T extends IThreadSynchronizableObject<any>>(ctor: instantiation.INewConstructorSignature0<T>): T;
	createInstance<A1, T extends IThreadSynchronizableObject<any>>(ctor: instantiation.INewConstructorSignature1<A1, T>, a1: A1): T;
	createInstance<A1, A2, T extends IThreadSynchronizableObject<any>>(ctor: instantiation.INewConstructorSignature2<A1, A2, T>, a1: A1, a2: A2): T;
	createInstance<A1, A2, A3, T extends IThreadSynchronizableObject<any>>(ctor: instantiation.INewConstructorSignature3<A1, A2, A3, T>, a1: A1, a2: A2, a3: A3): T;

	createInstance<T extends IThreadSynchronizableObject<any>>(descriptor: descriptors.AsyncDescriptor0<T>): T;
	createInstance<A1, T extends IThreadSynchronizableObject<any>>(descriptor: descriptors.AsyncDescriptor1<A1, T>, a1: A1): T;
	createInstance<A1, A2, T extends IThreadSynchronizableObject<any>>(descriptor: descriptors.AsyncDescriptor2<A1, A2, T>, a1: A1, a2: A2): T;
	createInstance<A1, A2, A3, T extends IThreadSynchronizableObject<any>>(descriptor: descriptors.AsyncDescriptor3<A1, A2, A3, T>, a1: A1, a2: A2, a3: A3): T;

	registerInstance<T extends IThreadSynchronizableObject<any>>(instance: T): void;

	// --- END deprecated methods

	getRemotable<T>(ctor: instantiation.INewConstructorSignature0<T>): T;

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
		PluginHostContext: <IRemotableCtorMap>Object.create(null),
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

	public static PluginHostContext(identifier: string) {
		return function(target: Function) {
			Remotable._ensureUnique(identifier);
			Remotable.Registry.PluginHostContext[identifier] = target;
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
		if (Remotable.Registry.MainContext[identifier] || Remotable.Registry.PluginHostContext[identifier] || Remotable.Registry.WorkerContext[identifier]) {
			throw new Error('Duplicate Remotable identifier found');
		}
	}
}

export interface IThreadSynchronizableObject<S> {
	getId(): string;

	creationDone?: () => void;

	asyncCtor?: () => TPromise<void>;

	getSerializableState?: () => S;

	setData?: (data: S) => void;
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
