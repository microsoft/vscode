/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { DEFAULT_EDITOR_ASSOCIATION, findViewStateForEditor, isUntitledResourceEditorInput, IUntitledTextResourceEditorInput, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput, IUntypedEditorOptions } from '../../../common/editor/editorInput.js';
import { AbstractTextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { IUntitledTextEditorModel } from './untitledTextEditorModel.js';
import { EncodingMode, IEncodingSupport, ILanguageSupport, ITextFileService } from '../../textfile/common/textfiles.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isEqual, toLocalResource } from '../../../../base/common/resources.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IPathService } from '../../path/common/pathService.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { DisposableStore, dispose, IReference } from '../../../../base/common/lifecycle.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ICustomEditorLabelService } from '../../editor/common/customEditorLabelService.js';

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
	private readonly modelDisposables = this._register(new DisposableStore());
	private cachedUntitledTextEditorModelReference: IReference<IUntitledTextEditorModel> | undefined = undefined;

	constructor(
		protected model: IUntitledTextEditorModel,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService
	) {
		super(model.resource, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);

		this.registerModelListeners(model);

		this._register(this.textFileService.untitled.onDidCreate(model => this.onDidCreateUntitledModel(model)));
	}

	private registerModelListeners(model: IUntitledTextEditorModel): void {
		this.modelDisposables.clear();

		// re-emit some events from the model
		this.modelDisposables.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this.modelDisposables.add(model.onDidChangeName(() => this._onDidChangeLabel.fire()));

		// a reverted untitled text editor model renders this input disposed
		this.modelDisposables.add(model.onDidRevert(() => this.dispose()));
	}

	private onDidCreateUntitledModel(model: IUntitledTextEditorModel): void {
		if (isEqual(model.resource, this.model.resource) && model !== this.model) {

			// Ensure that we keep our model up to date with
			// the actual model from the service so that we
			// never get out of sync with the truth.

			this.model = model;
			this.registerModelListeners(model);
		}
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

	get hasLanguageSetExplicitly() { return this.model.hasLanguageSetExplicitly; }

	get hasAssociatedFilePath() { return this.model.hasAssociatedFilePath; }

	setLanguageId(languageId: string, source?: string): void {
		this.model.setLanguageId(languageId, source);
	}

	getLanguageId(): string | undefined {
		return this.model.getLanguageId();
	}

	override async resolve(): Promise<IUntitledTextEditorModel> {
		if (!this.modelResolve) {
			this.modelResolve = (async () => {

				// Acquire a model reference
				this.cachedUntitledTextEditorModelReference = await this.textModelService.createModelReference(this.resource) as IReference<IUntitledTextEditorModel>;
			})();
		}

		await this.modelResolve;

		// It is possible that this input was disposed before the model
		// finished resolving. As such, we need to make sure to dispose
		// the model reference to not leak it.
		if (this.isDisposed()) {
			this.disposeModelReference();
		}

		return this.model;
	}

	override toUntyped(options?: IUntypedEditorOptions): IUntitledTextResourceEditorInput {
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

			if (typeof untypedInput.contents === 'string' && !this.model.hasAssociatedFilePath && !options.preserveResource) {
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

		// Model
		this.modelResolve = undefined;

		// Model reference
		this.disposeModelReference();

		super.dispose();
	}

	private disposeModelReference(): void {
		dispose(this.cachedUntitledTextEditorModelReference);
		this.cachedUntitledTextEditorModelReference = undefined;
	}
}
