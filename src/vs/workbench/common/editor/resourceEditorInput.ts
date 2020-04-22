/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextEditorModel, IModeSupport, TextResourceEditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends TextResourceEditorInput implements IModeSupport {

	static readonly ID: string = 'workbench.editors.resourceEditorInput';

	private cachedModel: ResourceEditorModel | undefined = undefined;
	private modelReference: Promise<IReference<ITextEditorModel>> | undefined = undefined;

	constructor(
		private name: string | undefined,
		private description: string | undefined,
		resource: URI,
		private preferredMode: string | undefined,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(resource, editorService, editorGroupService, textFileService, labelService, fileService, filesConfigurationService);
	}

	getTypeId(): string {
		return ResourceEditorInput.ID;
	}

	getName(): string {
		return this.name || super.getName();
	}

	setName(name: string): void {
		if (this.name !== name) {
			this.name = name;
			this._onDidChangeLabel.fire();
		}
	}

	getDescription(): string | undefined {
		return this.description;
	}

	setDescription(description: string): void {
		if (this.description !== description) {
			this.description = description;
			this._onDidChangeLabel.fire();
		}
	}

	setMode(mode: string): void {
		this.setPreferredMode(mode);

		if (this.cachedModel) {
			this.cachedModel.setMode(mode);
		}
	}

	setPreferredMode(mode: string): void {
		this.preferredMode = mode;
	}

	async resolve(): Promise<ITextEditorModel> {
		if (!this.modelReference) {
			this.modelReference = this.textModelResolverService.createModelReference(this.resource);
		}

		const ref = await this.modelReference;

		const model = ref.object;

		// Ensure the resolved model is of expected type
		if (!(model instanceof ResourceEditorModel)) {
			ref.dispose();
			this.modelReference = undefined;

			throw new Error(`Unexpected model for ResourcEditorInput: ${this.resource}`);
		}

		this.cachedModel = model;

		// Set mode if we have a preferred mode configured
		if (this.preferredMode) {
			model.setMode(this.preferredMode);
		}

		return model;
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		// Compare by properties
		if (otherInput instanceof ResourceEditorInput) {
			return otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	dispose(): void {
		if (this.modelReference) {
			this.modelReference.then(ref => ref.dispose());
			this.modelReference = undefined;
		}

		this.cachedModel = undefined;

		super.dispose();
	}
}
