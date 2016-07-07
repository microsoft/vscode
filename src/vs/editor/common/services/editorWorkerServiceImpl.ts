/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IntervalTimer, ShallowCancelThenPromise} from 'vs/base/common/async';
import {Disposable, IDisposable, dispose} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {IInplaceReplaceSupportResult, ILink, ISuggestResult} from 'vs/editor/common/modes';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {EditorSimpleWorkerImpl} from 'vs/editor/common/services/editorSimpleWorker';
import {logOnceWebWorkerWarning} from 'vs/base/common/worker/workerClient';

/**
 * Stop syncing a model to the worker if it was not needed for 1 min.
 */
const STOP_SYNC_MODEL_DELTA_TIME_MS = 60 * 1000;

/**
 * Stop the worker if it was not needed for 5 min.
 */
const STOP_WORKER_DELTA_TIME_MS = 5 * 60 * 1000;

export class EditorWorkerServiceImpl implements IEditorWorkerService {
	public _serviceBrand: any;

	private _workerManager:WorkerManager;

	constructor(@IModelService modelService:IModelService) {
		this._workerManager = new WorkerManager(modelService);
	}

	public computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<editorCommon.ILineChange[]> {
		return this._workerManager.withWorker().then(client => client.computeDiff(original, modified, ignoreTrimWhitespace));
	}

	public computeDirtyDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<editorCommon.IChange[]> {
		return this._workerManager.withWorker().then(client => client.computeDirtyDiff(original, modified, ignoreTrimWhitespace));
	}

	public computeLinks(resource:URI):TPromise<ILink[]> {
		return this._workerManager.withWorker().then(client => client.computeLinks(resource));
	}

	public textualSuggest(resource: URI, position: editorCommon.IPosition): TPromise<ISuggestResult[]> {
		return this._workerManager.withWorker().then(client => client.textualSuggest(resource, position));
	}

	public navigateValueSet(resource: URI, range:editorCommon.IRange, up:boolean): TPromise<IInplaceReplaceSupportResult> {
		return this._workerManager.withWorker().then(client => client.navigateValueSet(resource, range, up));
	}

}

class WorkerManager extends Disposable {

	private _modelService:IModelService;
	private _editorWorkerClient: EditorWorkerClient;
	private _lastWorkerUsedTime: number;

	constructor(modelService:IModelService) {
		super();
		this._modelService = modelService;
		this._editorWorkerClient = null;

		let stopWorkerInterval = this._register(new IntervalTimer());
		stopWorkerInterval.cancelAndSet(() => this._checkStopWorker(), Math.round(STOP_WORKER_DELTA_TIME_MS / 2));
	}

	public dispose(): void {
		if (this._editorWorkerClient) {
			this._editorWorkerClient.dispose();
			this._editorWorkerClient = null;
		}
		super.dispose();
	}

	private _checkStopWorker(): void {
		if (!this._editorWorkerClient) {
			return;
		}

		let timeSinceLastWorkerUsedTime = (new Date()).getTime() - this._lastWorkerUsedTime;
		if (timeSinceLastWorkerUsedTime > STOP_WORKER_DELTA_TIME_MS) {
			this._editorWorkerClient.dispose();
			this._editorWorkerClient = null;
		}
	}

	public withWorker(): TPromise<EditorWorkerClient> {
		this._lastWorkerUsedTime = (new Date()).getTime();
		if (!this._editorWorkerClient) {
			this._editorWorkerClient = new EditorWorkerClient(this._modelService);
		}
		return TPromise.as(this._editorWorkerClient);
	}
}

class EditorModelManager extends Disposable {

	private _proxy: EditorSimpleWorkerImpl;
	private _modelService: IModelService;
	private _syncedModels: { [modelUrl: string]: IDisposable[]; } = Object.create(null);
	private _syncedModelsLastUsedTime: { [modelUrl: string]: number; } = Object.create(null);

	constructor(proxy: EditorSimpleWorkerImpl, modelService: IModelService, keepIdleModels: boolean) {
		super();
		this._proxy = proxy;
		this._modelService = modelService;

		if (!keepIdleModels) {
			let timer = new IntervalTimer();
			timer.cancelAndSet(() => this._checkStopModelSync(), Math.round(STOP_SYNC_MODEL_DELTA_TIME_MS / 2));
			this._register(timer);
		}
	}

	public dispose(): void {
		for (let modelUrl in this._syncedModels) {
			dispose(this._syncedModels[modelUrl]);
		}
		this._syncedModels = Object.create(null);
		this._syncedModelsLastUsedTime = Object.create(null);
		super.dispose();
	}

	public esureSyncedResources(resources:URI[]): void {
		for (let i = 0; i < resources.length; i++) {
			let resource = resources[i];
			let resourceStr = resource.toString();

			if (!this._syncedModels[resourceStr]) {
				this._beginModelSync(resource);
			}
			if (this._syncedModels[resourceStr]) {
				this._syncedModelsLastUsedTime[resourceStr] = (new Date()).getTime();
			}
		}
	}

	private _checkStopModelSync(): void {
		let currentTime = (new Date()).getTime();

		let toRemove:string[] = [];
		for (let modelUrl in this._syncedModelsLastUsedTime) {
			let elapsedTime = currentTime - this._syncedModelsLastUsedTime[modelUrl];
			if (elapsedTime > STOP_SYNC_MODEL_DELTA_TIME_MS) {
				toRemove.push(modelUrl);
			}
		}

		for (let i = 0; i < toRemove.length; i++) {
			this._stopModelSync(toRemove[i]);
		}
	}

	private _beginModelSync(resource:URI): void {
		let modelUrl = resource.toString();
		let model = this._modelService.getModel(resource);
		if (!model) {
			return;
		}
		if (model.isTooLargeForHavingARichMode()) {
			return;
		}

		this._proxy.acceptNewModel({
			url: model.uri.toString(),
			value: model.toRawText(),
			versionId: model.getVersionId()
		});

		let toDispose:IDisposable[] = [];
		toDispose.push(model.addBulkListener((events) => {
			let changedEvents: editorCommon.IModelContentChangedEvent2[] = [];
			for (let i = 0, len = events.length; i < len; i++) {
				let e = events[i];
				switch (e.getType()) {
					case editorCommon.EventType.ModelContentChanged2:
						changedEvents.push(<editorCommon.IModelContentChangedEvent2>e.getData());
						break;
					case editorCommon.EventType.ModelDispose:
						this._stopModelSync(modelUrl);
						return;
				}
			}
			if (changedEvents.length > 0) {
				this._proxy.acceptModelChanged(modelUrl.toString(), changedEvents);
			}
		}));
		toDispose.push({
			dispose: () => {
				this._proxy.acceptRemovedModel(modelUrl);
			}
		});

		this._syncedModels[modelUrl] = toDispose;
	}

	private _stopModelSync(modelUrl:string): void {
		let toDispose = this._syncedModels[modelUrl];
		delete this._syncedModels[modelUrl];
		delete this._syncedModelsLastUsedTime[modelUrl];
		dispose(toDispose);
	}
}

interface IWorkerClient<T> {
	getProxyObject(): TPromise<T>;
	dispose(): void;
}

class SynchronousWorkerClient<T extends IDisposable> implements IWorkerClient<T> {
	private _instance: T;
	private _proxyObj: TPromise<T>;

	constructor(instance:T) {
		this._instance = instance;
		this._proxyObj = TPromise.as(this._instance);
	}

	public dispose(): void {
		this._instance.dispose();
		this._instance = null;
		this._proxyObj = null;
	}

	public getProxyObject(): TPromise<T> {
		return new ShallowCancelThenPromise(this._proxyObj);
	}
}

export class EditorWorkerClient extends Disposable {

	private _modelService: IModelService;
	private _worker: IWorkerClient<EditorSimpleWorkerImpl>;
	private _workerFactory: DefaultWorkerFactory;
	private _modelManager: EditorModelManager;

	constructor(modelService: IModelService) {
		super();
		this._modelService = modelService;
		this._workerFactory = new DefaultWorkerFactory(/*do not use iframe*/false);
		this._worker = null;
		this._modelManager = null;
	}

	private _getOrCreateWorker(): IWorkerClient<EditorSimpleWorkerImpl> {
		if (!this._worker) {
			try {
				this._worker = this._register(new SimpleWorkerClient<EditorSimpleWorkerImpl>(
					this._workerFactory,
					'vs/editor/common/services/editorSimpleWorker'
				));
			} catch (err) {
				logOnceWebWorkerWarning(err);
				this._worker = new SynchronousWorkerClient(new EditorSimpleWorkerImpl());
			}
		}
		return this._worker;
	}

	protected _getProxy(): TPromise<EditorSimpleWorkerImpl> {
		return new ShallowCancelThenPromise(this._getOrCreateWorker().getProxyObject().then(null, (err) => {
			logOnceWebWorkerWarning(err);
			this._worker = new SynchronousWorkerClient(new EditorSimpleWorkerImpl());
			return this._getOrCreateWorker().getProxyObject();
		}));
	}

	private _getOrCreateModelManager(proxy: EditorSimpleWorkerImpl): EditorModelManager {
		if (!this._modelManager) {
			this._modelManager = this._register(new EditorModelManager(proxy, this._modelService, false));
		}
		return this._modelManager;
	}

	protected _withSyncedResources(resources:URI[]): TPromise<EditorSimpleWorkerImpl> {
		return this._getProxy().then((proxy) => {
			this._getOrCreateModelManager(proxy).esureSyncedResources(resources);
			return proxy;
		});
	}

	public computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<editorCommon.ILineChange[]> {
		return this._withSyncedResources([original, modified]).then(proxy => {
			return proxy.computeDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
		});
	}

	public computeDirtyDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<editorCommon.IChange[]> {
		return this._withSyncedResources([original, modified]).then(proxy => {
			return proxy.computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
		});
	}

	public computeLinks(resource:URI):TPromise<ILink[]> {
		return this._withSyncedResources([resource]).then(proxy => {
			return proxy.computeLinks(resource.toString());
		});
	}

	public textualSuggest(resource: URI, position: editorCommon.IPosition): TPromise<ISuggestResult[]> {
		return this._withSyncedResources([resource]).then(proxy => {
			let model = this._modelService.getModel(resource);
			if (!model) {
				return null;
			}
			let wordDefRegExp = WordHelper.massageWordDefinitionOf(model.getMode());
			let wordDef = wordDefRegExp.source;
			let wordDefFlags = (wordDefRegExp.global ? 'g' : '') + (wordDefRegExp.ignoreCase ? 'i' : '') + (wordDefRegExp.multiline ? 'm' : '');
			return proxy.textualSuggest(resource.toString(), position, wordDef, wordDefFlags);
		});
	}

	public navigateValueSet(resource: URI, range:editorCommon.IRange, up:boolean): TPromise<IInplaceReplaceSupportResult> {
		return this._withSyncedResources([resource]).then(proxy => {
			let model = this._modelService.getModel(resource);
			if (!model) {
				return null;
			}
			let wordDefRegExp = WordHelper.massageWordDefinitionOf(model.getMode());
			let wordDef = wordDefRegExp.source;
			let wordDefFlags = (wordDefRegExp.global ? 'g' : '') + (wordDefRegExp.ignoreCase ? 'i' : '') + (wordDefRegExp.multiline ? 'm' : '');
			return proxy.navigateValueSet(resource.toString(), range, up, wordDef, wordDefFlags);
		});
	}
}
