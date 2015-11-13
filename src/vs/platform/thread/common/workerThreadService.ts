/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import {readThreadSynchronizableObjects} from './threadService';
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import remote = require('vs/base/common/remote');
import types = require('vs/base/common/types');
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadServiceStatusListener, IThreadSynchronizableObject, ThreadAffinity} from 'vs/platform/thread/common/thread';

export interface IMainThreadPublisher {
	(messageName:string, payload:any): winjs.Promise;
}

export class WorkerThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;
	private _mainThreadData:abstractThreadService.IThreadServiceData;
	private _publisher:IMainThreadPublisher;
	protected _remoteCom: remote.IRemoteCom;

	constructor(mainThreadData:abstractThreadService.IThreadServiceData, remoteCom: remote.IRemoteCom, workerPublisher:IMainThreadPublisher) {
		super(false);
		this._mainThreadData = mainThreadData;
		this._remoteCom = remoteCom;
		this._remoteCom.registerBigHandler(this);

		this._publisher = workerPublisher;

		// Register all statically instantiated synchronizable objects
		readThreadSynchronizableObjects().forEach((obj) => this.registerInstance(obj));
	}

	private _handleRequest(identifier:string, memberName:string, args:any[]): winjs.Promise {
		if (!this._boundObjects.hasOwnProperty(identifier)) {
			// Wait until all objects are constructed
			return winjs.Promise.join(this._pendingObjects.slice(0)).then(() => {
				if (!this._boundObjects.hasOwnProperty(identifier)) {
					return winjs.Promise.wrapError(new Error('Bound object `' + identifier + '` was not found.'));
				}
//					console.log(identifier + ' > ' + memberName);
				var obj = this._boundObjects[identifier];
				return winjs.Promise.as(obj[memberName].apply(obj, args));
			});
		}
//			console.log(identifier + ' > ' + memberName);
		var obj = this._boundObjects[identifier];
		return winjs.Promise.as(obj[memberName].apply(obj, args));
	}

	public dispatch(data:{ type:string; payload:any; }):winjs.Promise {
		try {
			var args = data.payload;
			var result = this._handleRequest(args[0], args[1], args[2]);
			return winjs.Promise.is(result) ? result : winjs.Promise.as(result);
		} catch(e) {
			// handler error
			return winjs.Promise.wrapError(e);
		}
	}

	_finishInstance(instance:IThreadSynchronizableObject<any>): IThreadSynchronizableObject<any> {
		var id = instance.getId();

		if (this._mainThreadData.hasOwnProperty(id)) {
			var dataValue = this._mainThreadData[id];
			delete this._mainThreadData[id];
			if (!instance.setData) {
				console.log('BROKEN INSTANCE!!! ' + id);
			}
			instance.setData(dataValue);
		}

		return super._finishInstance(instance);
	}

	MainThread(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): winjs.Promise {
		return this._publisher('threadService', {
			identifier: obj.getId(),
			memberName: methodName,
			args: params
		});
	}

	OneWorker(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[], affinity:ThreadAffinity): winjs.Promise {
		return target.apply(obj, params);
	}

	AllWorkers(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): winjs.Promise {
		return target.apply(obj, params);
	}

	Everywhere(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): winjs.Promise {
		return target.apply(obj, params);
	}

	ensureWorkers(): void {
		// Nothing to do
	}

	addStatusListener(listener:IThreadServiceStatusListener): void {
		// Nothing to do
	}

	removeStatusListener(listener:IThreadServiceStatusListener): void {
		// Nothing to do
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance(this._remoteCom, id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor:T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiatePluginHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		throw new Error('Not supported in this runtime context: Cannot communicate from Worker directly to Plugin Host!');
	}

	protected _registerPluginHostActor<T>(id: string, actor:T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>, whichWorker:ThreadAffinity): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerWorkerActor<T>(id: string, actor:T): void {
		this._registerLocalInstance(id, actor);
	}
}