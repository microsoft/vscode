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
import {ModelState, ITextFileEditorModel, LocalFileChangeEvent} from 'vs/workbench/parts/files/common/files';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IEventService} from 'vs/platform/event/common/event';
import {FileChangesEvent, EventType as CommonFileEventType} from 'vs/platform/files/common/files';

export class TextFileEditorModelManager implements ITextFileEditorModelManager {

	// Delay in ms that we wait at minimum before we update a model from a file change event.
	// This reduces the chance that a save from the client triggers an update of the editor.
	private static FILE_CHANGE_UPDATE_DELAY = 2000;

	private toUnbind: IDisposable[];

	private mapResourceToDisposeListener: { [resource: string]: IDisposable; };
	private mapResourcePathToModel: { [resource: string]: TextFileEditorModel; };

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEventService private eventService: IEventService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		this.toUnbind = [];

		this.mapResourcePathToModel = Object.create(null);
		this.mapResourceToDisposeListener = Object.create(null);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Editors changing
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		// File changes
		this.toUnbind.push(this.eventService.addListener2('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));
		this.toUnbind.push(this.eventService.addListener2(CommonFileEventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onLocalFileChange(e: LocalFileChangeEvent): void {
		if (e.gotMoved() || e.gotDeleted()) {
			this.disposeModelIfPossible(e.getBefore().resource); // dispose models of moved or deleted files
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

	private onEditorsChanged(): void {
		this.disposeUnusedModels();
	}

	private disposeModelIfPossible(resource: URI): void {
		const model = this.get(resource);
		if (this.canDispose(model)) {
			model.dispose();
		}
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