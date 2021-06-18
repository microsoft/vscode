/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GroupIdentifier, IEditorInput, IResourceDiffEditorInput, isResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookDiffEditorModel, IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IFileService } from 'vs/platform/files/common/files';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { ILabelService } from 'vs/platform/label/common/label';
import { IResourceEditorInputType } from 'vs/workbench/services/editor/common/editorService';

class NotebookDiffEditorModel extends EditorModel implements INotebookDiffEditorModel {
	constructor(
		readonly original: IResolvedNotebookEditorModel,
		readonly modified: IResolvedNotebookEditorModel,
	) {
		super();
	}

	async load(): Promise<NotebookDiffEditorModel> {
		await this.original.load();
		await this.modified.load();

		return this;
	}

	async resolveOriginalFromDisk() {
		await this.original.load({ forceReadFromFile: true });
	}

	async resolveModifiedFromDisk() {
		await this.modified.load({ forceReadFromFile: true });
	}

	override dispose(): void {
		super.dispose();
	}
}

export class NotebookDiffEditorInput extends DiffEditorInput {
	static create(instantiationService: IInstantiationService, resource: URI, name: string | undefined, description: string | undefined, originalResource: URI, viewType: string) {
		const originalInput = NotebookEditorInput.create(instantiationService, originalResource, viewType);
		const modifiedInput = NotebookEditorInput.create(instantiationService, resource, viewType);
		return instantiationService.createInstance(NotebookDiffEditorInput, name, description, originalInput, modifiedInput, viewType);
	}

	static override readonly ID: string = 'workbench.input.diffNotebookInput';

	private _modifiedTextModel: IResolvedNotebookEditorModel | null = null;
	private _originalTextModel: IResolvedNotebookEditorModel | null = null;

	override get resource() {
		return this.modifiedInput.resource;
	}

	override get editorId() {
		return this.viewType;
	}

	constructor(
		name: string | undefined,
		description: string | undefined,
		override readonly originalInput: NotebookEditorInput,
		override readonly modifiedInput: NotebookEditorInput,
		public readonly viewType: string,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
	) {
		super(
			name,
			description,
			originalInput,
			modifiedInput,
			undefined,
			labelService,
			fileService
		);
	}

	override get typeId(): string {
		return NotebookDiffEditorInput.ID;
	}

	override async resolve(): Promise<NotebookDiffEditorModel> {

		const [originalEditorModel, modifiedEditorModel] = await Promise.all([
			this.originalInput.resolve(),
			this.modifiedInput.resolve(),
		]);

		this._originalTextModel?.dispose();
		this._modifiedTextModel?.dispose();

		// TODO@rebornix check how we restore the editor in text diff editor
		if (!modifiedEditorModel) {
			throw new Error(`Fail to resolve modified editor model for resource ${this.modifiedInput.resource} with notebookType ${this.viewType}`);
		}

		if (!originalEditorModel) {
			throw new Error(`Fail to resolve original editor model for resource ${this.originalInput.resource} with notebookType ${this.viewType}`);
		}

		this._originalTextModel = originalEditorModel;
		this._modifiedTextModel = modifiedEditorModel;
		return new NotebookDiffEditorModel(this._originalTextModel, this._modifiedTextModel);
	}

	override asResourceEditorInput(group: GroupIdentifier): IResourceDiffEditorInput {
		return {
			originalInput: { resource: this.originalInput.resource },
			modifiedInput: { resource: this.resource },
			options: {
				override: this.viewType
			}
		};
	}

	override matches(otherInput: IEditorInput | IResourceEditorInputType): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (isResourceDiffEditorInput(otherInput)) {
			return this.primary.matches(otherInput.modifiedInput) && this.secondary.matches(otherInput.originalInput) && this.editorId === otherInput.options?.override;
		}

		if (otherInput instanceof NotebookDiffEditorInput) {
			return this.viewType === otherInput.viewType
				&& isEqual(this.resource, otherInput.resource);
		}
		return false;
	}

	override dispose() {
		this._modifiedTextModel?.dispose();
		this._modifiedTextModel = null;
		this._originalTextModel?.dispose();
		this._originalTextModel = null;
		super.dispose();
	}
}
