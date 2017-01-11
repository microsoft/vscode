/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter, debounceEvent } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ModelState, ITextFileEditorModel, ITextFileEditorModelManager, TextFileModelChangeEvent, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileOperation, FileOperationEvent, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';

export class TextFileEditorModelManager implements ITextFileEditorModelManager {

	// Delay in ms that we wait at minimum before we update a model from a file change event.
	// This reduces the chance that a save from the client triggers an update of the editor.
	private static FILE_CHANGE_UPDATE_DELAY = 2000;

	private toUnbind: IDisposable[];

	private _onModelDisposed: Emitter<URI>;
	private _onModelContentChanged: Emitter<TextFileModelChangeEvent>;
	private _onModelDirty: Emitter<TextFileModelChangeEvent>;
	private _onModelSaveError: Emitter<TextFileModelChangeEvent>;
	private _onModelSaved: Emitter<TextFileModelChangeEvent>;
	private _onModelReverted: Emitter<TextFileModelChangeEvent>;
	private _onModelEncodingChanged: Emitter<TextFileModelChangeEvent>;

	private _onModelsDirtyEvent: Event<TextFileModelChangeEvent[]>;
	private _onModelsSaveError: Event<TextFileModelChangeEvent[]>;
	private _onModelsSaved: Event<TextFileModelChangeEvent[]>;
	private _onModelsReverted: Event<TextFileModelChangeEvent[]>;

	private mapResourceToDisposeListener: { [resource: string]: IDisposable; };
	private mapResourceToStateChangeListener: { [resource: string]: IDisposable; };
	private mapResourceToModelContentChangeListener: { [resource: string]: IDisposable; };
	private mapResourceToModel: { [resource: string]: ITextFileEditorModel; };
	private mapResourceToPendingModelLoaders: { [resource: string]: TPromise<ITextFileEditorModel> };

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService private fileService: IFileService
	) {
		this.toUnbind = [];

		this._onModelDisposed = new Emitter<URI>();
		this._onModelContentChanged = new Emitter<TextFileModelChangeEvent>();
		this._onModelDirty = new Emitter<TextFileModelChangeEvent>();
		this._onModelSaveError = new Emitter<TextFileModelChangeEvent>();
		this._onModelSaved = new Emitter<TextFileModelChangeEvent>();
		this._onModelReverted = new Emitter<TextFileModelChangeEvent>();
		this._onModelEncodingChanged = new Emitter<TextFileModelChangeEvent>();

		this.toUnbind.push(this._onModelDisposed);
		this.toUnbind.push(this._onModelContentChanged);
		this.toUnbind.push(this._onModelDirty);
		this.toUnbind.push(this._onModelSaveError);
		this.toUnbind.push(this._onModelSaved);
		this.toUnbind.push(this._onModelReverted);
		this.toUnbind.push(this._onModelEncodingChanged);

		this.mapResourceToModel = Object.create(null);
		this.mapResourceToDisposeListener = Object.create(null);
		this.mapResourceToStateChangeListener = Object.create(null);
		this.mapResourceToModelContentChangeListener = Object.create(null);
		this.mapResourceToPendingModelLoaders = Object.create(null);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Editors changing/closing
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
		this.toUnbind.push(this.editorGroupService.getStacksModel().onEditorClosed(() => this.onEditorClosed()));

		// File changes
		this.toUnbind.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));
		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onEditorsChanged(): void {
		this.disposeUnusedModels();
	}

	private onEditorClosed(): void {
		this.disposeUnusedModels();
	}

	private disposeModelIfPossible(resource: URI): void {
		const model = this.get(resource);
		if (this.canDispose(model)) {
			model.dispose();
		}
	}

	private onFileOperation(e: FileOperationEvent): void {
		if (e.operation === FileOperation.MOVE || e.operation === FileOperation.DELETE) {
			this.disposeModelIfPossible(e.resource); // dispose models of moved or deleted files
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Dispose inputs that got deleted
		e.getDeleted().forEach(deleted => {
			this.disposeModelIfPossible(deleted.resource);
		});

		// Dispose models that got changed and are not visible. We do this because otherwise
		// cached file models will be stale from the contents on disk.
		e.getUpdated()
			.map(u => this.get(u.resource))
			.filter(model => {
				if (!model) {
					return false;
				}

				if (Date.now() - model.getLastSaveAttemptTime() < TextFileEditorModelManager.FILE_CHANGE_UPDATE_DELAY) {
					return false; // this is a weak check to see if the change came from outside the editor or not
				}

				return true; // ok boss
			})
			.forEach(model => this.disposeModelIfPossible(model.getResource()));
	}

	private canDispose(textModel: ITextFileEditorModel): boolean {
		if (!textModel) {
			return false; // we need data!
		}

		if (textModel.isDisposed()) {
			return false; // already disposed
		}

		if (textModel.textEditorModel && textModel.textEditorModel.isAttachedToEditor()) {
			return false; // never dispose when attached to editor
		}

		if (textModel.getState() !== ModelState.SAVED) {
			return false; // never dispose unsaved models
		}

		if (this.mapResourceToPendingModelLoaders[textModel.getResource().toString()]) {
			return false; // never dispose models that we are about to load at the same time
		}

		return true;
	}

	public get onModelDisposed(): Event<URI> {
		return this._onModelDisposed.event;
	}

	public get onModelContentChanged(): Event<TextFileModelChangeEvent> {
		return this._onModelContentChanged.event;
	}

	public get onModelDirty(): Event<TextFileModelChangeEvent> {
		return this._onModelDirty.event;
	}

	public get onModelSaveError(): Event<TextFileModelChangeEvent> {
		return this._onModelSaveError.event;
	}

	public get onModelSaved(): Event<TextFileModelChangeEvent> {
		return this._onModelSaved.event;
	}

	public get onModelReverted(): Event<TextFileModelChangeEvent> {
		return this._onModelReverted.event;
	}

	public get onModelEncodingChanged(): Event<TextFileModelChangeEvent> {
		return this._onModelEncodingChanged.event;
	}

	public get onModelsDirty(): Event<TextFileModelChangeEvent[]> {
		if (!this._onModelsDirtyEvent) {
			this._onModelsDirtyEvent = this.debounce(this.onModelDirty);
		}

		return this._onModelsDirtyEvent;
	}

	public get onModelsSaveError(): Event<TextFileModelChangeEvent[]> {
		if (!this._onModelsSaveError) {
			this._onModelsSaveError = this.debounce(this.onModelSaveError);
		}

		return this._onModelsSaveError;
	}

	public get onModelsSaved(): Event<TextFileModelChangeEvent[]> {
		if (!this._onModelsSaved) {
			this._onModelsSaved = this.debounce(this.onModelSaved);
		}

		return this._onModelsSaved;
	}

	public get onModelsReverted(): Event<TextFileModelChangeEvent[]> {
		if (!this._onModelsReverted) {
			this._onModelsReverted = this.debounce(this.onModelReverted);
		}

		return this._onModelsReverted;
	}

	private debounce(event: Event<TextFileModelChangeEvent>): Event<TextFileModelChangeEvent[]> {
		return debounceEvent(event, (prev: TextFileModelChangeEvent[], cur: TextFileModelChangeEvent) => {
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

	public get(resource: URI): ITextFileEditorModel {
		return this.mapResourceToModel[resource.toString()];
	}

	public loadOrCreate(resource: URI, encoding?: string, refresh?: boolean): TPromise<ITextFileEditorModel> {

		// Return early if model is currently being loaded
		const pendingLoad = this.mapResourceToPendingModelLoaders[resource.toString()];
		if (pendingLoad) {
			return pendingLoad;
		}

		let modelPromise: TPromise<ITextFileEditorModel>;

		// Model exists
		let model = this.get(resource);
		if (model) {
			if (!refresh) {
				modelPromise = TPromise.as(model);
			} else {
				modelPromise = model.load();
			}
		}

		// Model does not exist
		else {
			model = this.instantiationService.createInstance(TextFileEditorModel, resource, encoding);
			modelPromise = model.load();

			// Install state change listener
			this.mapResourceToStateChangeListener[resource.toString()] = model.onDidStateChange(state => {
				const event = new TextFileModelChangeEvent(model, state);
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
				}
			});

			// Install model content change listener
			this.mapResourceToModelContentChangeListener[resource.toString()] = model.onDidContentChange(e => {
				this._onModelContentChanged.fire(new TextFileModelChangeEvent(model, e));
			});
		}

		// Store pending loads to avoid race conditions
		this.mapResourceToPendingModelLoaders[resource.toString()] = modelPromise;

		return modelPromise.then(model => {

			// Make known to manager (if not already known)
			this.add(resource, model);

			// Model can be dirty if a backup was restored, so we make sure to have this event delivered
			if (model.isDirty()) {
				this._onModelDirty.fire(new TextFileModelChangeEvent(model, StateChange.DIRTY));
			}

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders[resource.toString()] = null;

			return model;
		}, error => {

			// Free resources of this invalid model
			model.dispose();

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders[resource.toString()] = null;

			return TPromise.wrapError(error);
		});
	}

	public getAll(resource?: URI): ITextFileEditorModel[] {
		if (resource) {
			const res = this.mapResourceToModel[resource.toString()];

			return res ? [res] : [];
		}

		const keys = Object.keys(this.mapResourceToModel);
		const res: ITextFileEditorModel[] = [];
		for (let i = 0; i < keys.length; i++) {
			res.push(this.mapResourceToModel[keys[i]]);
		}

		return res;
	}

	public add(resource: URI, model: ITextFileEditorModel): void {
		const knownModel = this.mapResourceToModel[resource.toString()];
		if (knownModel === model) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener[resource.toString()];
		if (disposeListener) {
			disposeListener.dispose();
		}

		// store in cache but remove when model gets disposed
		this.mapResourceToModel[resource.toString()] = model;
		this.mapResourceToDisposeListener[resource.toString()] = model.onDispose(() => {
			this.remove(resource);
			this._onModelDisposed.fire(resource);
		});
	}

	public remove(resource: URI): void {
		delete this.mapResourceToModel[resource.toString()];

		const disposeListener = this.mapResourceToDisposeListener[resource.toString()];
		if (disposeListener) {
			dispose(disposeListener);
			delete this.mapResourceToDisposeListener[resource.toString()];
		}

		const stateChangeListener = this.mapResourceToStateChangeListener[resource.toString()];
		if (stateChangeListener) {
			dispose(stateChangeListener);
			delete this.mapResourceToStateChangeListener[resource.toString()];
		}

		const modelContentChangeListener = this.mapResourceToModelContentChangeListener[resource.toString()];
		if (modelContentChangeListener) {
			dispose(modelContentChangeListener);
			delete this.mapResourceToModelContentChangeListener[resource.toString()];
		}
	}

	public clear(): void {

		// model cache
		this.mapResourceToModel = Object.create(null);

		// dispose dispose listeners
		let keys = Object.keys(this.mapResourceToDisposeListener);
		dispose(keys.map(k => this.mapResourceToDisposeListener[k]));
		this.mapResourceToDisposeListener = Object.create(null);

		// dispose state change listeners
		keys = Object.keys(this.mapResourceToStateChangeListener);
		dispose(keys.map(k => this.mapResourceToStateChangeListener[k]));
		this.mapResourceToStateChangeListener = Object.create(null);

		// dispose model content change listeners
		keys = Object.keys(this.mapResourceToModelContentChangeListener);
		dispose(keys.map(k => this.mapResourceToModelContentChangeListener[k]));
		this.mapResourceToModelContentChangeListener = Object.create(null);
	}

	private disposeUnusedModels(): void {

		// To not grow our text file model cache infinitly, we dispose models that
		// are not showing up in any opened editor.

		// Get all cached file models
		this.getAll()

			// Only models that are not open inside the editor area
			.filter(model => !this.editorGroupService.getStacksModel().isOpen(model.getResource()))

			// Dispose
			.forEach(model => this.disposeModelIfPossible(model.getResource()));
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}