/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IntervalTimer} from 'vs/base/common/async';
import {Disposable, IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {IInplaceReplaceSupportResult, ILink, ISuggestResult} from 'vs/editor/common/modes';
import {EditorSimpleWorker} from 'vs/editor/common/services/editorSimpleWorkerCommon';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModelService} from 'vs/editor/common/services/modelService';

/**
 * Stop syncing a model to the worker if it was not needed for 1 min.
 */
const STOP_SYNC_MODEL_DELTA_TIME_MS = 60 * 1000;

/**
 * Stop the worker if it was not needed for 5 min.
 */
const STOP_WORKER_DELTA_TIME_MS = 5 * 60 * 1000;

export class EditorWorkerServiceImpl implements IEditorWorkerService {
	public serviceId = IEditorWorkerService;

	private _workerManager:WorkerManager;

	constructor(modelService:IModelService) {
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

class EditorWorkerClient extends Disposable {

	private _worker: SimpleWorkerClient<EditorSimpleWorker>;
	private _proxy: EditorSimpleWorker;
	private _modelService:IModelService;
	private _syncedModels: {[modelUrl:string]:IDisposable[];};
	private _syncedModelsLastUsedTime: {[modelUrl:string]:number;};

	constructor(modelService:IModelService) {
		super();
		this._modelService = modelService;
		this._syncedModels = Object.create(null);
		this._syncedModelsLastUsedTime = Object.create(null);
		this._worker = this._register(new SimpleWorkerClient<EditorSimpleWorker>(
			new DefaultWorkerFactory(),
			'vs/editor/common/services/editorSimpleWorker',
			EditorSimpleWorker
		));
		this._proxy = this._worker.get();

		let stopModelSyncInterval = this._register(new IntervalTimer());
		stopModelSyncInterval.cancelAndSet(() => this._checkStopModelSync(), Math.round(STOP_SYNC_MODEL_DELTA_TIME_MS / 2));
	}

	public dispose(): void {
		for (let modelUrl in this._syncedModels) {
			disposeAll(this._syncedModels[modelUrl]);
		}
		this._syncedModels = Object.create(null);
		this._syncedModelsLastUsedTime = Object.create(null);
		super.dispose();
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

	public computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<editorCommon.ILineChange[]> {
		return this._withSyncedResources([original, modified]).then(_ => {
			return this._proxy.computeDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
		});
	}

	public computeDirtyDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<editorCommon.IChange[]> {
		return this._withSyncedResources([original, modified]).then(_ => {
			return this._proxy.computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
		});
	}

	public computeLinks(resource:URI):TPromise<ILink[]> {
		return this._withSyncedResources([resource]).then(_ => {
			return this._proxy.computeLinks(resource.toString());
		});
	}

	public textualSuggest(resource: URI, position: editorCommon.IPosition): TPromise<ISuggestResult[]> {
		return this._withSyncedResources([resource]).then(_ => {
			let model = this._modelService.getModel(resource);
			if (!model) {
				return null;
			}
			let wordDefRegExp = WordHelper.massageWordDefinitionOf(model.getMode());
			let wordDef = wordDefRegExp.source;
			let wordDefFlags = (wordDefRegExp.global ? 'g' : '') + (wordDefRegExp.ignoreCase ? 'i' : '') + (wordDefRegExp.multiline ? 'm' : '');
			return this._proxy.textualSuggest(resource.toString(), position, wordDef, wordDefFlags);
		});
	}

	public navigateValueSet(resource: URI, range:editorCommon.IRange, up:boolean): TPromise<IInplaceReplaceSupportResult> {
		return this._withSyncedResources([resource]).then(_ => {
			let model = this._modelService.getModel(resource);
			if (!model) {
				return null;
			}
			let wordDefRegExp = WordHelper.massageWordDefinitionOf(model.getMode());
			let wordDef = wordDefRegExp.source;
			let wordDefFlags = (wordDefRegExp.global ? 'g' : '') + (wordDefRegExp.ignoreCase ? 'i' : '') + (wordDefRegExp.multiline ? 'm' : '');
			return this._proxy.navigateValueSet(resource.toString(), range, up, wordDef, wordDefFlags);
		});
	}

	private _withSyncedResources(resources:URI[]): TPromise<void> {

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

		return TPromise.as(null);
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
			url: model.getAssociatedResource().toString(),
			value: model.toRawText(),
			versionId: model.getVersionId()
		});

		let toDispose:IDisposable[] = [];
		toDispose.push(model.addBulkListener2((events) => {
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
		disposeAll(toDispose);
	}
}
