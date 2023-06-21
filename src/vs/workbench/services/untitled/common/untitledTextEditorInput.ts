/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { DEFAULT_EDITOR_ASSOCIATION, findViewStateForEditor, GroupIdentifier, isUntitledResourceEditorInput, IUntitledTextResourceEditorInput, IUntypedEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { EncodingMode, IEncodingSupport, ILanguageSupport, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService } from 'vs/platform/files/common/files';
import { isEqual, toLocalResource } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledTextEditorInput extends AbstractTextResourceEditorInput implements IEncodingSupport, ILanguageSupport {

	static readonly ID: string = 'workbench.editors.untitledEditorInput';

	override get typeId(): string {
		return UntitledTextEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	private modelResolve: Promise<void> | undefined = undefined;

	constructor(
		readonly model: IUntitledTextEditorModel,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(model.resource, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService);

		this.registerModelListeners(model);
	}

	private registerModelListeners(model: IUntitledTextEditorModel): void {

		// re-emit some events from the model
		this._register(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(model.onDidChangeName(() => this._onDidChangeLabel.fire()));

		// a reverted untitled text editor model renders this input disposed
		this._register(model.onDidRevert(() => this.dispose()));
	}

	override getName(): string {
		return this.model.name;
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {

		// Without associated path: only use if name and description differ
		if (!this.model.hasAssociatedFilePath) {
			const descriptionCandidate = this.resource.path;
			if (descriptionCandidate !== this.getName()) {
				return descriptionCandidate;
			}

			return undefined;
		}

		// With associated path: delegate to parent
		return super.getDescription(verbosity);
	}

	override getTitle(verbosity: Verbosity): string {

		// Without associated path: check if name and description differ to decide
		// if description should appear besides the name to distinguish better
		if (!this.model.hasAssociatedFilePath) {
			const name = this.getName();
			const description = this.getDescription();
			if (description && description !== name) {
				return `${name} • ${description}`;
			}

			return name;
		}

		// With associated path: delegate to parent
		return super.getTitle(verbosity);
	}

	override isDirty(): boolean {
		return this.model.isDirty();
	}

	getEncoding(): string | undefined {
		return this.model.getEncoding();
	}

	setEncoding(encoding: string, mode: EncodingMode /* ignored, we only have Encode */): Promise<void> {
		return this.model.setEncoding(encoding);
	}

	setLanguageId(languageId: string, source?: string): void {
		this.model.setLanguageId(languageId, source);
	}

	getLanguageId(): string | undefined {
		return this.model.getLanguageId();
	}

	override async resolve(): Promise<IUntitledTextEditorModel> {
		if (!this.modelResolve) {
			this.modelResolve = this.model.resolve();
		}

		await this.modelResolve;

		return this.model;
	}

	override toUntyped(options?: { preserveViewState: GroupIdentifier }): IUntitledTextResourceEditorInput {
		const untypedInput: IUntitledTextResourceEditorInput & { resource: URI | undefined; options: ITextEditorOptions } = {
			resource: this.model.hasAssociatedFilePath ? toLocalResource(this.model.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme) : this.resource,
			forceUntitled: true,
			options: {
				override: this.editorId
			}
		};

		if (typeof options?.preserveViewState === 'number') {
			untypedInput.encoding = this.getEncoding();
			untypedInput.languageId = this.getLanguageId();
			untypedInput.contents = this.model.isModified() ? this.model.textEditorModel?.getValue() : undefined;
			untypedInput.options.viewState = findViewStateForEditor(this, options.preserveViewState, this.editorService);

			if (typeof untypedInput.contents === 'string' && !this.model.hasAssociatedFilePath) {
				// Given how generic untitled resources in the system are, we
				// need to be careful not to set our resource into the untyped
				// editor if we want to transport contents too, because of
				// issue https://github.com/microsoft/vscode/issues/140898
				// The workaround is to simply remove the resource association
				// if we have contents and no associated resource.
				// In that case we can ensure that a new untitled resource is
				// being created and the contents can be restored properly.
				untypedInput.resource = undefined;
			}
		}

		return untypedInput;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof UntitledTextEditorInput) {
			return isEqual(otherInput.resource, this.resource);
		}

		if (isUntitledResourceEditorInput(otherInput)) {
			return super.matches(otherInput);
		}

		return false;
	}

	override dispose(): void {
		this.modelResolve = undefined;

		super.dispose();
	}
}
