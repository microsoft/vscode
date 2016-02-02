/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import remote = require('vs/base/common/remote');
import Types = require('vs/base/common/types');
import {IThreadServiceStatusListener, ThreadAffinity, Remotable, IRemotableCtorMap, IThreadSynchronizableObject, IDynamicProxy} from 'vs/platform/thread/common/thread';
import {THREAD_SERVICE_PROPERTY_NAME} from 'vs/platform/thread/common/threadService';
import instantiation = require('vs/platform/instantiation/common/instantiation');
import {SyncDescriptor, SyncDescriptor0, createSyncDescriptor, AsyncDescriptor0, AsyncDescriptor1, AsyncDescriptor2, AsyncDescriptor3} from 'vs/platform/instantiation/common/descriptors';

export interface IThreadServiceData {
	[id:string]:any;
}

class DynamicProxy<T> implements IDynamicProxy<T> {

	private _proxyDefinition: T;
	private _disposeDelegate: ()=>void;

	constructor(proxyDefinition:T, disposeDelegate:()=>void) {
		this._proxyDefinition = proxyDefinition;
		this._disposeDelegate = disposeDelegate;
	}

	public dispose(): void {
		return this._disposeDelegate();
	}

	public getProxyDefinition(): T {
		return this._proxyDefinition;
	}
}

export abstract class AbstractThreadService implements remote.IManyHandler {

	private static _LAST_DYNAMIC_PROXY_ID:number = 0;
	private static generateDynamicProxyId(): string {
		return String(++this._LAST_DYNAMIC_PROXY_ID);
	}

	public isInMainThread:boolean;

	protected _instantiationService: instantiation.IInstantiationService;

	protected _boundObjects:{[id:string]:IThreadSynchronizableObject<any>;};
	protected _pendingObjects:TPromise<IThreadSynchronizableObject<any>>[];
	private _localObjMap: { [id:string]: any; };
	private _proxyObjMap: { [id:string]: any; };

	constructor(isInMainThread: boolean) {
		this.isInMainThread = isInMainThread;
		this._boundObjects = {};
		this._pendingObjects = [];
		this._localObjMap = Object.create(null);
		this._proxyObjMap = Object.create(null);
	}

	setInstantiationService(service:instantiation.IInstantiationService): void {
		this._instantiationService = service;
	}

	createInstance<T extends IThreadSynchronizableObject<any>>(ctor:instantiation.IConstructorSignature0<T>):T;
	createInstance<A1, T extends IThreadSynchronizableObject<any>>(ctor:instantiation.IConstructorSignature1<A1, T>, a1:A1):T;
	createInstance<A1, A2, T extends IThreadSynchronizableObject<any>>(ctor:instantiation.IConstructorSignature2<A1, A2, T>, a1:A1, a2:A2):T;
	createInstance<A1, A2, A3, T extends IThreadSynchronizableObject<any>>(ctor:instantiation.IConstructorSignature3<A1, A2, A3, T>, a1:A1, a2:A2, a3:A3):T;

	createInstance<T extends IThreadSynchronizableObject<any>>(descriptor: AsyncDescriptor0<T>): T;
	createInstance<A1, T extends IThreadSynchronizableObject<any>>(descriptor: AsyncDescriptor1<A1, T>, a1: A1): T;
	createInstance<A1, A2, T extends IThreadSynchronizableObject<any>>(descriptor: AsyncDescriptor2<A1, A2, T>, a1: A1, a2: A2): T;
	createInstance<A1, A2, A3, T extends IThreadSynchronizableObject<any>>(descriptor: AsyncDescriptor3<A1, A2, A3, T>, a1: A1, a2: A2, a3: A3): T;

	createInstance(...params:any[]):any {
		return this._doCreateInstance(params);
	}

	protected _doCreateInstance(params:any[]): any {
		var instanceOrPromise = this._instantiationService.createInstance.apply(this._instantiationService, params);

		if (TPromise.is(instanceOrPromise)) {

			var objInstantiated: TPromise<IThreadSynchronizableObject<any>>;
			objInstantiated = instanceOrPromise.then((instance: IThreadSynchronizableObject<any>): any => {
				if (instance.asyncCtor) {
					var initPromise = instance.asyncCtor();
					if (TPromise.is(initPromise)) {
						return initPromise.then(() => {
							return instance;
						});
					}
				}
				return instance;
			});

			this._pendingObjects.push(objInstantiated);
			return objInstantiated.then((instance: IThreadSynchronizableObject<any>) => {
				var r = this._finishInstance(instance);

				for (var i = 0; i < this._pendingObjects.length; i++) {
					if (this._pendingObjects[i] === objInstantiated) {
						this._pendingObjects.splice(i, 1);
						break;
					}
				}

				return r;
			});

		}

		return this._finishInstance(<IThreadSynchronizableObject<any>>instanceOrPromise);
	}

	_finishInstance(instance:IThreadSynchronizableObject<any>): IThreadSynchronizableObject<any> {
		instance[THREAD_SERVICE_PROPERTY_NAME] = this;
		this._boundObjects[instance.getId()] = instance;

		if (instance.creationDone) {
			instance.creationDone();
		}

		return instance;
	}

	registerInstance<T extends IThreadSynchronizableObject<any>>(instance: T): void {
		this._finishInstance(instance);
	}

	public handle(rpcId:string, methodName:string, args:any[]): any {
		if (!this._localObjMap[rpcId]) {
			throw new Error('Unknown actor ' + rpcId);
		}
		let actor = this._localObjMap[rpcId];
		let method = actor[methodName];
		if (typeof method !== 'function') {
			throw new Error('Unknown method ' + methodName + ' on actor ' + rpcId);
		}
		return method.apply(actor, args);
	}

	protected _getOrCreateProxyInstance(remoteCom: remote.IProxyHelper, id: string, descriptor: SyncDescriptor0<any>): any {
		if (this._proxyObjMap[id]) {
			return this._proxyObjMap[id];
		}
		var result = remote.createProxyFromCtor(remoteCom, id, descriptor.ctor);
		this._proxyObjMap[id] = result;
		return result;
	}

	protected _registerLocalInstance(id:string, obj:any): any {
		this._localObjMap[id] = obj;
	}

	protected _getOrCreateLocalInstance(id: string, descriptor: SyncDescriptor0<any>): any {
		if (this._localObjMap[id]) {
			return this._localObjMap[id];
		}
		var result = this._instantiationService.createInstance(descriptor);
		this._registerLocalInstance(id, result);
		return result;
	}

	getRemotable<T>(ctor: instantiation.INewConstructorSignature0<T>): T {
		var id = Remotable.getId(ctor);
		if (!id) {
			throw new Error('Unknown Remotable: <<' + id + '>>');
		}

		var desc = createSyncDescriptor<T>(ctor);

		if (Remotable.Registry.MainContext[id]) {
			return this._registerAndInstantiateMainProcessActor(id, desc);
		}

		if (Remotable.Registry.PluginHostContext[id]) {
			return this._registerAndInstantiatePluginHostActor(id, desc);
		}

		if (Remotable.Registry.WorkerContext[id]) {
			return this._registerAndInstantiateWorkerActor(id, desc, Remotable.Registry.WorkerContext[id].affinity);
		}

		throw new Error('Unknown Remotable: <<' + id + '>>');
	}

	registerRemotableInstance(ctor: any, instance: any): void {
		var id = Remotable.getId(ctor);
		if (!id) {
			throw new Error('Unknown Remotable: <<' + id + '>>');
		}

		if (Remotable.Registry.MainContext[id]) {
			return this._registerMainProcessActor(id, instance);
		}

		if (Remotable.Registry.PluginHostContext[id]) {
			return this._registerPluginHostActor(id, instance);
		}

		if (Remotable.Registry.WorkerContext[id]) {
			return this._registerWorkerActor(id, instance);
		}

		throw new Error('Unknown Remotable: <<' + id + '>>');
	}

	protected abstract _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T;
	protected abstract _registerMainProcessActor<T>(id: string, actor:T): void;
	protected abstract _registerAndInstantiatePluginHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T;
	protected abstract _registerPluginHostActor<T>(id: string, actor:T): void;
	protected abstract _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>, whichWorker:ThreadAffinity): T;
	protected abstract _registerWorkerActor<T>(id: string, actor:T): void;
}