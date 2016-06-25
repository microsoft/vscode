/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Worker = require('vs/base/common/worker/workerClient');
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import remote = require('vs/base/common/remote');
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';

export interface IWorker {
	getRemoteCom(): remote.IRemoteCom;
}

export interface IWorkerListenr {
	(worker: IWorker): void;
}

export class MainThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;
	static MAXIMUM_WORKER_CREATION_DELAY = 500; // 500ms

	private _worker: Worker.WorkerClient;
	private _contextService: IWorkspaceContextService;

	private _workerCreatedPromise: TPromise<void>;
	private _triggerWorkersCreatedPromise: (value: void) => void;

	private _workerFactory: Worker.IWorkerFactory;
	private _workerModuleId: string;

	constructor(contextService: IWorkspaceContextService, workerModuleId: string) {
		super(true);
		this._contextService = contextService;
		this._workerModuleId = workerModuleId;
		this._workerFactory = new DefaultWorkerFactory(true);

		if (!this.isInMainThread) {
			throw new Error('Incorrect Service usage: this service must be used only in the main thread');
		}

		this._worker = null;

		this._workerCreatedPromise = new TPromise<void>((c, e, p) => {
			this._triggerWorkersCreatedPromise = c;
		}, () => {
			// Not cancelable
		});

		// If nobody asks for workers to be created in 5s, the workers are created automatically
		TPromise.timeout(MainThreadService.MAXIMUM_WORKER_CREATION_DELAY).then(() => this.ensureWorkers());
	}

	ensureWorkers(): void {
		if (this._triggerWorkersCreatedPromise) {
			// Workers not created yet

			this._createWorker();

			let complete = this._triggerWorkersCreatedPromise;
			this._triggerWorkersCreatedPromise = null;
			complete(null);
		}
	}

	private _afterWorkers(): TPromise<void> {
		let shouldCancelPromise = false;

		return new TPromise<void>((c, e, p) => {

			// hide the initialize promise inside this
			// promise so that it won't be canceled by accident
			this._workerCreatedPromise.then(() => {
				if (!shouldCancelPromise) {
					c(null);
				}
			}, e, p);

		}, () => {
			// mark that this promise is canceled
			shouldCancelPromise = true;
		});
	}

	private _shortName(major: string, minor: string): string {
		return major.substring(major.length - 14) + '.' + minor.substr(0, 14);
	}

	private _createWorker(isRetry:boolean = false): void {
		this._worker = new Worker.WorkerClient(
			this._workerFactory,
			this._workerModuleId,
			(msg) => {
				if (msg.type === 'threadService') {
					return this._shortName(msg.payload[0], msg.payload[1]);
				}
				return msg.type;
			}
		);
		this._worker.getRemoteCom().setManyHandler(this);
		this._worker.onModuleLoaded = this._worker.request('initialize', {
			contextService: {
				workspace: this._contextService.getWorkspace(),
				configuration: this._contextService.getConfiguration(),
				options: this._contextService.getOptions()
			}
		}).then(null, (err) => {
			this._worker.dispose();
			this._worker = null;
			if (isRetry) {
				console.warn('Creating the web worker already failed twice. Giving up!');
			} else {
				this._createWorker(true);
			}
		});
	}

	CompatWorker(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[]): TPromise<any> {
		return this._afterWorkers().then(() => {
			if (this._worker === null) {
				throw new Error('Cannot fulfill request...');
			}

			return this._remoteCall(this._worker, obj, methodName, params);
		});
	}

	private _remoteCall(worker: Worker.WorkerClient, obj: IThreadSynchronizableObject, methodName: string, params: any[]): TPromise<any> {
		let id = obj.getId();
		if (!id) {
			throw new Error('Synchronizable Objects must have an identifier');
		}
		return worker.request('threadService', [id, methodName, params]);
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
		let helper:remote.IProxyHelper = {
			callOnRemote: (proxyId: string, path: string, args: any[]): TPromise<any> => {
				return this._callOnWorker(proxyId, path, args);
			}
		};
		return this._getOrCreateProxyInstance(helper, id, descriptor);
	}

	protected _registerWorkerActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	private _callOnWorker(proxyId: string, path: string, args: any[]): TPromise<any> {
		return this._afterWorkers().then(() => {
			if (this._worker === null) {
				throw new Error('Cannot fulfill request...');
			}
			return this._worker.getRemoteCom().callOnRemote(proxyId, path, args);
		});
	}
}