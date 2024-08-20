/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IWorkerClient, Proxied } from 'vs/base/common/worker/simpleWorker';
import { createWebWorker } from 'vs/base/browser/defaultWorkerFactory';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { IMainCellDto, INotebookDiffResult, NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { NotebookEditorSimpleWorker } from 'vs/workbench/contrib/notebook/common/services/notebookSimpleWorker';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';

export class NotebookEditorWorkerServiceImpl extends Disposable implements INotebookEditorWorkerService {
	declare readonly _serviceBrand: undefined;

	private readonly _workerManager: WorkerManager;

	constructor(
		@INotebookService notebookService: INotebookService
	) {
		super();

		this._workerManager = this._register(new WorkerManager(notebookService));
	}
	canComputeDiff(original: URI, modified: URI): boolean {
		throw new Error('Method not implemented.');
	}

	computeDiff(original: URI, modified: URI): Promise<INotebookDiffResult> {
		return this._workerManager.withWorker().then(client => {
			return client.computeDiff(original, modified);
		});
	}

	canPromptRecommendation(model: URI): Promise<boolean> {
		return this._workerManager.withWorker().then(client => {
			return client.canPromptRecommendation(model);
		});
	}
}

class WorkerManager extends Disposable {
	private _editorWorkerClient: NotebookWorkerClient | null;
	// private _lastWorkerUsedTime: number;

	constructor(
		private readonly _notebookService: INotebookService
	) {
		super();
		this._editorWorkerClient = null;
		// this._lastWorkerUsedTime = (new Date()).getTime();
	}

	withWorker(): Promise<NotebookWorkerClient> {
		// this._lastWorkerUsedTime = (new Date()).getTime();
		if (!this._editorWorkerClient) {
			this._editorWorkerClient = new NotebookWorkerClient(this._notebookService);
		}
		return Promise.resolve(this._editorWorkerClient);
	}
}

class NotebookEditorModelManager extends Disposable {
	private _syncedModels: { [modelUrl: string]: IDisposable } = Object.create(null);
	private _syncedModelsLastUsedTime: { [modelUrl: string]: number } = Object.create(null);

	constructor(
		private readonly _proxy: Proxied<NotebookEditorSimpleWorker>,
		private readonly _notebookService: INotebookService
	) {
		super();
	}

	public ensureSyncedResources(resources: URI[]): void {
		for (const resource of resources) {
			const resourceStr = resource.toString();

			if (!this._syncedModels[resourceStr]) {
				this._beginModelSync(resource);
			}
			if (this._syncedModels[resourceStr]) {
				this._syncedModelsLastUsedTime[resourceStr] = (new Date()).getTime();
			}
		}
	}

	private _beginModelSync(resource: URI): void {
		const model = this._notebookService.listNotebookDocuments().find(document => document.uri.toString() === resource.toString());
		if (!model) {
			return;
		}

		const modelUrl = resource.toString();

		this._proxy.$acceptNewModel(
			model.uri.toString(),
			{
				cells: model.cells.map(cell => ({
					handle: cell.handle,
					uri: cell.uri,
					source: cell.getValue(),
					eol: cell.textBuffer.getEOL(),
					language: cell.language,
					mime: cell.mime,
					cellKind: cell.cellKind,
					outputs: cell.outputs.map(op => ({ outputId: op.outputId, outputs: op.outputs })),
					metadata: cell.metadata,
					internalMetadata: cell.internalMetadata,
				})),
				metadata: model.metadata
			}
		);

		const toDispose = new DisposableStore();

		const cellToDto = (cell: NotebookCellTextModel): IMainCellDto => {
			return {
				handle: cell.handle,
				uri: cell.uri,
				source: cell.textBuffer.getLinesContent(),
				eol: cell.textBuffer.getEOL(),
				language: cell.language,
				cellKind: cell.cellKind,
				outputs: cell.outputs.map(op => ({ outputId: op.outputId, outputs: op.outputs })),
				metadata: cell.metadata,
				internalMetadata: cell.internalMetadata,
			};
		};

		toDispose.add(model.onDidChangeContent((event) => {
			const dto = event.rawEvents.map(e => {
				const data =
					e.kind === NotebookCellsChangeType.ModelChange || e.kind === NotebookCellsChangeType.Initialize
						? {
							kind: e.kind,
							versionId: event.versionId,
							changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(cell => cellToDto(cell as NotebookCellTextModel))] as [number, number, IMainCellDto[]])
						}
						: (
							e.kind === NotebookCellsChangeType.Move
								? {
									kind: e.kind,
									index: e.index,
									length: e.length,
									newIdx: e.newIdx,
									versionId: event.versionId,
									cells: e.cells.map(cell => cellToDto(cell as NotebookCellTextModel))
								}
								: e
						);

				return data;
			});

			this._proxy.$acceptModelChanged(modelUrl.toString(), {
				rawEvents: dto,
				versionId: event.versionId
			});
		}));

		toDispose.add(model.onWillDispose(() => {
			this._stopModelSync(modelUrl);
		}));
		toDispose.add(toDisposable(() => {
			this._proxy.$acceptRemovedModel(modelUrl);
		}));

		this._syncedModels[modelUrl] = toDispose;
	}

	private _stopModelSync(modelUrl: string): void {
		const toDispose = this._syncedModels[modelUrl];
		delete this._syncedModels[modelUrl];
		delete this._syncedModelsLastUsedTime[modelUrl];
		dispose(toDispose);
	}
}

class NotebookWorkerClient extends Disposable {
	private _worker: IWorkerClient<NotebookEditorSimpleWorker> | null;
	private _modelManager: NotebookEditorModelManager | null;


	constructor(private readonly _notebookService: INotebookService) {
		super();
		this._worker = null;
		this._modelManager = null;

	}

	computeDiff(original: URI, modified: URI) {
		const proxy = this._ensureSyncedResources([original, modified]);
		return proxy.$computeDiff(original.toString(), modified.toString());
	}

	canPromptRecommendation(modelUri: URI) {
		const proxy = this._ensureSyncedResources([modelUri]);
		return proxy.$canPromptRecommendation(modelUri.toString());
	}

	private _getOrCreateModelManager(proxy: Proxied<NotebookEditorSimpleWorker>): NotebookEditorModelManager {
		if (!this._modelManager) {
			this._modelManager = this._register(new NotebookEditorModelManager(proxy, this._notebookService));
		}
		return this._modelManager;
	}

	protected _ensureSyncedResources(resources: URI[]): Proxied<NotebookEditorSimpleWorker> {
		const proxy = this._getOrCreateWorker().proxy;
		this._getOrCreateModelManager(proxy).ensureSyncedResources(resources);
		return proxy;
	}

	private _getOrCreateWorker(): IWorkerClient<NotebookEditorSimpleWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(createWebWorker<NotebookEditorSimpleWorker>(
					'vs/workbench/contrib/notebook/common/services/notebookSimpleWorker',
					'NotebookEditorWorker'
				));
			} catch (err) {
				// logOnceWebWorkerWarning(err);
				// this._worker = new SynchronousWorkerClient(new EditorSimpleWorker(new EditorWorkerHost(this), null));
				throw (err);
			}
		}
		return this._worker;
	}
}
