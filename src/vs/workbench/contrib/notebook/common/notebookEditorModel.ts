/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel, IRevertOptions } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';
import { IWorkingCopyService, IWorkingCopy, IWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { basename } from 'vs/base/common/resources';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export interface INotebookEditorModelManager {
	models: NotebookEditorModel[];

	resolve(resource: URI, viewType: string): Promise<NotebookEditorModel>;

	get(resource: URI): NotebookEditorModel | undefined;
}


export class NotebookEditorModel extends EditorModel implements IWorkingCopy, INotebookEditorModel {
	private _dirty = false;
	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;
	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	private _notebook!: NotebookTextModel;

	get notebook() {
		return this._notebook;
	}

	private _name!: string;

	get name() {
		return this._name;
	}

	constructor(
		public readonly resource: URI,
		public readonly viewType: string,
		@INotebookService private readonly notebookService: INotebookService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService
	) {
		super();
		this._register(this.workingCopyService.registerWorkingCopy(this));
	}

	capabilities = 0;

	async backup(): Promise<IWorkingCopyBackup> {
		return {};
	}

	async revert(options?: IRevertOptions | undefined): Promise<void> {
		return;
	}

	async load(): Promise<NotebookEditorModel> {
		const notebook = await this.notebookService.resolveNotebook(this.viewType!, this.resource);
		this._notebook = notebook!;

		this._name = basename(this._notebook!.uri);

		this._register(this._notebook.onDidChangeContent(() => {
			this._dirty = true;
			this._onDidChangeDirty.fire();
			this._onDidChangeContent.fire();
		}));

		return this;
	}

	isDirty() {
		return this._dirty;
	}

	async save(): Promise<boolean> {
		const tokenSource = new CancellationTokenSource();
		await this.notebookService.save(this.notebook.viewType, this.notebook.uri, tokenSource.token);
		this._dirty = false;
		this._onDidChangeDirty.fire();
		return true;
	}
}

export class NotebookEditorModelManager extends Disposable implements INotebookEditorModelManager {

	private readonly mapResourceToModel = new ResourceMap<NotebookEditorModel>();
	private readonly mapResourceToModelListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingModelLoaders = new ResourceMap<Promise<NotebookEditorModel>>();

	// private readonly modelLoadQueue = this._register(new ResourceQueue());

	get models(): NotebookEditorModel[] {
		return [...this.mapResourceToModel.values()];
	}
	constructor(
		@IInstantiationService readonly instantiationService: IInstantiationService
	) {
		super();
	}

	async resolve(resource: URI, viewType: string): Promise<NotebookEditorModel> {
		// Return early if model is currently being loaded
		const pendingLoad = this.mapResourceToPendingModelLoaders.get(resource);
		if (pendingLoad) {
			return pendingLoad;
		}

		let modelPromise: Promise<NotebookEditorModel>;
		let model = this.get(resource);
		// let didCreateModel = false;

		// Model exists
		if (model) {
			// if (options?.reload) {
			// } else {
			modelPromise = Promise.resolve(model);
			// }
		}

		// Model does not exist
		else {
			// didCreateModel = true;
			const newModel = model = this.instantiationService.createInstance(NotebookEditorModel, resource, viewType);
			modelPromise = model.load();

			this.registerModel(newModel);
		}

		// Store pending loads to avoid race conditions
		this.mapResourceToPendingModelLoaders.set(resource, modelPromise);

		// Make known to manager (if not already known)
		this.add(resource, model);

		// dispose and bind new listeners

		try {
			const resolvedModel = await modelPromise;

			// Remove from pending loads
			this.mapResourceToPendingModelLoaders.delete(resource);
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

	add(resource: URI, model: NotebookEditorModel): void {
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


	private registerModel(model: NotebookEditorModel): void {

	}

	get(resource: URI): NotebookEditorModel | undefined {
		return this.mapResourceToModel.get(resource);
	}
}
