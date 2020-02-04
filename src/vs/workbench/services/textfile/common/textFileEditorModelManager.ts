/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { dispose, IDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileEditorModelManager, IModelLoadOrCreateOptions, ITextFileModelLoadEvent, ITextFileModelSaveEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { IFileService, FileChangesEvent } from 'vs/platform/files/common/files';
import { distinct, coalesce } from 'vs/base/common/arrays';
import { ResourceQueue } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';

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

	private readonly mapResourceToModel = new ResourceMap<ITextFileEditorModel>();
	private readonly mapResourceToModelListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingModelLoaders = new ResourceMap<Promise<ITextFileEditorModel>>();

	private readonly modelLoadQueue = this._register(new ResourceQueue());

	constructor(
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update models from file change events
		this._register(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onFileChanges(e: FileChangesEvent): void {

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
			queue.queue(() => model.load().then(undefined, onUnexpectedError));
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
