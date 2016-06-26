/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import remote = require('vs/base/common/remote');
import descriptors = require('vs/platform/instantiation/common/descriptors');

import {TPromise} from 'vs/base/common/winjs.base';
import {AbstractThreadService} from './abstractThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';

export class ExtHostThreadService extends AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;
	protected _remoteCom: remote.IRemoteCom;

	constructor(remoteCom: remote.IRemoteCom) {
		super();
		this._remoteCom = remoteCom;
		this._remoteCom.setManyHandler(this);
	}

	protected _callOnRemote(proxyId: string, path: string, args:any[]): TPromise<any> {
		return this._remoteCom.callOnRemote(proxyId, path, args);
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: descriptors.SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance(this._remoteCom, id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateExtHostActor<T>(id: string, descriptor: descriptors.SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerExtHostActor<T>(id: string, actor: T): void {
		this._registerLocalInstance(id, actor);
	}
}