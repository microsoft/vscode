/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { dispose, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileEditorModelManager, TextFileModelChangeEvent, StateChange, IModelLoadOrCreateOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { IFileService, FileChangesEvent } from 'vs/platform/files/common/files';
import { distinct, coalesce } from 'vs/base/common/arrays';
import { ResourceQueue } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';

export class TextFileEditorModelManager extends Disposable implements ITextFileEditorModelManager {

	private readonly _onModelDisposed = this._register(new Emitter<URI>());
	readonly onModelDisposed = this._onModelDisposed.event;

	private readonly _onModelContentChanged = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelContentChanged = this._onModelContentChanged.event;

	private readonly _onModelDirty = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelDirty = this._onModelDirty.event;

	private readonly _onModelSaveError = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelSaveError = this._onModelSaveError.event;

	private readonly _onModelSaved = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelSaved = this._onModelSaved.event;

	private readonly _onModelReverted = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelReverted = this._onModelReverted.event;

	private readonly _onModelEncodingChanged = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelEncodingChanged = this._onModelEncodingChanged.event;

	private readonly _onModelOrphanedChanged = this._register(new Emitter<TextFileModelChangeEvent>());
	readonly onModelOrphanedChanged = this._onModelOrphanedChanged.event;

	private _onModelsDirty: Event<ReadonlyArray<TextFileModelChangeEvent>> | undefined;
	get onModelsDirty(): Event<ReadonlyArray<TextFileModelChangeEvent>> {
		if (!this._onModelsDirty) {
			this._onModelsDirty = this.debounce(this.onModelDirty);
		}

		return this._onModelsDirty;
	}

	private _onModelsSaveError: Event<ReadonlyArray<TextFileModelChangeEvent>> | undefined;
	get onModelsSaveError(): Event<ReadonlyArray<TextFileModelChangeEvent>> {
		if (!this._onModelsSaveError) {
			this._onModelsSaveError = this.debounce(this.onModelSaveError);
		}

		return this._onModelsSaveError;
	}

	private _onModelsSaved: Event<ReadonlyArray<TextFileModelChangeEvent>> | undefined;
	get onModelsSaved(): Event<ReadonlyArray<TextFileModelChangeEvent>> {
		if (!this._onModelsSaved) {
			this._onModelsSaved = this.debounce(this.onModelSaved);
		}

		return this._onModelsSaved;
	}

	private _onModelsReverted: Event<ReadonlyArray<TextFileModelChangeEvent>> | undefined;
	get onModelsReverted(): Event<ReadonlyArray<TextFileModelChangeEvent>> {
		if (!this._onModelsReverted) {
			this._onModelsReverted = this.debounce(this.onModelReverted);
		}

		return this._onModelsReverted;
	}

	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToStateChangeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToModelContentChangeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToModel = new ResourceMap<ITextFileEditorModel>();
	private readonly mapResourceToPendingModelLoaders = new ResourceMap<Promise<ITextFileEditorModel>>();

	private readonly modelLoadQueue = new ResourceQueue();

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

	private debounce(event: Event<TextFileModelChangeEvent>): Event<TextFileModelChangeEvent[]> {
		return Event.debounce<TextFileModelChangeEvent, TextFileModelChangeEvent[]>(event, (prev, cur) => {
			if (!prev) {
				prev = [cur];
			} else {
				prev.push(cur);
			}
			return prev;
		}, this.debounceDelay());
	}

	protected debounceDelay(): number {
		return 250;
	}

	get(resource: URI): ITextFileEditorModel | undefined {
		return this.mapResourceToModel.get(resource);
	}

	async loadOrCreate(resource: URI, options?: IModelLoadOrCreateOptions): Promise<ITextFileEditorModel> {

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

			// Install state change listener
			this.mapResourceToStateChangeListener.set(resource, model.onDidStateChange(state => {
				const event = new TextFileModelChangeEvent(newModel, state);
				switch (state) {
					case StateChange.DIRTY:
						this._onModelDirty.fire(event);
						break;
					case StateChange.SAVE_ERROR:
						this._onModelSaveError.fire(event);
						break;
					case StateChange.SAVED:
						this._onModelSaved.fire(event);
						break;
					case StateChange.REVERTED:
						this._onModelReverted.fire(event);
						break;
					case StateChange.ENCODING:
						this._onModelEncodingChanged.fire(event);
						break;
					case StateChange.ORPHANED_CHANGE:
						this._onModelOrphanedChanged.fire(event);
						break;
				}
			}));

			// Install model content change listener
			this.mapResourceToModelContentChangeListener.set(resource, model.onDidContentChange(e => {
				this._onModelContentChanged.fire(new TextFileModelChangeEvent(newModel, e));
			}));
		}

		// Store pending loads to avoid race conditions
		this.mapResourceToPendingModelLoaders.set(resource, modelPromise);

		try {
			const resolvedModel = await modelPromise;

			// Make known to manager (if not already known)
			this.add(resource, resolvedModel);

			// Model can be dirty if a backup was restored, so we make sure to have this event delivered
			if (resolvedModel.isDirty()) {
				this._onModelDirty.fire(new TextFileModelChangeEvent(resolvedModel, StateChange.DIRTY));
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

	getAll(resource?: URI, filter?: (model: ITextFileEditorModel) => boolean): ITextFileEditorModel[] {
		if (resource) {
			const res = this.mapResourceToModel.get(resource);

			return res ? [res] : [];
		}

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
		this.mapResourceToDisposeListener.set(resource, model.onDispose(() => {
			this.remove(resource);
			this._onModelDisposed.fire(resource);
		}));
	}

	remove(resource: URI): void {
		this.mapResourceToModel.delete(resource);

		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			dispose(disposeListener);
			this.mapResourceToDisposeListener.delete(resource);
		}

		const stateChangeListener = this.mapResourceToStateChangeListener.get(resource);
		if (stateChangeListener) {
			dispose(stateChangeListener);
			this.mapResourceToStateChangeListener.delete(resource);
		}

		const modelContentChangeListener = this.mapResourceToModelContentChangeListener.get(resource);
		if (modelContentChangeListener) {
			dispose(modelContentChangeListener);
			this.mapResourceToModelContentChangeListener.delete(resource);
		}
	}

	clear(): void {

		// model caches
		this.mapResourceToModel.clear();
		this.mapResourceToPendingModelLoaders.clear();

		// dispose the dispose listeners
		this.mapResourceToDisposeListener.forEach(l => l.dispose());
		this.mapResourceToDisposeListener.clear();

		// dispose the state change listeners
		this.mapResourceToStateChangeListener.forEach(l => l.dispose());
		this.mapResourceToStateChangeListener.clear();

		// dispose the model content change listeners
		this.mapResourceToModelContentChangeListener.forEach(l => l.dispose());
		this.mapResourceToModelContentChangeListener.clear();
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
