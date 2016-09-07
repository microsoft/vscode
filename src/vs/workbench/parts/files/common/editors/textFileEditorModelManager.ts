/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ITextFileEditorModelManager} from 'vs/workbench/parts/files/common/files';
import {dispose, IDisposable} from 'vs/base/common/lifecycle';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {ModelState, ITextFileEditorModel} from 'vs/workbench/parts/files/common/files';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';

export class TextFileEditorModelManager implements ITextFileEditorModelManager {

	private toUnbind: IDisposable[];

	private mapResourceToDisposeListener: { [resource: string]: IDisposable; };
	private mapResourcePathToModel: { [resource: string]: TextFileEditorModel; };

	constructor(
				@ILifecycleService private lifecycleService: ILifecycleService,

		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		this.toUnbind = [];

		this.mapResourcePathToModel = Object.create(null);
		this.mapResourceToDisposeListener = Object.create(null);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onEditorsChanged(): void {
		this.disposeUnusedModels();
	}

	public disposeModel(resource: URI): void {
		const model = this.get(resource);
		if (model) {
			if (model.isDirty()) {
				return; // we never dispose dirty models to avoid data loss
			}

			model.dispose();
		}
	}

	public get(resource: URI): TextFileEditorModel {
		return this.mapResourcePathToModel[resource.toString()];
	}

	public getAll(resource?: URI): TextFileEditorModel[] {
		return Object.keys(this.mapResourcePathToModel)
			.filter(r => !resource || resource.toString() === r)
			.map(r => this.mapResourcePathToModel[r]);
	}

	public add(resource: URI, model: TextFileEditorModel): void {
		const knownModel = this.mapResourcePathToModel[resource.toString()];
		if (knownModel === model) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener[resource.toString()];
		if (disposeListener) {
			disposeListener.dispose();
		}

		// store in cache but remove when model gets disposed
		this.mapResourcePathToModel[resource.toString()] = model;
		this.mapResourceToDisposeListener[resource.toString()] = model.addListener2('dispose', () => this.remove(resource));
	}

	public remove(resource: URI): void {
		delete this.mapResourcePathToModel[resource.toString()];

		const disposeListener = this.mapResourceToDisposeListener[resource.toString()];
		if (disposeListener) {
			dispose(disposeListener);
			delete this.mapResourceToDisposeListener[resource.toString()];
		}
	}

	public clear(): void {

		// model cache
		this.mapResourcePathToModel = Object.create(null);

		// dispose listeners
		const keys = Object.keys(this.mapResourceToDisposeListener);
		dispose(keys.map(k => this.mapResourceToDisposeListener[k]));
		this.mapResourceToDisposeListener = Object.create(null);
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

		return true;
	}

	private disposeUnusedModels(): void {

		// To not grow our text file model cache infinitly, we dispose models that
		// are not showing up in any opened editor.

		// Get all cached file models
		this.getAll()

			// Only take text file models and remove those that are under working files or opened
			.filter(model => !this.editorGroupService.getStacksModel().isOpen(model.getResource()) && this.canDispose(model))

			// Dispose
			.forEach(model => this.disposeModel(model.getResource()));
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}