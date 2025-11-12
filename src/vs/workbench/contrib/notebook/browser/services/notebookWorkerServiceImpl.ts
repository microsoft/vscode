/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWebWorkerClient, Proxied } from '../../../../../base/common/worker/webWorker.js';
import { createWebWorker, WebWorkerDescriptor } from '../../../../../base/browser/webWorkerFactory.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { CellUri, IMainCellDto, INotebookDiffResult, NotebookCellsChangeType, NotebookRawContentEventDto } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';
import { NotebookWorker } from '../../common/services/notebookWebWorker.js';
import { INotebookEditorWorkerService } from '../../common/services/notebookWorkerService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';

export class NotebookEditorWorkerServiceImpl extends Disposable implements INotebookEditorWorkerService {
	declare readonly _serviceBrand: undefined;

	private readonly _workerManager: WorkerManager;

	constructor(
		@INotebookService notebookService: INotebookService,
		@IModelService modelService: IModelService,
	) {
		super();

		this._workerManager = this._register(new WorkerManager(notebookService, modelService));
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
		private readonly _notebookService: INotebookService,
		private readonly _modelService: IModelService,
	) {
		super();
		this._editorWorkerClient = null;
		// this._lastWorkerUsedTime = (new Date()).getTime();
	}

	withWorker(): Promise<NotebookWorkerClient> {
		// this._lastWorkerUsedTime = (new Date()).getTime();
		if (!this._editorWorkerClient) {
			this._editorWorkerClient = new NotebookWorkerClient(this._notebookService, this._modelService);
			this._register(this._editorWorkerClient);
		}
		return Promise.resolve(this._editorWorkerClient);
	}
}

class NotebookEditorModelManager extends Disposable {
	private _syncedModels: { [modelUrl: string]: IDisposable } = Object.create(null);
	private _syncedModelsLastUsedTime: { [modelUrl: string]: number } = Object.create(null);

	constructor(
		private readonly _proxy: Proxied<NotebookWorker>,
		private readonly _notebookService: INotebookService,
		private readonly _modelService: IModelService,
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
			model.metadata,
			model.transientOptions.transientDocumentMetadata,
			model.cells.map(cell => ({
				handle: cell.handle,
				url: cell.uri.toString(),
				source: cell.textBuffer.getLinesContent(),
				eol: cell.textBuffer.getEOL(),
				versionId: cell.textModel?.getVersionId() ?? 0,
				language: cell.language,
				mime: cell.mime,
				cellKind: cell.cellKind,
				outputs: cell.outputs.map(op => ({ outputId: op.outputId, outputs: op.outputs })),
				metadata: cell.metadata,
				internalMetadata: cell.internalMetadata,
			}))
		);

		const toDispose = new DisposableStore();

		const cellToDto = (cell: NotebookCellTextModel): IMainCellDto => {
			return {
				handle: cell.handle,
				url: cell.uri.toString(),
				source: cell.textBuffer.getLinesContent(),
				eol: cell.textBuffer.getEOL(),
				versionId: 0,
				language: cell.language,
				cellKind: cell.cellKind,
				outputs: cell.outputs.map(op => ({ outputId: op.outputId, outputs: op.outputs })),
				metadata: cell.metadata,
				internalMetadata: cell.internalMetadata,
			};
		};

		const cellHandlers = new Set<NotebookCellTextModel>();
		const addCellContentChangeHandler = (cell: NotebookCellTextModel) => {
			cellHandlers.add(cell);
			toDispose.add(cell.onDidChangeContent((e) => {
				if (typeof e === 'object' && e.type === 'model') {
					this._proxy.$acceptCellModelChanged(modelUrl, cell.handle, e.event);
				}
			}));
		};

		model.cells.forEach(cell => addCellContentChangeHandler(cell));
		// Possible some of the models have not yet been loaded.
		// If all have been loaded, for all cells, then no need to listen to model add events.
		if (model.cells.length !== cellHandlers.size) {
			toDispose.add(this._modelService.onModelAdded((textModel: ITextModel) => {
				if (textModel.uri.scheme !== Schemas.vscodeNotebookCell || !(textModel instanceof TextModel)) {
					return;
				}
				const cellUri = CellUri.parse(textModel.uri);
				if (!cellUri || !isEqual(cellUri.notebook, model.uri)) {
					return;
				}
				const cell = model.cells.find(cell => cell.handle === cellUri.handle);
				if (cell) {
					addCellContentChangeHandler(cell);
				}
			}));
		}

		toDispose.add(model.onDidChangeContent((event) => {
			const dto: NotebookRawContentEventDto[] = [];
			event.rawEvents
				.forEach(e => {
					switch (e.kind) {
						case NotebookCellsChangeType.ModelChange:
						case NotebookCellsChangeType.Initialize: {
							dto.push({
								kind: e.kind,
								changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(cell => cellToDto(cell as NotebookCellTextModel))] as [number, number, IMainCellDto[]])
							});

							for (const change of e.changes) {
								for (const cell of change[2]) {
									addCellContentChangeHandler(cell as NotebookCellTextModel);
								}
							}
							break;
						}
						case NotebookCellsChangeType.Move: {
							dto.push({
								kind: NotebookCellsChangeType.Move,
								index: e.index,
								length: e.length,
								newIdx: e.newIdx,
								cells: e.cells.map(cell => cellToDto(cell as NotebookCellTextModel))
							});
							break;
						}
						case NotebookCellsChangeType.ChangeCellContent:
							// Changes to cell content are handled by the cell model change listener.
							break;
						case NotebookCellsChangeType.ChangeDocumentMetadata:
							dto.push({
								kind: e.kind,
								metadata: e.metadata
							});
						default:
							dto.push(e);
					}
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
	private _worker: IWebWorkerClient<NotebookWorker> | null;
	private _modelManager: NotebookEditorModelManager | null;


	constructor(private readonly _notebookService: INotebookService, private readonly _modelService: IModelService) {
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

	private _getOrCreateModelManager(proxy: Proxied<NotebookWorker>): NotebookEditorModelManager {
		if (!this._modelManager) {
			this._modelManager = this._register(new NotebookEditorModelManager(proxy, this._notebookService, this._modelService));
		}
		return this._modelManager;
	}

	protected _ensureSyncedResources(resources: URI[]): Proxied<NotebookWorker> {
		const proxy = this._getOrCreateWorker().proxy;
		this._getOrCreateModelManager(proxy).ensureSyncedResources(resources);
		return proxy;
	}

	private _getOrCreateWorker(): IWebWorkerClient<NotebookWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(createWebWorker<NotebookWorker>(
					new WebWorkerDescriptor({
						esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/contrib/notebook/common/services/notebookWebWorkerMain.js'),
						label: 'NotebookEditorWorker'
					})
				));
			} catch (err) {
				throw (err);
			}
		}
		return this._worker;
	}
}
