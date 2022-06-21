/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { FileSystemProviderCapabilities, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IUntypedEditorInput, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export interface MergeEditorInputJSON {
	anchestor: URI;
	inputOne: { uri: URI; detail?: string; description?: string };
	inputTwo: { uri: URI; detail?: string; description?: string };
	result: URI;
}

export class MergeEditorInputData {
	constructor(
		readonly uri: URI,
		readonly detail: string | undefined,
		readonly description: string | undefined,
	) { }
}

export class MergeEditorInput extends AbstractTextResourceEditorInput {

	static readonly ID = 'mergeEditor.Input';

	private _model?: MergeEditorModel;
	private _outTextModel?: ITextFileEditorModel;

	constructor(
		private readonly _base: URI,
		private readonly _input1: MergeEditorInputData,
		private readonly _input2: MergeEditorInputData,
		private readonly _result: URI,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorService editorService: IEditorService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService
	) {
		super(_result, undefined, editorService, textFileService, labelService, fileService);

		const modelListener = new DisposableStore();
		const handleDidCreate = (model: ITextFileEditorModel) => {
			// TODO@jrieken copied from fileEditorInput.ts
			if (isEqual(_result, model.resource)) {
				modelListener.clear();
				this._outTextModel = model;
				modelListener.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
				modelListener.add(model.onDidSaveError(() => this._onDidChangeDirty.fire()));

				modelListener.add(model.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));

				modelListener.add(model.onWillDispose(() => {
					this._outTextModel = undefined;
					modelListener.clear();
				}));
			}
		};
		textFileService.files.onDidCreate(handleDidCreate, this, modelListener);
		textFileService.files.models.forEach(handleDidCreate);
		this._store.add(modelListener);
	}

	override dispose(): void {
		super.dispose();
	}

	get typeId(): string {
		return MergeEditorInput.ID;
	}

	override getName(): string {
		return localize('name', "Merging: {0}", super.getName());
	}

	override get capabilities(): EditorInputCapabilities {
		let result = EditorInputCapabilities.Singleton;
		if (!this.fileService.hasProvider(this._result) || this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly)) {
			result |= EditorInputCapabilities.Readonly;
		}
		return result;
	}

	override async resolve(): Promise<MergeEditorModel> {

		if (!this._model) {

			const base = await this._textModelService.createModelReference(this._base);
			const input1 = await this._textModelService.createModelReference(this._input1.uri);
			const input2 = await this._textModelService.createModelReference(this._input2.uri);
			const result = await this._textModelService.createModelReference(this._result);

			this._model = this._instaService.createInstance(
				MergeEditorModel,
				base.object.textEditorModel,
				input1.object.textEditorModel,
				this._input1.detail,
				this._input1.description,
				input2.object.textEditorModel,
				this._input2.detail,
				this._input2.description,
				result.object.textEditorModel
			);

			await this._model.onInitialized;

			this._store.add(this._model);
			this._store.add(base);
			this._store.add(input1);
			this._store.add(input2);
			this._store.add(result);
		}
		return this._model;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (!(otherInput instanceof MergeEditorInput)) {
			return false;
		}
		return isEqual(this._base, otherInput._base)
			&& isEqual(this._input1.uri, otherInput._input1.uri)
			&& isEqual(this._input2.uri, otherInput._input2.uri)
			&& isEqual(this._result, otherInput._result);
	}

	toJSON(): MergeEditorInputJSON {
		return {
			anchestor: this._base,
			inputOne: this._input1,
			inputTwo: this._input2,
			result: this._result,
		};
	}

	// ---- FileEditorInput

	override isDirty(): boolean {
		return Boolean(this._outTextModel?.isDirty());
	}


	// implement get/set languageId
	// implement get/set encoding
}
