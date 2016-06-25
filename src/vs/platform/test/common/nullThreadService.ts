/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';

export class NullThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;

	constructor() {
		super(true);
		this.setInstantiationService(new InstantiationService(new ServiceCollection([IThreadService, this])));
	}

	protected _doCreateInstance(params: any[]): any {
		return super._doCreateInstance(params);
	}

	CompatWorker(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[]): TPromise<any> {
		return TPromise.as(null);
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor: T): void {
		this._registerLocalInstance(id, actor);
	}

	protected _registerAndInstantiateExtHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerExtHostActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance({
			callOnRemote: (proxyId: string, path: string, args: any[]): TPromise<any> => {
				return TPromise.as(null);
			}
		}, id, descriptor);
	}

	protected _registerWorkerActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}
}

export const NULL_THREAD_SERVICE = new NullThreadService();