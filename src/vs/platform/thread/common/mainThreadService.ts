/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Worker = require('vs/base/common/worker/workerClient');
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import Env = require('vs/base/common/flags');
import Platform = require('vs/base/common/platform');
import remote = require('vs/base/common/remote');
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadSynchronizableObject, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';

interface IAffinityMap {
	[qualifiedMethodName: string]: number;
}

export interface IWorker {
	getRemoteCom(): remote.IRemoteCom;
}

export interface IWorkerListenr {
	(worker: IWorker): void;
}

export class MainThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;
	static MAXIMUM_WORKER_CREATION_DELAY = 500; // 500ms

	private _workerPool: Worker.WorkerClient[];
	private _contextService: IWorkspaceContextService;
	private _affinityScrambler: IAffinityMap;

	private _workersCreatedPromise: TPromise<void>;
	private _triggerWorkersCreatedPromise: (value: void) => void;

	private _workerFactory: Worker.IWorkerFactory;
	private _workerModuleId: string;
	private _defaultWorkerCount: number;

	constructor(contextService: IWorkspaceContextService, workerModuleId: string, defaultWorkerCount: number) {
		super(true);
		this._contextService = contextService;
		this._workerModuleId = workerModuleId;
		this._defaultWorkerCount = defaultWorkerCount;
		this._workerFactory = new DefaultWorkerFactory(true);

		if (!this.isInMainThread) {
			throw new Error('Incorrect Service usage: this service must be used only in the main thread');
		}

		this._workerPool = [];
		this._affinityScrambler = {};

		this._workersCreatedPromise = new TPromise<void>((c, e, p) => {
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

			let createCount = Env.workersCount(this._defaultWorkerCount);
			if (!Platform.hasWebWorkerSupport()) {
				// Create at most 1 compatibility worker
				createCount = Math.min(createCount, 1);
			}

			for (let i = 0; i < createCount; i++) {
				this._createWorker();
			}

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
			this._workersCreatedPromise.then(() => {
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
		let worker = new Worker.WorkerClient(
			this._workerFactory,
			this._workerModuleId,
			(msg) => {
				if (msg.type === 'threadService') {
					return this._shortName(msg.payload[0], msg.payload[1]);
				}
				return msg.type;
			}
		);
		worker.getRemoteCom().setManyHandler(this);
		worker.onModuleLoaded = worker.request('initialize', {
			contextService: {
				workspace: this._contextService.getWorkspace(),
				configuration: this._contextService.getConfiguration(),
				options: this._contextService.getOptions()
			}
		}).then(null, (err) => {
			for (var i = 0; i < this._workerPool.length; i++) {
				if (this._workerPool[i] === worker) {
					this._workerPool.splice(i, 1);
					break;
				}
			}
			worker.dispose();
			if (isRetry) {
				console.warn('Creating the web worker already failed twice. Giving up!');
			} else {
				this._createWorker(true);
			}
		});

		this._workerPool.push(worker);
	}

	private _getWorkerIndex(obj: IThreadSynchronizableObject, affinity: ThreadAffinity): number {
		if (affinity === ThreadAffinity.None) {
			let winners: number[] = [0],
				winnersQueueSize = this._workerPool[0].getQueueSize();

			for (let i = 1; i < this._workerPool.length; i++) {
				let queueSize = this._workerPool[i].getQueueSize();
				if (queueSize < winnersQueueSize) {
					winnersQueueSize = queueSize;
					winners = [i];
				} else if (queueSize === winnersQueueSize) {
					winners.push(i);
				}
			}

			return winners[Math.floor(Math.random() * winners.length)];
		}

		let scramble = 0;
		if (this._affinityScrambler.hasOwnProperty(obj.getId())) {
			scramble = this._affinityScrambler[obj.getId()];
		} else {
			scramble = Math.floor(Math.random() * this._workerPool.length);
			this._affinityScrambler[obj.getId()] = scramble;
		}

		return (scramble + affinity) % this._workerPool.length;
	}

	OneWorker(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[], affinity: ThreadAffinity): TPromise<any> {
		return this._afterWorkers().then(() => {
			if (this._workerPool.length === 0) {
				throw new Error('Cannot fulfill request...');
			}

			let workerIdx = this._getWorkerIndex(obj, affinity);

			return this._remoteCall(this._workerPool[workerIdx], obj, methodName, params);
		});
	}

	AllWorkers(obj: IThreadSynchronizableObject, methodName: string, target: Function, params: any[]): TPromise<any> {
		return this._afterWorkers().then(() => {
			return TPromise.join(this._workerPool.map((w) => {
				return this._remoteCall(w, obj, methodName, params);
			}));
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

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>, whichWorker: ThreadAffinity): T {
		let helper = this._createWorkerProxyHelper(whichWorker);
		return this._getOrCreateProxyInstance(helper, id, descriptor);
	}

	protected _registerWorkerActor<T>(id: string, actor: T): void {
		throw new Error('Not supported in this runtime context!');
	}

	private _createWorkerProxyHelper(whichWorker: ThreadAffinity): remote.IProxyHelper {
		return {
			callOnRemote: (proxyId: string, path: string, args: any[]): TPromise<any> => {
				return this._callOnWorker(whichWorker, proxyId, path, args);
			}
		};
	}

	private _callOnWorker(whichWorker: ThreadAffinity, proxyId: string, path: string, args: any[]): TPromise<any> {
		if (whichWorker === ThreadAffinity.None) {
			return TPromise.as(null);
		}

		return this._afterWorkers().then(() => {
			if (whichWorker === ThreadAffinity.All) {
				let promises = this._workerPool.map(w => w.getRemoteCom()).map(rCom => rCom.callOnRemote(proxyId, path, args));
				return TPromise.join(promises);
			}

			let workerIdx = whichWorker % this._workerPool.length;
			let worker = this._workerPool[workerIdx];
			return worker.getRemoteCom().callOnRemote(proxyId, path, args);
		});
	}
}