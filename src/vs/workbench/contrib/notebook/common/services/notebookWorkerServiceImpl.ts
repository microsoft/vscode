/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { DefaultWorkerFactory } from 'vs/base/worker/defaultWorkerFactory';
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
}

export class WorkerManager extends Disposable {
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
			this._editorWorkerClient = new NotebookWorkerClient(this._notebookService, 'notebookEditorWorkerService');
		}
		return Promise.resolve(this._editorWorkerClient);
	}
}

export interface IWorkerClient<W> {
	getProxyObject(): Promise<W>;
	dispose(): void;
}

export class NotebookEditorModelManager extends Disposable {
	private _syncedModels: { [modelUrl: string]: IDisposable; } = Object.create(null);
	private _syncedModelsLastUsedTime: { [modelUrl: string]: number; } = Object.create(null);

	constructor(
		private readonly _proxy: NotebookEditorSimpleWorker,
		private readonly _notebookService: INotebookService
	) {
		super();
	}

	public ensureSyncedResources(resources: URI[]): void {
		for (const resource of resources) {
			let resourceStr = resource.toString();

			if (!this._syncedModels[resourceStr]) {
				this._beginModelSync(resource);
			}
			if (this._syncedModels[resourceStr]) {
				this._syncedModelsLastUsedTime[resourceStr] = (new Date()).getTime();
			}
		}
	}

	private _beginModelSync(resource: URI): void {
		let model = this._notebookService.listNotebookDocuments().find(document => document.uri.toString() === resource.toString());
		if (!model) {
			return;
		}

		let modelUrl = resource.toString();

		this._proxy.acceptNewModel(
			model.uri.toString(),
			{
				cells: model.cells.map(cell => ({
					handle: cell.handle,
					uri: cell.uri,
					source: cell.getValue(),
					eol: cell.textBuffer.getEOL(),
					language: cell.language,
					cellKind: cell.cellKind,
					outputs: cell.outputs,
					metadata: cell.metadata
				})),
				languages: model.languages,
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
				outputs: cell.outputs,
				metadata: cell.metadata
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

			this._proxy.acceptModelChanged(modelUrl.toString(), {
				rawEvents: dto,
				versionId: event.versionId
			});
		}));

		toDispose.add(model.onWillDispose(() => {
			this._stopModelSync(modelUrl);
		}));
		toDispose.add(toDisposable(() => {
			this._proxy.acceptRemovedModel(modelUrl);
		}));

		this._syncedModels[modelUrl] = toDispose;
	}

	private _stopModelSync(modelUrl: string): void {
		let toDispose = this._syncedModels[modelUrl];
		delete this._syncedModels[modelUrl];
		delete this._syncedModelsLastUsedTime[modelUrl];
		dispose(toDispose);
	}
}

export class EditorWorkerHost {

	private readonly _workerClient: NotebookWorkerClient;

	constructor(workerClient: NotebookWorkerClient) {
		this._workerClient = workerClient;
	}

	// foreign host request
	public fhr(method: string, args: any[]): Promise<any> {
		return this._workerClient.fhr(method, args);
	}
}

export class NotebookWorkerClient extends Disposable {
	private _worker: IWorkerClient<NotebookEditorSimpleWorker> | null;
	private readonly _workerFactory: DefaultWorkerFactory;
	private _modelManager: NotebookEditorModelManager | null;


	constructor(private readonly _notebookService: INotebookService, label: string) {
		super();
		this._workerFactory = new DefaultWorkerFactory(label);
		this._worker = null;
		this._modelManager = null;

	}

	// foreign host request
	public fhr(method: string, args: any[]): Promise<any> {
		throw new Error(`Not implemented!`);
	}

	computeDiff(original: URI, modified: URI) {
		return this._withSyncedResources([original, modified]).then(proxy => {
			return proxy.computeDiff(original.toString(), modified.toString());
		});
	}

	private _getOrCreateModelManager(proxy: NotebookEditorSimpleWorker): NotebookEditorModelManager {
		if (!this._modelManager) {
			this._modelManager = this._register(new NotebookEditorModelManager(proxy, this._notebookService));
		}
		return this._modelManager;
	}

	protected _withSyncedResources(resources: URI[]): Promise<NotebookEditorSimpleWorker> {
		return this._getProxy().then((proxy) => {
			this._getOrCreateModelManager(proxy).ensureSyncedResources(resources);
			return proxy;
		});
	}

	private _getOrCreateWorker(): IWorkerClient<NotebookEditorSimpleWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(new SimpleWorkerClient<NotebookEditorSimpleWorker, EditorWorkerHost>(
					this._workerFactory,
					'vs/workbench/contrib/notebook/common/services/notebookSimpleWorker',
					new EditorWorkerHost(this)
				));
			} catch (err) {
				// logOnceWebWorkerWarning(err);
				// this._worker = new SynchronousWorkerClient(new EditorSimpleWorker(new EditorWorkerHost(this), null));
				throw (err);
			}
		}
		return this._worker;
	}

	protected _getProxy(): Promise<NotebookEditorSimpleWorker> {
		return this._getOrCreateWorker().getProxyObject().then(undefined, (err) => {
			// logOnceWebWorkerWarning(err);
			// this._worker = new SynchronousWorkerClient(new EditorSimpleWorker(new EditorWorkerHost(this), null));
			// return this._getOrCreateWorker().getProxyObject();
			throw (err);
		});
	}


}
