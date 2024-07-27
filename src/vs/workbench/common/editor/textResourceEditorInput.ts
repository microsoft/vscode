/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DEFAULT_EDITOR_ASSOCIATION, GroupIdentifier, IRevertOptions, isResourceEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { AbstractResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { URI } from 'vs/base/common/uri';
import { ITextFileService, ITextFileSaveOptions, ILanguageSupport } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { ITextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextResourceEditorModel } from 'vs/workbench/common/editor/textResourceEditorModel';
import { IReference } from 'vs/base/common/lifecycle';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { ICustomEditorLabelService } from 'vs/workbench/services/editor/common/customEditorLabelService';

/**
 * The base class for all editor inputs that open in text editors.
 */
export abstract class AbstractTextResourceEditorInput extends AbstractResourceEditorInput {

	constructor(
		resource: URI,
		preferredResource: URI | undefined,
		@IEditorService protected readonly editorService: IEditorService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService
	) {
		super(resource, preferredResource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
	}

	override save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IUntypedEditorInput | undefined> {

		// If this is neither an `untitled` resource, nor a resource
		// we can handle with the file service, we can only "Save As..."
		if (this.resource.scheme !== Schemas.untitled && !this.fileService.hasProvider(this.resource)) {
			return this.saveAs(group, options);
		}

		// Normal save
		return this.doSave(options, false, group);
	}

	override saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IUntypedEditorInput | undefined> {
		return this.doSave(options, true, group);
	}

	private async doSave(options: ITextFileSaveOptions | undefined, saveAs: boolean, group: GroupIdentifier | undefined): Promise<IUntypedEditorInput | undefined> {

		// Save / Save As
		let target: URI | undefined;
		if (saveAs) {
			target = await this.textFileService.saveAs(this.resource, undefined, { ...options, suggestedTarget: this.preferredResource });
		} else {
			target = await this.textFileService.save(this.resource, options);
		}

		if (!target) {
			return undefined; // save cancelled
		}

		return { resource: target };
	}

	override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this.textFileService.revert(this.resource, options);
	}
}

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class TextResourceEditorInput extends AbstractTextResourceEditorInput implements ILanguageSupport {

	static readonly ID: string = 'workbench.editors.resourceEditorInput';

	override get typeId(): string {
		return TextResourceEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	private cachedModel: TextResourceEditorModel | undefined = undefined;
	private modelReference: Promise<IReference<ITextEditorModel>> | undefined = undefined;

	constructor(
		resource: URI,
		private name: string | undefined,
		private description: string | undefined,
		private preferredLanguageId: string | undefined,
		private preferredContents: string | undefined,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService
	) {
		super(resource, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
	}

	override getName(): string {
		return this.name || super.getName();
	}

	setName(name: string): void {
		if (this.name !== name) {
			this.name = name;

			this._onDidChangeLabel.fire();
		}
	}

	override getDescription(): string | undefined {
		return this.description;
	}

	setDescription(description: string): void {
		if (this.description !== description) {
			this.description = description;

			this._onDidChangeLabel.fire();
		}
	}

	setLanguageId(languageId: string, source?: string): void {
		this.setPreferredLanguageId(languageId);

		this.cachedModel?.setLanguageId(languageId, source);
	}

	setPreferredLanguageId(languageId: string): void {
		this.preferredLanguageId = languageId;
	}

	setPreferredContents(contents: string): void {
		this.preferredContents = contents;
	}

	override async resolve(): Promise<ITextEditorModel> {

		// Unset preferred contents and language after resolving
		// once to prevent these properties to stick. We still
		// want the user to change the language in the editor
		// and want to show updated contents (if any) in future
		// `resolve` calls.
		const preferredContents = this.preferredContents;
		const preferredLanguageId = this.preferredLanguageId;
		this.preferredContents = undefined;
		this.preferredLanguageId = undefined;

		if (!this.modelReference) {
			this.modelReference = this.textModelService.createModelReference(this.resource);
		}

		const ref = await this.modelReference;

		// Ensure the resolved model is of expected type
		const model = ref.object;
		if (!(model instanceof TextResourceEditorModel)) {
			ref.dispose();
			this.modelReference = undefined;

			throw new Error(`Unexpected model for TextResourceEditorInput: ${this.resource}`);
		}

		this.cachedModel = model;

		// Set contents and language if preferred
		if (typeof preferredContents === 'string' || typeof preferredLanguageId === 'string') {
			model.updateTextEditorModel(typeof preferredContents === 'string' ? createTextBufferFactory(preferredContents) : undefined, preferredLanguageId);
		}

		return model;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof TextResourceEditorInput) {
			return isEqual(otherInput.resource, this.resource);
		}

		if (isResourceEditorInput(otherInput)) {
			return super.matches(otherInput);
		}

		return false;
	}

	override dispose(): void {
		if (this.modelReference) {
			this.modelReference.then(ref => ref.dispose());
			this.modelReference = undefined;
		}

		this.cachedModel = undefined;

		super.dispose();
	}
}
