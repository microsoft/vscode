/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DEFAULT_EDITOR_ASSOCIATION, GroupIdentifier, IEditorInput, IRevertOptions, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { AbstractResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { URI } from 'vs/base/common/uri';
import { ITextFileService, ITextFileSaveOptions, IModeSupport } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { ITextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextResourceEditorModel } from 'vs/workbench/common/editor/textResourceEditorModel';
import { IReference } from 'vs/base/common/lifecycle';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';

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
		@IFileService fileService: IFileService
	) {
		super(resource, preferredResource, labelService, fileService);
	}

	override save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {

		// If this is neither an `untitled` resource, nor a resource
		// we can handle with the file service, we can only "Save As..."
		if (this.resource.scheme !== Schemas.untitled && !this.fileService.canHandleResource(this.resource)) {
			return this.saveAs(group, options);
		}

		// Normal save
		return this.doSave(options, false);
	}

	override saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {
		return this.doSave(options, true);
	}

	private async doSave(options: ITextFileSaveOptions | undefined, saveAs: boolean): Promise<IEditorInput | undefined> {

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

		// If this save operation results in a new editor, either
		// because it was saved to disk (e.g. from untitled) or
		// through an explicit "Save As", make sure to replace it.
		if (
			target.scheme !== this.resource.scheme ||
			(saveAs && !isEqual(target, this.preferredResource))
		) {
			return this.editorService.createEditorInput({ resource: target });
		}

		return this;
	}

	override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this.textFileService.revert(this.resource, options);
	}

	protected getViewStateFor(group: GroupIdentifier): object | undefined {
		for (const editorPane of this.editorService.visibleEditorPanes) {
			if (editorPane.group.id === group && this.matches(editorPane.input)) {
				return editorPane.getViewState?.();
			}
		}

		return undefined;
	}
}

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class TextResourceEditorInput extends AbstractTextResourceEditorInput implements IModeSupport {

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
		private preferredMode: string | undefined,
		private preferredContents: string | undefined,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService
	) {
		super(resource, undefined, editorService, textFileService, labelService, fileService);
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

	setMode(mode: string): void {
		this.setPreferredMode(mode);

		if (this.cachedModel) {
			this.cachedModel.setMode(mode);
		}
	}

	setPreferredMode(mode: string): void {
		this.preferredMode = mode;
	}

	setPreferredContents(contents: string): void {
		this.preferredContents = contents;
	}

	override async resolve(): Promise<ITextEditorModel> {

		// Unset preferred contents and mode after resolving
		// once to prevent these properties to stick. We still
		// want the user to change the language mode in the editor
		// and want to show updated contents (if any) in future
		// `resolve` calls.
		const preferredContents = this.preferredContents;
		const preferredMode = this.preferredMode;
		this.preferredContents = undefined;
		this.preferredMode = undefined;

		if (!this.modelReference) {
			this.modelReference = this.textModelResolverService.createModelReference(this.resource);
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

		// Set contents and mode if preferred
		if (typeof preferredContents === 'string' || typeof preferredMode === 'string') {
			model.updateTextEditorModel(typeof preferredContents === 'string' ? createTextBufferFactory(preferredContents) : undefined, preferredMode);
		}

		return model;
	}

	override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof TextResourceEditorInput) {
			return isEqual(otherInput.resource, this.resource);
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
