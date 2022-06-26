/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { ConfirmResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorIdentifier, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { autorun } from 'vs/workbench/contrib/audioCues/browser/observable';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageSupport, ITextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

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

	private _model?: MergeEditorModel;
	private _outTextModel?: ITextFileEditorModel;
	private _ignoreUnhandledConflictsForDirtyState?: true;

	constructor(
		public readonly base: URI,
		public readonly input1: MergeEditorInputData,
		public readonly input2: MergeEditorInputData,
		public readonly result: URI,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService editorService: IEditorService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService
	) {
		super(result, undefined, editorService, textFileService, labelService, fileService);

		const modelListener = new DisposableStore();
		const handleDidCreate = (model: ITextFileEditorModel) => {
			// TODO@jrieken copied from fileEditorInput.ts
			if (isEqual(result, model.resource)) {
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

	override async resolve(): Promise<MergeEditorModel> {

		if (!this._model) {

			const base = await this._textModelService.createModelReference(this.base);
			const input1 = await this._textModelService.createModelReference(this.input1.uri);
			const input2 = await this._textModelService.createModelReference(this.input2.uri);
			const result = await this._textModelService.createModelReference(this.result);

			this._model = this._instaService.createInstance(
				MergeEditorModel,
				base.object.textEditorModel,
				input1.object.textEditorModel,
				this.input1.title,
				this.input1.detail,
				this.input1.description,
				input2.object.textEditorModel,
				this.input2.title,
				this.input2.detail,
				this.input2.description,
				result.object.textEditorModel
			);

			await this._model.onInitialized;

			this._store.add(this._model);
			this._store.add(base);
			this._store.add(input1);
			this._store.add(input2);
			this._store.add(result);

			this._store.add(autorun(reader => {
				this._model?.hasUnhandledConflicts.read(reader);
				this._onDidChangeDirty.fire(undefined);
			}, 'drive::onDidChangeDirty'));
		}

		this._ignoreUnhandledConflictsForDirtyState = undefined;
		return this._model;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (!(otherInput instanceof MergeEditorInput)) {
			return false;
		}
		return isEqual(this.base, otherInput.base)
			&& isEqual(this.input1.uri, otherInput.input1.uri)
			&& isEqual(this.input2.uri, otherInput.input2.uri)
			&& isEqual(this.result, otherInput.result);
	}

	// ---- FileEditorInput

	override isDirty(): boolean {
		const textModelDirty = Boolean(this._outTextModel?.isDirty());
		if (textModelDirty) {
			// text model dirty -> 3wm is dirty
			return true;
		}
		if (!this._ignoreUnhandledConflictsForDirtyState) {
			// unhandled conflicts -> 3wm is dirty UNLESS we explicitly set this input
			// to ignore unhandled conflicts for the dirty-state. This happens only
			// after confirming to ignore unhandled changes
			return Boolean(this._model && this._model.hasUnhandledConflicts.get());
		}
		return false;
	}

	override async confirm(editors?: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult> {

		const inputs: MergeEditorInput[] = [this];
		if (editors) {
			for (const { editor } of editors) {
				if (editor instanceof MergeEditorInput) {
					inputs.push(editor);
				}
			}
		}

		const inputsWithUnhandledConflicts = inputs
			.filter(input => input._model && input._model.hasUnhandledConflicts.get());

		if (inputsWithUnhandledConflicts.length === 0) {
			return ConfirmResult.SAVE;
		}

		const { choice } = await this._dialogService.show(
			Severity.Info,
			localize('unhandledConflicts.msg', 'Do you want to continue with unhandled conflicts?'),
			[
				localize('unhandledConflicts.ignore', "Continue with Conflicts"),
				localize('unhandledConflicts.cancel', "Cancel")
			],
			{
				cancelId: 1,
				detail: inputsWithUnhandledConflicts.length > 1
					? localize('unhandledConflicts.detailN', 'Merge conflicts in {0} editors will remain unhandled.', inputsWithUnhandledConflicts.length)
					: localize('unhandledConflicts.detail1', 'Merge conflicts in this editor will remain unhandled.')
			}
		);

		if (choice !== 0) {
			return ConfirmResult.CANCEL;
		}

		// continue with conflicts, tell inputs to ignore unhandled changes
		for (const input of inputsWithUnhandledConflicts) {
			input._ignoreUnhandledConflictsForDirtyState = true;
		}
		return ConfirmResult.SAVE;
	}

	setLanguageId(languageId: string, _setExplicitly?: boolean): void {
		this._model?.setLanguageId(languageId);
	}

	// implement get/set languageId
	// implement get/set encoding
}
