/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, IEditorInput, GroupIdentifier, ISaveOptions, IMoveResult, IRevertOptions } from 'vs/workbench/common/editor';
import { INotebookService, INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';
import { isEqual, basename } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IReference } from 'vs/base/common/lifecycle';
import { INotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';


interface NotebookEditorInputOptions {
	startDirty?: boolean;
}

export class NotebookEditorInput extends EditorInput {

	static create(instantiationService: IInstantiationService, resource: URI, name: string, viewType: string | undefined, options: NotebookEditorInputOptions = {}) {
		return instantiationService.createInstance(NotebookEditorInput, resource, name, viewType, options);
	}

	static readonly ID: string = 'workbench.input.notebook';

	private _modelReference: IReference<INotebookEditorModel> | undefined;
	private _defaultDirtyState: boolean = false;
	private _group: GroupIdentifier | undefined;

	constructor(
		public resource: URI,
		public name: string,
		public readonly viewType: string | undefined,
		public readonly options: NotebookEditorInputOptions,
		@INotebookService private readonly notebookService: INotebookService,
		@INotebookEditorModelResolverService private readonly notebookModelService: INotebookEditorModelResolverService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._defaultDirtyState = !!options.startDirty;
	}

	getTypeId(): string {
		return NotebookEditorInput.ID;
	}

	getName(): string {
		return this.name;
	}


	get group(): GroupIdentifier | undefined {
		return this._group;
	}

	updateGroup(group: GroupIdentifier): void {
		this._group = group;
	}


	isDirty() {
		if (!this._modelReference) {
			return !!this._defaultDirtyState;
		}

		return this._modelReference.object?.isDirty() || false;
	}

	isReadonly() {
		return false;
	}

	isSaving(): boolean {
		if (this.isUntitled()) {
			return false; // untitled is never saving automatically
		}

		if (!this.isDirty()) {
			return false; // the editor needs to be dirty for being saved
		}

		if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return true; // a short auto save is configured, treat this as being saved
		}

		return false;
	}

	async save(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		if (this._modelReference) {
			await this._modelReference.object.save();
			return this;
		}

		return undefined;
	}

	async saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		if (!this._modelReference) {
			return undefined;
		}

		const dialogPath = this._modelReference.object.resource;
		const target = await this.fileDialogService.pickFileToSave(dialogPath, options?.availableFileSystems);
		if (!target) {
			return undefined; // save cancelled
		}

		if (!await this._modelReference.object.saveAs(target)) {
			return undefined;
		}

		return this._move(group, target)?.editor;
	}

	// called when users rename a notebook document
	move(group: GroupIdentifier, target: URI): IMoveResult | undefined {
		if (this._modelReference) {
			const contributedNotebookProviders = this.notebookService.getContributedNotebookProviders(target);

			if (contributedNotebookProviders.find(provider => provider.id === this._modelReference!.object.viewType)) {
				return this._move(group, target);
			}
		}
		return undefined;
	}

	private _move(_group: GroupIdentifier, newResource: URI): { editor: IEditorInput } | undefined {
		const editorInput = NotebookEditorInput.create(this.instantiationService, newResource, basename(newResource), this.viewType);
		return { editor: editorInput };
	}

	async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		if (this._modelReference) {
			await this._modelReference.object.revert(options);
		}
	}

	async resolve(editorId?: string): Promise<INotebookEditorModel | null> {

		if (!this._modelReference) {

			if (!await this.notebookService.canResolve(this.viewType!)) {
				return null;
			}

			this._modelReference = await this.notebookModelService.resolve(this.resource, this.viewType!, editorId);

			this._register(this._modelReference.object.onDidChangeDirty(() => {
				this._onDidChangeDirty.fire();
			}));

			if (this._modelReference.object.isDirty()) {
				this._onDidChangeDirty.fire();
			}
		}
		return this._modelReference.object;
	}

	matches(otherInput: unknown): boolean {
		if (this === otherInput) {
			return true;
		}
		return otherInput instanceof NotebookEditorInput
			&& this.viewType === otherInput.viewType
			&& isEqual(this.resource, otherInput.resource);
	}

	// close(group: GroupIdentifier, openedInOtherGroups: boolean): void {
	// 	super.close(group, openedInOtherGroups);
	// }

	dispose() {
		if (this._modelReference) {
			this._modelReference.dispose();
			this._modelReference = undefined;
		}
		super.dispose();
	}
}
