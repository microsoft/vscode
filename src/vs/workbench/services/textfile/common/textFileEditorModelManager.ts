/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { dispose, IDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileEditorModelManager, IModelLoadOrCreateOptions, ITextFileModelLoadEvent, ITextFileModelSaveEvent, ITextFileSaveParticipant, IResolvedTextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { IFileService, FileChangesEvent, FileOperation } from 'vs/platform/files/common/files';
import { distinct, coalesce } from 'vs/base/common/arrays';
import { ResourceQueue } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TextFileSaveParticipant } from 'vs/workbench/services/textfile/common/textFileSaveParticipant';
import { SaveReason } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IWorkingCopyFileService, WorkingCopyFileEvent } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { ITextSnapshot } from 'vs/editor/common/model';
import { joinPath, isEqualOrParent, isEqual } from 'vs/base/common/resources';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/modelService';

export class TextFileEditorModelManager extends Disposable implements ITextFileEditorModelManager {

	private readonly _onDidLoad = this._register(new Emitter<ITextFileModelLoadEvent>());
	readonly onDidLoad = this._onDidLoad.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<ITextFileEditorModel>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<ITextFileEditorModel>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<ITextFileModelSaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<ITextFileEditorModel>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onDidChangeEncoding = this._register(new Emitter<ITextFileEditorModel>());
	readonly onDidChangeEncoding = this._onDidChangeEncoding.event;

	private readonly _onDidChangeOrphaned = this._register(new Emitter<ITextFileEditorModel>());
	readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	saveErrorHandler = (() => {
		const notificationService = this.notificationService;

		return {
			onSaveError(error: Error, model: ITextFileEditorModel): void {
				notificationService.error(localize('genericSaveError', "Failed to save '{0}': {1}", model.name, toErrorMessage(error, false)));
			}
		};
	})();

	private readonly mapResourceToModel = new ResourceMap<ITextFileEditorModel>();
	private readonly mapResourceToModelListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingModelLoaders = new ResourceMap<Promise<ITextFileEditorModel>>();

	private readonly modelLoadQueue = this._register(new ResourceQueue());

	constructor(
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IModelService private readonly modelService: IModelService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update models from file change events
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Working copy operations
		this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => this.onWillRunWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation(e => this.onDidFailWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this.onDidRunWorkingCopyFileOperation(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onDidFilesChange(e: FileChangesEvent): void {

		// Collect distinct (saved) models to update.
		//
		// Note: we also consider the added event because it could be that a file was added
		// and updated right after.
		distinct(coalesce([...e.getUpdated(), ...e.getAdded()]
			.map(({ resource }) => this.get(resource)))
			.filter(model => model && !model.isDirty()), model => model.resource.toString())
			.forEach(model => this.queueModelLoad(model));
	}

	private queueModelLoad(model: ITextFileEditorModel): void {

		// Load model to update (use a queue to prevent accumulation of loads
		// when the load actually takes long. At most we only want the queue
		// to have a size of 2 (1 running load and 1 queued load).
		const queue = this.modelLoadQueue.queueFor(model.resource);
		if (queue.size <= 1) {
			queue.queue(async () => {
				try {
					await model.load();
				} catch (error) {
					onUnexpectedError(error);
				}
			});
		}
	}

	private readonly mapCorrelationIdToModelsToRestore = new Map<number, { source: URI, target: URI, snapshot?: ITextSnapshot; encoding?: string; mode?: string }[]>();

	private onWillRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: remember models to restore after the operation
		const source = e.source;
		if (source && (e.operation === FileOperation.COPY || e.operation === FileOperation.MOVE)) {

			// find all models that related to either source or target (can be many if resource is a folder)
			const sourceModels: ITextFileEditorModel[] = [];
			const targetModels: ITextFileEditorModel[] = [];
			for (const model of this.getAll()) {
				const resource = model.resource;

				if (isEqualOrParent(resource, e.target, false /* do not ignorecase, see https://github.com/Microsoft/vscode/issues/56384 */)) {
					targetModels.push(model);
				}

				if (isEqualOrParent(resource, source)) {
					sourceModels.push(model);
				}
			}

			// remember each source model to load again after move is done
			// with optional content to restore if it was dirty
			const modelsToRestore: { source: URI, target: URI, snapshot?: ITextSnapshot; encoding?: string; mode?: string }[] = [];
			for (const sourceModel of sourceModels) {
				const sourceModelResource = sourceModel.resource;

				// If the source is the actual model, just use target as new resource
				let targetModelResource: URI;
				if (isEqual(sourceModelResource, e.source)) {
					targetModelResource = e.target;
				}

				// Otherwise a parent folder of the source is being moved, so we need
				// to compute the target resource based on that
				else {
					targetModelResource = joinPath(e.target, sourceModelResource.path.substr(source.path.length + 1));
				}

				modelsToRestore.push({
					source: sourceModelResource,
					target: targetModelResource,
					mode: sourceModel.getMode(),
					encoding: sourceModel.getEncoding(),
					snapshot: sourceModel.isDirty() ? sourceModel.createSnapshot() : undefined
				});
			}

			this.mapCorrelationIdToModelsToRestore.set(e.correlationId, modelsToRestore);
		}
	}

	private onDidFailWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: restore dirty flag on models to restore that were dirty
		if ((e.operation === FileOperation.COPY || e.operation === FileOperation.MOVE)) {
			const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
			if (modelsToRestore) {
				this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);

				modelsToRestore.forEach(model => {
					// snapshot presence means this model used to be dirty
					if (model.snapshot) {
						this.get(model.source)?.setDirty(true);
					}
				});
			}
		}
	}

	private onDidRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: restore models that were loaded before the operation took place
		if ((e.operation === FileOperation.COPY || e.operation === FileOperation.MOVE)) {
			e.waitUntil((async () => {
				const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
				if (modelsToRestore) {
					this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);

					await Promise.all(modelsToRestore.map(async modelToRestore => {

						// restore the model, forcing a reload. this is important because
						// we know the file has changed on disk after the move and the
						// model might have still existed with the previous state. this
						// ensures we are not tracking a stale state.
						const restoredModel = await this.resolve(modelToRestore.target, { reload: { async: false }, encoding: modelToRestore.encoding, mode: modelToRestore.mode });

						// restore previous dirty content if any and ensure to mark
						// the model as dirty
						if (modelToRestore.snapshot && restoredModel.isResolved()) {
							this.modelService.updateModel(restoredModel.textEditorModel, createTextBufferFactoryFromSnapshot(modelToRestore.snapshot));
						}
					}));
				}
			})());
		}
	}

	get(resource: URI): ITextFileEditorModel | undefined {
		return this.mapResourceToModel.get(resource);
	}

	async resolve(resource: URI, options?: IModelLoadOrCreateOptions): Promise<ITextFileEditorModel> {

		// Return early if model is currently being loaded
		const pendingLoad = this.mapResourceToPendingModelLoaders.get(resource);
		if (pendingLoad) {
			return pendingLoad;
		}

		let modelPromise: Promise<ITextFileEditorModel>;

		// Model exists
		let model = this.get(resource);
		if (model) {
			if (options?.reload) {

				// async reload: trigger a reload but return immediately
				if (options.reload.async) {
					modelPromise = Promise.resolve(model);
					model.load(options);
				}

				// sync reload: do not return until model reloaded
				else {
					modelPromise = model.load(options);
				}
			} else {
				modelPromise = Promise.resolve(model);
			}
		}

		// Model does not exist
		else {
			const newModel = model = this.instantiationService.createInstance(TextFileEditorModel, resource, options ? options.encoding : undefined, options ? options.mode : undefined);
			modelPromise = model.load(options);

			// Install model listeners
			const listeners = new DisposableStore();
			listeners.add(model.onDidLoad(reason => this._onDidLoad.fire({ model: newModel, reason })));
			listeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire(newModel)));
			listeners.add(model.onDidSaveError(() => this._onDidSaveError.fire(newModel)));
			listeners.add(model.onDidSave(reason => this._onDidSave.fire({ model: newModel, reason })));
			listeners.add(model.onDidRevert(() => this._onDidRevert.fire(newModel)));
			listeners.add(model.onDidChangeEncoding(() => this._onDidChangeEncoding.fire(newModel)));
			listeners.add(model.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(newModel)));

			this.mapResourceToModelListeners.set(resource, listeners);
		}

		// Store pending loads to avoid race conditions
		this.mapResourceToPendingModelLoaders.set(resource, modelPromise);

		try {
			const resolvedModel = await modelPromise;

			// Make known to manager (if not already known)
			this.add(resource, resolvedModel);

			// Model can be dirty if a backup was restored, so we make sure to have this event delivered
			if (resolvedModel.isDirty()) {
				this._onDidChangeDirty.fire(resolvedModel);
			}

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders.delete(resource);

			// Apply mode if provided
			if (options?.mode) {
				resolvedModel.setMode(options.mode);
			}

			return resolvedModel;
		} catch (error) {

			// Free resources of this invalid model
			if (model) {
				model.dispose();
			}

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders.delete(resource);

			throw error;
		}
	}

	getAll(filter?: (model: ITextFileEditorModel) => boolean): ITextFileEditorModel[] {
		const res: ITextFileEditorModel[] = [];
		this.mapResourceToModel.forEach(model => {
			if (!filter || filter(model)) {
				res.push(model);
			}
		});

		return res;
	}

	add(resource: URI, model: ITextFileEditorModel): void {
		const knownModel = this.mapResourceToModel.get(resource);
		if (knownModel === model) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			disposeListener.dispose();
		}

		// store in cache but remove when model gets disposed
		this.mapResourceToModel.set(resource, model);
		this.mapResourceToDisposeListener.set(resource, model.onDispose(() => this.remove(resource)));
	}

	remove(resource: URI): void {
		this.mapResourceToModel.delete(resource);

		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			dispose(disposeListener);
			this.mapResourceToDisposeListener.delete(resource);
		}

		const modelListener = this.mapResourceToModelListeners.get(resource);
		if (modelListener) {
			dispose(modelListener);
			this.mapResourceToModelListeners.delete(resource);
		}
	}

	//#region Save participants

	private readonly saveParticipants = this._register(this.instantiationService.createInstance(TextFileSaveParticipant));

	addSaveParticipant(participant: ITextFileSaveParticipant): IDisposable {
		return this.saveParticipants.addSaveParticipant(participant);
	}

	runSaveParticipants(model: IResolvedTextFileEditorModel, context: { reason: SaveReason; }, token: CancellationToken): Promise<void> {
		return this.saveParticipants.participate(model, context, token);
	}

	//#endregion

	clear(): void {

		// model caches
		this.mapResourceToModel.clear();
		this.mapResourceToPendingModelLoaders.clear();

		// dispose the dispose listeners
		this.mapResourceToDisposeListener.forEach(l => l.dispose());
		this.mapResourceToDisposeListener.clear();

		// dispose the model change listeners
		this.mapResourceToModelListeners.forEach(l => l.dispose());
		this.mapResourceToModelListeners.clear();
	}

	disposeModel(model: TextFileEditorModel): void {
		if (!model) {
			return; // we need data!
		}

		if (model.isDisposed()) {
			return; // already disposed
		}

		if (this.mapResourceToPendingModelLoaders.has(model.resource)) {
			return; // not yet loaded
		}

		if (model.isDirty()) {
			return; // not saved
		}

		model.dispose();
	}

	dispose(): void {
		super.dispose();

		this.clear();
	}
}
