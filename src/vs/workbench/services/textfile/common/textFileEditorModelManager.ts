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
import { ITextFileEditorModel, ITextFileEditorModelManager, TextFileModelChangeEvent, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';

export class TextFileEditorModelManager implements ITextFileEditorModelManager {
	private toUnbind: IDisposable[];

	private _onModelDisposed: Emitter<URI>;
	private _onModelContentChanged: Emitter<TextFileModelChangeEvent>;
	private _onModelDirty: Emitter<TextFileModelChangeEvent>;
	private _onModelSaveError: Emitter<TextFileModelChangeEvent>;
	private _onModelSaved: Emitter<TextFileModelChangeEvent>;
	private _onModelReverted: Emitter<TextFileModelChangeEvent>;
	private _onModelEncodingChanged: Emitter<TextFileModelChangeEvent>;
	private _onModelOrphanedChanged: Emitter<TextFileModelChangeEvent>;

	private _onModelsDirtyEvent: Event<TextFileModelChangeEvent[]>;
	private _onModelsSaveError: Event<TextFileModelChangeEvent[]>;
	private _onModelsSaved: Event<TextFileModelChangeEvent[]>;
	private _onModelsReverted: Event<TextFileModelChangeEvent[]>;

	private mapResourceToDisposeListener: ResourceMap<IDisposable>;
	private mapResourceToStateChangeListener: ResourceMap<IDisposable>;
	private mapResourceToModelContentChangeListener: ResourceMap<IDisposable>;
	private mapResourceToModel: ResourceMap<ITextFileEditorModel>;
	private mapResourceToPendingModelLoaders: ResourceMap<TPromise<ITextFileEditorModel>>;

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		this.toUnbind = [];

		this._onModelDisposed = new Emitter<URI>();
		this._onModelContentChanged = new Emitter<TextFileModelChangeEvent>();
		this._onModelDirty = new Emitter<TextFileModelChangeEvent>();
		this._onModelSaveError = new Emitter<TextFileModelChangeEvent>();
		this._onModelSaved = new Emitter<TextFileModelChangeEvent>();
		this._onModelReverted = new Emitter<TextFileModelChangeEvent>();
		this._onModelEncodingChanged = new Emitter<TextFileModelChangeEvent>();
		this._onModelOrphanedChanged = new Emitter<TextFileModelChangeEvent>();

		this.toUnbind.push(this._onModelDisposed);
		this.toUnbind.push(this._onModelContentChanged);
		this.toUnbind.push(this._onModelDirty);
		this.toUnbind.push(this._onModelSaveError);
		this.toUnbind.push(this._onModelSaved);
		this.toUnbind.push(this._onModelReverted);
		this.toUnbind.push(this._onModelEncodingChanged);
		this.toUnbind.push(this._onModelOrphanedChanged);

		this.mapResourceToModel = new ResourceMap<ITextFileEditorModel>();
		this.mapResourceToDisposeListener = new ResourceMap<IDisposable>();
		this.mapResourceToStateChangeListener = new ResourceMap<IDisposable>();
		this.mapResourceToModelContentChangeListener = new ResourceMap<IDisposable>();
		this.mapResourceToPendingModelLoaders = new ResourceMap<TPromise<ITextFileEditorModel>>();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Editors changing/closing
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
		this.toUnbind.push(this.editorGroupService.getStacksModel().onEditorClosed(() => this.onEditorClosed()));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onEditorsChanged(): void {
		this.disposeUnusedModels();
	}

	private onEditorClosed(): void {
		this.disposeUnusedModels();
	}

	private disposeUnusedModels(): void {

		// To not grow our text file model cache infinitly, we dispose models that
		// are not showing up in any opened editor.
		// TODO@Ben this is a workaround until we have adopted model references from
		// the resolver service (https://github.com/Microsoft/vscode/issues/17888)

		this.getAll(void 0, model => this.canDispose(model)).forEach(model => {
			model.dispose();
		});
	}

	private canDispose(model: ITextFileEditorModel): boolean {
		if (!model) {
			return false; // we need data!
		}

		if (model.isDisposed()) {
			return false; // already disposed
		}

		if (this.mapResourceToPendingModelLoaders.has(model.getResource())) {
			return false; // not yet loaded
		}

		if (model.isDirty()) {
			return false; // not saved
		}

		if (model.textEditorModel && model.textEditorModel.isAttachedToEditor()) {
			return false; // never dispose when attached to editor (e.g. viewzones)
		}

		if (this.editorGroupService.getStacksModel().isOpen(model.getResource())) {
			return false; // never dispose when opened inside an editor (e.g. tabs)
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

	public get onModelOrphanedChanged(): Event<TextFileModelChangeEvent> {
		return this._onModelOrphanedChanged.event;
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
		return this.mapResourceToModel.get(resource);
	}

	public loadOrCreate(resource: URI, encoding?: string, refresh?: boolean): TPromise<ITextFileEditorModel> {

		// Return early if model is currently being loaded
		const pendingLoad = this.mapResourceToPendingModelLoaders.get(resource);
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
			this.mapResourceToStateChangeListener.set(resource, model.onDidStateChange(state => {
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
					case StateChange.ORPHANED_CHANGE:
						this._onModelOrphanedChanged.fire(event);
						break;
				}
			}));

			// Install model content change listener
			this.mapResourceToModelContentChangeListener.set(resource, model.onDidContentChange(e => {
				this._onModelContentChanged.fire(new TextFileModelChangeEvent(model, e));
			}));
		}

		// Store pending loads to avoid race conditions
		this.mapResourceToPendingModelLoaders.set(resource, modelPromise);

		return modelPromise.then(model => {

			// Make known to manager (if not already known)
			this.add(resource, model);

			// Model can be dirty if a backup was restored, so we make sure to have this event delivered
			if (model.isDirty()) {
				this._onModelDirty.fire(new TextFileModelChangeEvent(model, StateChange.DIRTY));
			}

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders.delete(resource);

			return model;
		}, error => {

			// Free resources of this invalid model
			model.dispose();

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders.delete(resource);

			return TPromise.wrapError(error);
		});
	}

	public getAll(resource?: URI, filter?: (model: ITextFileEditorModel) => boolean): ITextFileEditorModel[] {
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

	public add(resource: URI, model: ITextFileEditorModel): void {
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

	public remove(resource: URI): void {
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

	public clear(): void {

		// model caches
		this.mapResourceToModel.clear();
		this.mapResourceToPendingModelLoaders.clear();

		// dispose dispose listeners
		this.mapResourceToDisposeListener.forEach(l => l.dispose());
		this.mapResourceToDisposeListener.clear();

		// dispose state change listeners
		this.mapResourceToStateChangeListener.forEach(l => l.dispose());
		this.mapResourceToStateChangeListener.clear();

		// dispose model content change listeners
		this.mapResourceToModelContentChangeListener.forEach(l => l.dispose());
		this.mapResourceToModelContentChangeListener.clear();
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}