/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import remote = require('vs/base/common/remote');
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadServiceStatusListener, IThreadSynchronizableObject, ThreadAffinity} from 'vs/platform/thread/common/thread';

export class WorkerThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;
	protected _remoteCom: remote.IRemoteCom;

	constructor(remoteCom: remote.IRemoteCom) {
		super(false);
		this._remoteCom = remoteCom;
		this._remoteCom.setManyHandler(this);
	}

	private _handleRequest(identifier: string, memberName: string, args: any[]): TPromise<any> {
		if (!this._boundObjects.hasOwnProperty(identifier)) {
			// Wait until all objects are constructed
			return TPromise.join(this._pendingObjects.slice(0)).then(() => {
				if (!this._boundObjects.hasOwnProperty(identifier)) {
					return TPromise.wrapError(new Error('Bound object `' + identifier + '` was not found.'));
				}
				//					console.log(identifier + ' > ' + memberName);
				let obj = this._boundObjects[identifier];
				return TPromise.as(obj[memberName].apply(obj, args));
			});
		}
		//			console.log(identifier + ' > ' + memberName);
		let obj = this._boundObjects[identifier];
		return TPromise.as(obj[memberName].apply(obj, args));
	}

	public dispatch(data: { type: string; payload: any; }): TPromise<any> {
		try {
			let args = data.payload;
			let result = this._handleRequest(args[0], args[1], args[2]);
			return TPromise.is(result) ? result : TPromise.as(result);
		} catch (e) {
			// handler error
			return TPromise.wrapError(e);
		}
	}

	OneWorker(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[], affinity: ThreadAffinity): TPromise<any> {
		return target.apply(obj, params);
	}

	AllWorkers(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[]): TPromise<any> {
		return target.apply(obj, params);
	}

	addStatusListener(listener: IThreadServiceStatusListener): void {
		// Nothing to do
	}

	removeStatusListener(listener: IThreadServiceStatusListener): void {
		// Nothing to do
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance(this._remoteCom, id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateExtHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		throw new Error('Not supported in this runtime context: Cannot communicate from Worker directly to Extension Host!');
	}

	protected _registerExtHostActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>, whichWorker: ThreadAffinity): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerWorkerActor<T>(id: string, actor: T): void {
		this._registerLocalInstance(id, actor);
	}
}