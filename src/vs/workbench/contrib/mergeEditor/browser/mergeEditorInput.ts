/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn } from 'vs/base/common/assert';
import { autorun } from 'vs/base/common/observable';
import { isEqual } from 'vs/base/common/resources';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, IResourceMergeEditorInput, IRevertOptions, isResourceMergeEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput, IEditorCloseHandler } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { IMergeEditorInputModel, TempFileMergeEditorModeFactory, WorkspaceMergeEditorModeFactory } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInputModel';
import { MergeEditorTelemetry } from 'vs/workbench/contrib/mergeEditor/browser/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ILanguageSupport, ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class MergeEditorInputData {
	constructor(
		readonly uri: URI,
		readonly title: string | undefined,
		readonly detail: string | undefined,
		readonly description: string | undefined,
	) { }
}

export class MergeEditorInput extends AbstractTextResourceEditorInput implements ILanguageSupport {
	static readonly ID = 'mergeEditor.Input';

	private _inputModel?: IMergeEditorInputModel;

	override closeHandler: IEditorCloseHandler = {
		showConfirm: () => this._inputModel?.shouldConfirmClose() ?? false,
		confirm: async (editors) => {
			assertFn(() => editors.every(e => e.editor instanceof MergeEditorInput));
			const inputModels = editors.map(e => (e.editor as MergeEditorInput)._inputModel).filter(isDefined);
			return await this._inputModel!.confirmClose(inputModels);
		},
	};

	private get useWorkingCopy() {
		return this.configurationService.getValue('mergeEditor.useWorkingCopy') ?? false;
	}

	constructor(
		public readonly base: URI,
		public readonly input1: MergeEditorInputData,
		public readonly input2: MergeEditorInputData,
		public readonly result: URI,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(result, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService);
	}

	override dispose(): void {
		super.dispose();
	}

	override get typeId(): string {
		return MergeEditorInput.ID;
	}

	override get editorId(): string {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = super.capabilities | EditorInputCapabilities.MultipleEditors;
		if (this.useWorkingCopy) {
			capabilities |= EditorInputCapabilities.Untitled;
		}
		return capabilities;
	}

	override getName(): string {
		return localize('name', "Merging: {0}", super.getName());
	}

	private readonly mergeEditorModeFactory = this._instaService.createInstance(
		this.useWorkingCopy
			? TempFileMergeEditorModeFactory
			: WorkspaceMergeEditorModeFactory,
		this._instaService.createInstance(MergeEditorTelemetry),
	);

	override async resolve(): Promise<IMergeEditorInputModel> {
		if (!this._inputModel) {
			const inputModel = this._register(await this.mergeEditorModeFactory.createInputModel({
				base: this.base,
				input1: this.input1,
				input2: this.input2,
				result: this.result,
			}));
			this._inputModel = inputModel;

			this._register(autorun(reader => {
				/** @description fire dirty event */
				inputModel.isDirty.read(reader);
				this._onDidChangeDirty.fire();
			}));

			await this._inputModel.model.onInitialized;
		}

		return this._inputModel;
	}

	public async accept(): Promise<void> {
		await this._inputModel?.accept();
	}

	override async save(group: number, options?: ITextFileSaveOptions | undefined): Promise<IUntypedEditorInput | undefined> {
		await this._inputModel?.save(options);
		return undefined;
	}

	override toUntyped(): IResourceMergeEditorInput {
		return {
			input1: { resource: this.input1.uri, label: this.input1.title, description: this.input1.description, detail: this.input1.detail },
			input2: { resource: this.input2.uri, label: this.input2.title, description: this.input2.description, detail: this.input2.detail },
			base: { resource: this.base },
			result: { resource: this.result },
			options: {
				override: this.typeId
			}
		};
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}
		if (otherInput instanceof MergeEditorInput) {
			return isEqual(this.base, otherInput.base)
				&& isEqual(this.input1.uri, otherInput.input1.uri)
				&& isEqual(this.input2.uri, otherInput.input2.uri)
				&& isEqual(this.result, otherInput.result);
		}
		if (isResourceMergeEditorInput(otherInput)) {
			return (this.editorId === otherInput.options?.override || otherInput.options?.override === undefined)
				&& isEqual(this.base, otherInput.base.resource)
				&& isEqual(this.input1.uri, otherInput.input1.resource)
				&& isEqual(this.input2.uri, otherInput.input2.resource)
				&& isEqual(this.result, otherInput.result.resource);
		}

		return false;
	}

	override async revert(group: number, options?: IRevertOptions): Promise<void> {
		return this._inputModel?.revert(options);
	}

	// ---- FileEditorInput

	override isDirty(): boolean {
		return this._inputModel?.isDirty.get() ?? false;
	}

	setLanguageId(languageId: string, source?: string): void {
		this._inputModel?.model.setLanguageId(languageId, source);
	}

	// implement get/set encoding
}
