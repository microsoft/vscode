/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import remote = require('vs/base/common/remote');
import {Remotable, ProxyIdentifier} from 'vs/platform/thread/common/thread';
import instantiation = require('vs/platform/instantiation/common/instantiation');
import {SyncDescriptor0, createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

declare var Proxy:any; // TODO@TypeScript

export abstract class AbstractThreadService implements remote.IManyHandler {

	protected _instantiationService: instantiation.IInstantiationService;

	protected _localObjMap: { [id: string]: any; };
	private _proxyObjMap: { [id: string]: any; };

	constructor() {
		this._localObjMap = Object.create(null);
		this._proxyObjMap = Object.create(null);
	}

	setInstantiationService(service: instantiation.IInstantiationService): void {
		this._instantiationService = service;
	}

	public handle(rpcId: string, methodName: string, args: any[]): any {
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
		let result = createProxyFromCtor(remoteCom, id, descriptor.ctor);
		this._proxyObjMap[id] = result;
		return result;
	}

	protected _registerLocalInstance(id: string, obj: any): any {
		this._localObjMap[id] = obj;
	}

	protected _getOrCreateLocalInstance(id: string, descriptor: SyncDescriptor0<any>): any {
		if (this._localObjMap[id]) {
			return this._localObjMap[id];
		}
		let result = this._instantiationService.createInstance(descriptor);
		this._registerLocalInstance(id, result);
		return result;
	}

	getRemotable<T>(ctor: instantiation.IConstructorSignature0<T>): T {
		let id = Remotable.getId(ctor);
		if (!id) {
			throw new Error('Unknown Remotable: <<' + ctor + '>>');
		}

		let desc = createSyncDescriptor<T>(ctor);

		if (Remotable.Registry.MainContext[id]) {
			return this._registerAndInstantiateMainProcessActor(id, desc);
		}

		if (Remotable.Registry.ExtHostContext[id]) {
			return this._registerAndInstantiateExtHostActor(id, desc);
		}

		throw new Error('Unknown Remotable: <<' + id + '>>');
	}

	registerRemotableInstance(ctor: any, instance: any): void {
		let id = Remotable.getId(ctor);
		if (!id) {
			throw new Error('Unknown Remotable: <<' + id + '>>');
		}

		if (Remotable.Registry.MainContext[id]) {
			return this._registerMainProcessActor(id, instance);
		}

		if (Remotable.Registry.ExtHostContext[id]) {
			return this._registerExtHostActor(id, instance);
		}

		throw new Error('Unknown Remotable: <<' + id + '>>');
	}

	private _proxies: {[id:string]:any;} = Object.create(null);
	get<T>(identifier:ProxyIdentifier<T>): T {
		let id = identifier.id;
		if (!this._proxies[id]) {
			this._proxies[id] = this._createProxy(id);
		}
		return this._proxies[id];
	}

	private _createProxy<T>(id:string): T {
		let handler = {
			get: (target, name) => {
				return (...myArgs: any[]) => {
					return this._callOnRemote(id, name, myArgs);
				};
			}
		};

		return new Proxy({}, handler);
	}

	set<T>(identifier:ProxyIdentifier<T>, value:T): T {
		if (identifier.isMain) {
			this._registerMainProcessActor(identifier.id, value);
		} else {
			this._registerExtHostActor(identifier.id, value);
		}
		return value;
	}

	protected abstract _callOnRemote(proxyId: string, path: string, args:any[]): TPromise<any>;

	protected abstract _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T;
	protected abstract _registerMainProcessActor<T>(id: string, actor: T): void;
	protected abstract _registerAndInstantiateExtHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T;
	protected abstract _registerExtHostActor<T>(id: string, actor: T): void;
}

function createProxyFromCtor(remote:remote.IProxyHelper, id:string, ctor:Function): any {
	var result: any = {
		$__IS_REMOTE_OBJ: true
	};
	for (var prop in ctor.prototype) {
		if (typeof ctor.prototype[prop] === 'function') {
			result[prop] = createMethodProxy(remote, id, prop);
		}
	}
	return result;
}

function createMethodProxy(remote:remote.IProxyHelper, proxyId: string, path: string): (...myArgs: any[]) => TPromise<any> {
	return (...myArgs: any[]) => {
		return remote.callOnRemote(proxyId, path, myArgs);
	};
}
