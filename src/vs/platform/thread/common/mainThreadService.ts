/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, decoratePromise} from 'vs/base/common/winjs.base';
import Worker = require('vs/base/common/worker/workerClient');
import abstractThreadService = require('vs/platform/thread/common/abstractThreadService');
import Env = require('vs/base/common/flags');
import Platform = require('vs/base/common/platform');
import errors = require('vs/base/common/errors');
import Timer = require('vs/base/common/timer');
import {IPluginDescription} from 'vs/platform/plugins/common/plugins';
import remote = require('vs/base/common/remote');
import {readThreadSynchronizableObjects} from 'vs/platform/thread/common/threadService';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IThreadService, IThreadServiceStatusListener, IThreadSynchronizableObject, ThreadAffinity, IThreadServiceStatus} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';

interface IAffinityMap {
	[qualifiedMethodName:string]: number;
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

	private _workerPool:Worker.WorkerClient[];
	private _contextService:IWorkspaceContextService;
	private _affinityScrambler:IAffinityMap;

	private _workersCreatedPromise:TPromise<void>;
	private _triggerWorkersCreatedPromise:(value:void)=>void;
	private _listeners:IThreadServiceStatusListener[];

	private _workerFactory:Worker.IWorkerFactory;
	private _workerModuleId:string;

	constructor(contextService:IWorkspaceContextService, workerModuleId:string) {
		super(true);
		this._contextService = contextService;
		this._workerModuleId = workerModuleId;
		this._workerFactory = new DefaultWorkerFactory();

		if (!this.isInMainThread) {
			throw new Error('Incorrect Service usage: this service must be used only in the main thread');
		}

		this._workerPool = [];
		this._affinityScrambler = {};
		this._listeners = [];

		this._workersCreatedPromise = new TPromise<void>((c, e, p) => {
			this._triggerWorkersCreatedPromise = c;
		}, () => {
			// Not cancelable
		});

		// Register all statically instantiated synchronizable objects
		readThreadSynchronizableObjects().forEach((obj) => this.registerInstance(obj));

		// If nobody asks for workers to be created in 5s, the workers are created automatically
		TPromise.timeout(MainThreadService.MAXIMUM_WORKER_CREATION_DELAY).then(() => this.ensureWorkers());
	}

	ensureWorkers(): void {
		if (this._triggerWorkersCreatedPromise) {
			// Workers not created yet

			var createCount = Env.workersCount;
			if (!Platform.hasWebWorkerSupport()) {
				// Create at most 1 compatibility worker
				createCount = Math.min(createCount, 1);
			}

			for (var i = 0; i < createCount; i++) {
				this._createWorker();
			}

			var complete = this._triggerWorkersCreatedPromise;
			this._triggerWorkersCreatedPromise = null;
			complete(null);
		}
	}

	addStatusListener(listener:IThreadServiceStatusListener): void {
		for (var i = 0; i < this._listeners.length; i++) {
			if (this._listeners[i] === listener) {
				// listener is already in
				return;
			}
		}
		this._listeners.push(listener);
	}

	removeStatusListener(listener:IThreadServiceStatusListener): void {
		for (var i = 0; i < this._listeners.length; i++) {
			if (this._listeners[i] === listener) {
				this._listeners.splice(i, 1);
				return;
			}
		}
	}

	private _afterWorkers(): TPromise<void> {
		var shouldCancelPromise = false;

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

	private _createWorker(): void {
		this._workerPool.push(this._doCreateWorker());
	}

	private _shortName(major: string, minor: string): string {
		return major.substring(major.length - 14) + '.' + minor.substr(0, 14);
	}

	private _doCreateWorker(workerId?:number): Worker.WorkerClient {
		var worker = new Worker.WorkerClient(
			this._workerFactory,
			this._workerModuleId,
			(msg) => {
				if (msg.type === 'threadService') {
					return this._shortName(msg.payload[0], msg.payload[1]);
				}
				return msg.type;
			},
			(crashed:Worker.WorkerClient) => {
				var index = 0;
				for (; index < this._workerPool.length; index++) {
					if (crashed === this._workerPool[index]) {
						break;
					}
				}
				var newWorker = this._doCreateWorker(crashed.workerId);
				if (crashed === this._workerPool[index]) {
					this._workerPool[index] = newWorker;
				} else {
					this._workerPool.push(newWorker);
				}
			},
			workerId
		);
		worker.getRemoteCom().registerBigHandler(this);
		worker.onModuleLoaded = worker.request('initialize', {
			threadService: this._getRegisteredObjectsData(),
			contextService: {
				workspace: this._contextService.getWorkspace(),
				configuration: this._contextService.getConfiguration(),
				options: this._contextService.getOptions()
			}
		});
		worker.addMessageHandler('threadService', (msg:any) => {
			var identifier = msg.identifier;
			var memberName = msg.memberName;
			var args = msg.args;

			if (!this._boundObjects.hasOwnProperty(identifier)) {
				throw new Error('Object ' + identifier + ' was not found on the main thread.');
			}

			var obj = this._boundObjects[identifier];
			return TPromise.as(obj[memberName].apply(obj, args));
		});

		return worker;
	}

	private _getRegisteredObjectsData(): any {
		var r:any = {};
		Object.keys(this._boundObjects).forEach((identifier) => {
			var obj = this._boundObjects[identifier];
			if (obj.getSerializableState) {
				r[identifier] = obj.getSerializableState();
			}
		});
		return r;
	}

	MainThread(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): TPromise<any> {
		return target.apply(obj, params);
	}

	private _getWorkerIndex(obj:IThreadSynchronizableObject<any>, affinity:ThreadAffinity): number {
		if (affinity === ThreadAffinity.None) {
			var winners:number[] = [ 0 ],
				winnersQueueSize = this._workerPool[0].getQueueSize();

			for (var i = 1; i < this._workerPool.length; i++) {
				var queueSize = this._workerPool[i].getQueueSize();
				if (queueSize < winnersQueueSize) {
					winnersQueueSize = queueSize;
					winners = [i];
				} else if (queueSize === winnersQueueSize) {
					winners.push(i);
				}
			}

			return winners[Math.floor(Math.random() * winners.length)];
		}

		var scramble = 0;
		if (this._affinityScrambler.hasOwnProperty(obj.getId())) {
			scramble = this._affinityScrambler[obj.getId()];
		} else {
			scramble = Math.floor(Math.random() * this._workerPool.length);
			this._affinityScrambler[obj.getId()] = scramble;
		}

		return (scramble + affinity) % this._workerPool.length;
	}

	OneWorker(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[], affinity:ThreadAffinity): TPromise<any> {
		return this._afterWorkers().then(() => {
			if (this._workerPool.length === 0) {
				throw new Error('Cannot fulfill request...');
			}

			var workerIdx = this._getWorkerIndex(obj, affinity);

			return this._remoteCall(this._workerPool[workerIdx], obj, methodName, params);
		});
	}

	AllWorkers(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): TPromise<any> {
		return this._afterWorkers().then(() => {
			return TPromise.join(this._workerPool.map((w) => {
				return this._remoteCall(w, obj, methodName, params);
			}));
		});
	}

	Everywhere(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): any {
		this._afterWorkers().then(() => {
			this._workerPool.forEach((w) => {
				this._remoteCall(w, obj, methodName, params).done(null, errors.onUnexpectedError);
			});
		});
		return target.apply(obj, params);
	}

	private _remoteCall(worker:Worker.WorkerClient, obj:IThreadSynchronizableObject<any>, methodName:string, params:any[]): TPromise<any> {
		var id = obj.getId();
		if (!id) {
			throw new Error('Synchronizable Objects must have an identifier');
		}

		var timerEvent = Timer.start(Timer.Topic.LANGUAGES, this._shortName(id, methodName));
		var stopTimer = () => {
			timerEvent.stop();
//			console.log(timerEvent.timeTaken(), this._workerPool.indexOf(worker), obj.getId() + ' >>> ' + methodName + ': ', params);
			this._pingListenersIfNecessary();
		};


		var r = decoratePromise(worker.request('threadService', [id, methodName, params]), stopTimer, stopTimer);

		this._pingListenersIfNecessary();

		return r;
	}

	private _pingListenersIfNecessary(): void {
		if (this._listeners.length > 0) {
			var status = this._buildStatus();
			var listeners = this._listeners.slice(0);
			try {
				for (var i = 0; i < listeners.length; i++) {
					listeners[i].onThreadServiceStatus(status);
				}
			} catch(e) {
				errors.onUnexpectedError(e);
			}
		}
	}

	private _buildStatus(): IThreadServiceStatus {
		var queueSizes =  this._workerPool.map((worker) => {
			return {
				queueSize: worker.getQueueSize()
			};
		});

		return {
			workers: queueSizes
		};
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor:T): void {
		this._registerLocalInstance(id, actor);
	}

	protected _registerAndInstantiatePluginHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		throw new Error('Not supported in this runtime context: Cannot communicate to non-existant Plugin Host!');
	}

	protected _registerPluginHostActor<T>(id: string, actor:T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: SyncDescriptor0<T>, whichWorker:ThreadAffinity): T {
		var helper = this._createWorkerProxyHelper(whichWorker);
		return this._getOrCreateProxyInstance(helper, id, descriptor);
	}

	protected _registerWorkerActor<T>(id: string, actor:T): void {
		throw new Error('Not supported in this runtime context!');
	}

	private _createWorkerProxyHelper(whichWorker:ThreadAffinity): remote.IProxyHelper {
		return {
			callOnRemote: (proxyId: string, path: string, args:any[]): TPromise<any> => {
				return this._callOnWorker(whichWorker, proxyId, path, args);
			}
		};
	}

	private _callOnWorker(whichWorker:ThreadAffinity, proxyId: string, path: string, args:any[]): TPromise<any> {
		if (whichWorker === ThreadAffinity.None) {
			return TPromise.as(null);
		}

		return this._afterWorkers().then(() => {
			if (whichWorker === ThreadAffinity.All) {
				var promises = this._workerPool.map(w => w.getRemoteCom()).map(rCom => rCom.callOnRemote(proxyId, path, args));
				return TPromise.join(promises);
			}

			var workerIdx = whichWorker % this._workerPool.length;
			var worker = this._workerPool[workerIdx];
			return worker.getRemoteCom().callOnRemote(proxyId, path, args);
		});
	}
}