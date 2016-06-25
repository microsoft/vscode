/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class MainThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;

	constructor(contextService: IWorkspaceContextService, workerModuleId: string) {
		super(true);

		if (!this.isInMainThread) {
			throw new Error('Incorrect Service usage: this service must be used only in the main thread');
		}
	}

	CompatWorker(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[]): TPromise<any> {
		throw new Error('Not supported in this runtime context: Cannot communicate to non-existant Worker!');
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor: T): void {
		this._registerLocalInstance(id, actor);
	}

	protected _registerAndInstantiateExtHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		throw new Error('Not supported in this runtime context: Cannot communicate to non-existant Extension Host!');
	}

	protected _registerExtHostActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerWorkerActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}
}