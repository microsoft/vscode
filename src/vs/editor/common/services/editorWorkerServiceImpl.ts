/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IModelService} from 'vs/editor/common/services/modelService';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {EditorSimpleWorker} from 'vs/editor/common/services/editorSimpleWorkerCommon';

export class EditorWorkerServiceImpl implements IEditorWorkerService {
	public serviceId = IEditorWorkerService;

	private _workerManager:WorkerManager;

	constructor(modelService:IModelService) {
		this._workerManager = new WorkerManager(modelService);
	}

	computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]> {
		return this._workerManager.withWorker().then(client => client.computeDiff(original, modified, ignoreTrimWhitespace));
	}

	computeDirtyDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
		return this._workerManager.withWorker().then(client => client.computeDirtyDiff(original, modified, ignoreTrimWhitespace));
	}
}

class WorkerManager {

	private _modelService:IModelService;
	private _editorWorkerClient: EditorWorkerClient;

	constructor(modelService:IModelService) {
		this._modelService = modelService;
		this._editorWorkerClient = null;
	}

	public withWorker(): TPromise<EditorWorkerClient> {
		if (!this._editorWorkerClient) {
			this._editorWorkerClient = new EditorWorkerClient(this._modelService);
		}
		return TPromise.as(this._editorWorkerClient);
	}
}

class EditorWorkerClient {

	private _worker: SimpleWorkerClient<EditorSimpleWorker>;
	private _proxy: EditorSimpleWorker;
	private _modelService:IModelService;
	private _syncedModels: {[uri:string]:IDisposable[];};

	constructor(modelService:IModelService) {
		this._modelService = modelService;
		this._syncedModels = Object.create(null);
		this._worker = new SimpleWorkerClient<EditorSimpleWorker>(
			new DefaultWorkerFactory(),
			'vs/editor/common/services/editorSimpleWorker',
			EditorSimpleWorker
		);
		this._proxy = this._worker.get();
	}

	public dispose(): void {
		console.log('TODO: EditorWorkerClient.dispose');
	}

	public computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]> {
		return this._withSyncedResources([original, modified]).then(_ => {
			return this._proxy.computeDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
		});
	}

	public computeDirtyDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
		return this._withSyncedResources([original, modified]).then(_ => {
			return this._proxy.computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
		});
	}

	private _withSyncedResources(resources:URI[]): TPromise<void> {

		for (let i = 0; i < resources.length; i++) {
			let resource = resources[i];
			let resourceStr = resource.toString();

			if (!this._syncedModels[resourceStr]) {
				this._beginModelSync(resource);
			}
		}

		return TPromise.as(null);
	}

	private _beginModelSync(resource:URI): void {
		let modelUrl = resource.toString();
		let model = this._modelService.getModel(resource);
		if (!model) {
			throw new Error('Uknown model!');
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
			let changedEvents: EditorCommon.IModelContentChangedEvent2[] = [];
			for (let i = 0, len = events.length; i < len; i++) {
				let e = events[i];
				switch (e.getType()) {
					case EditorCommon.EventType.ModelContentChanged2:
						changedEvents.push(<EditorCommon.IModelContentChangedEvent2>e.getData());
						break;
					case EditorCommon.EventType.ModelDispose:
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
		disposeAll(toDispose);
	}
}
