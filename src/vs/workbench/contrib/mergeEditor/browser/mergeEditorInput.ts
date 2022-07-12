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
import { EditorInput, IEditorCloseHandler } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { EditorWorkerServiceDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageSupport, ITextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { autorun } from 'vs/base/common/observable';

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

	override closeHandler: MergeEditorCloseHandler | undefined;

	constructor(
		public readonly base: URI,
		public readonly input1: MergeEditorInputData,
		public readonly input2: MergeEditorInputData,
		public readonly result: URI,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
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
				result.object.textEditorModel,
				this._instaService.createInstance(EditorWorkerServiceDiffComputer),
				{
					resetUnknownOnInitialization: true
				},
			);

			// set/unset the closeHandler whenever unhandled conflicts are detected
			const closeHandler = this._instaService.createInstance(MergeEditorCloseHandler, this._model);
			this._store.add(autorun('closeHandler', reader => {
				const value = this._model!.hasUnhandledConflicts.read(reader);
				this.closeHandler = value ? closeHandler : undefined;
			}));

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
		return isEqual(this.base, otherInput.base)
			&& isEqual(this.input1.uri, otherInput.input1.uri)
			&& isEqual(this.input2.uri, otherInput.input2.uri)
			&& isEqual(this.result, otherInput.result);
	}

	// ---- FileEditorInput

	override isDirty(): boolean {
		return Boolean(this._outTextModel?.isDirty());
	}

	setLanguageId(languageId: string, _setExplicitly?: boolean): void {
		this._model?.setLanguageId(languageId);
	}

	// implement get/set languageId
	// implement get/set encoding
}

class MergeEditorCloseHandler implements IEditorCloseHandler {

	private _ignoreUnhandledConflicts: boolean = false;

	constructor(
		private readonly _model: MergeEditorModel,
		@IDialogService private readonly _dialogService: IDialogService,
	) { }

	showConfirm(): boolean {
		// unhandled conflicts -> 3wm asks to confirm UNLESS we explicitly set this input
		// to ignore unhandled conflicts. This happens only after confirming to ignore unhandled changes
		return !this._ignoreUnhandledConflicts && this._model.hasUnhandledConflicts.get();
	}

	async confirm(editors?: readonly IEditorIdentifier[] | undefined): Promise<ConfirmResult> {

		const handler: MergeEditorCloseHandler[] = [this];
		editors?.forEach(candidate => candidate.editor.closeHandler instanceof MergeEditorCloseHandler && handler.push(candidate.editor.closeHandler));

		const inputsWithUnhandledConflicts = handler
			.filter(input => input._model && input._model.hasUnhandledConflicts.get());

		if (inputsWithUnhandledConflicts.length === 0) {
			// shouldn't happen
			return ConfirmResult.SAVE;
		}

		const actions: string[] = [
			localize('unhandledConflicts.ignore', "Continue with Conflicts"),
			localize('unhandledConflicts.discard', "Discard Merge Changes"),
			localize('unhandledConflicts.cancel', "Cancel"),
		];
		const options = {
			cancelId: 2,
			detail: handler.length > 1
				? localize('unhandledConflicts.detailN', 'Merge conflicts in {0} editors will remain unhandled.', handler.length)
				: localize('unhandledConflicts.detail1', 'Merge conflicts in this editor will remain unhandled.')
		};

		const { choice } = await this._dialogService.show(
			Severity.Info,
			localize('unhandledConflicts.msg', 'Do you want to continue with unhandled conflicts?'), // 1
			actions,
			options
		);

		if (choice === options.cancelId) {
			// cancel: stay in editor
			return ConfirmResult.CANCEL;
		}

		// save or revert: in both cases we tell the inputs to ignore unhandled conflicts
		// for the dirty state computation.
		for (const input of handler) {
			input._ignoreUnhandledConflicts = true;
		}

		if (choice === 0) {
			// conflicts: continue with remaining conflicts
			return ConfirmResult.SAVE;

		} else if (choice === 1) {
			// discard: undo all changes and save original (pre-merge) state
			for (const input of handler) {
				input._discardMergeChanges();
			}
			return ConfirmResult.SAVE;

		} else {
			// don't save
			return ConfirmResult.DONT_SAVE;
		}
	}

	private _discardMergeChanges(): void {
		const chunks: string[] = [];
		while (true) {
			const chunk = this._model.resultSnapshot.read();
			if (chunk === null) {
				break;
			}
			chunks.push(chunk);
		}
		this._model.result.setValue(chunks.join());
	}
}
