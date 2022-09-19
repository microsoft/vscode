/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { basename, isEqual } from 'vs/base/common/resources';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { ConfirmResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, IEditorIdentifier, IResourceMergeEditorInput, isResourceMergeEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput, IEditorCloseHandler } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { MergeDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { InputData, MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageSupport, ITextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { autorun } from 'vs/base/common/observable';
import { WorkerBasedDocumentDiffProvider } from 'vs/editor/browser/widget/workerBasedDocumentDiffProvider';
import { ProjectedDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/projectedDocumentDiffProvider';

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

	override get editorId(): string {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.MultipleEditors;
	}

	override getName(): string {
		return localize('name', "Merging: {0}", super.getName());
	}

	override async resolve(): Promise<MergeEditorModel> {
		if (!this._model) {
			const toInputData = async (data: MergeEditorInputData): Promise<InputData> => {
				const ref = await this._textModelService.createModelReference(data.uri);
				this._store.add(ref);
				return {
					textModel: ref.object.textEditorModel,
					title: data.title,
					description: data.description,
					detail: data.detail,
				};
			};

			const [
				base,
				result,
				input1Data,
				input2Data,
			] = await Promise.all([
				this._textModelService.createModelReference(this.base),
				this._textModelService.createModelReference(this.result),
				toInputData(this.input1),
				toInputData(this.input2),
			]);

			this._store.add(base);
			this._store.add(result);

			const diffProvider = this._instaService.createInstance(WorkerBasedDocumentDiffProvider);
			this._model = this._instaService.createInstance(
				MergeEditorModel,
				base.object.textEditorModel,
				input1Data,
				input2Data,
				result.object.textEditorModel,
				this._instaService.createInstance(MergeDiffComputer, diffProvider),
				this._instaService.createInstance(MergeDiffComputer, this._instaService.createInstance(ProjectedDiffComputer, diffProvider)),
				{
					resetUnknownOnInitialization: false
				},
			);
			this._store.add(this._model);

			// set/unset the closeHandler whenever unhandled conflicts are detected
			const closeHandler = this._instaService.createInstance(MergeEditorCloseHandler, this._model);
			this._store.add(autorun('closeHandler', reader => {
				const value = this._model!.hasUnhandledConflicts.read(reader);
				this.closeHandler = value ? closeHandler : undefined;
			}));

			await this._model.onInitialized;

		}

		return this._model;
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

	// ---- FileEditorInput

	override isDirty(): boolean {
		return Boolean(this._outTextModel?.isDirty());
	}

	setLanguageId(languageId: string, source?: string): void {
		this._model?.setLanguageId(languageId, source);
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

	async confirm(editors: readonly IEditorIdentifier[]): Promise<ConfirmResult> {

		const handler: MergeEditorCloseHandler[] = [];
		let someAreDirty = false;

		for (const { editor } of editors) {
			if (editor.closeHandler instanceof MergeEditorCloseHandler && editor.closeHandler._model.hasUnhandledConflicts.get()) {
				handler.push(editor.closeHandler);
				someAreDirty = someAreDirty || editor.isDirty();
			}
		}

		if (handler.length === 0) {
			// shouldn't happen
			return ConfirmResult.SAVE;
		}

		const result = someAreDirty
			? await this._confirmDirty(handler)
			: await this._confirmNoneDirty(handler);

		if (result !== ConfirmResult.CANCEL) {
			// save or ignore: in both cases we tell the inputs to ignore unhandled conflicts
			// for the dirty state computation.
			for (const input of handler) {
				input._ignoreUnhandledConflicts = true;
			}
		}

		return result;
	}

	private async _confirmDirty(handler: MergeEditorCloseHandler[]): Promise<ConfirmResult> {
		const isMany = handler.length > 1;

		const message = isMany
			? localize('messageN', 'Do you want to save the changes you made to {0} files?', handler.length)
			: localize('message1', 'Do you want to save the changes you made to {0}?', basename(handler[0]._model.resultTextModel.uri));

		const options = {
			cancelId: 2,
			detail: isMany
				? localize('detailN', "The files contain unhandled conflicts. Your changes will be lost if you don't save them.")
				: localize('detail1', "The file contains unhandled conflicts. Your changes will be lost if you don't save them.")
		};

		const actions: string[] = [
			localize('saveWithConflict', "Save with Conflicts"),
			localize('discard', "Don't Save"),
			localize('cancel', "Cancel"),
		];

		const { choice } = await this._dialogService.show(Severity.Info, message, actions, options);

		if (choice === options.cancelId) {
			// cancel: stay in editor
			return ConfirmResult.CANCEL;
		} else if (choice === 0) {
			// save with conflicts
			return ConfirmResult.SAVE;
		} else {
			// discard changes
			return ConfirmResult.DONT_SAVE;
		}
	}

	private async _confirmNoneDirty(handler: MergeEditorCloseHandler[]): Promise<ConfirmResult> {
		const isMany = handler.length > 1;

		const message = isMany
			? localize('conflictN', 'Do you want to close with conflicts in {0} files?', handler.length)
			: localize('conflict1', 'Do you want to close with conflicts in {0}?', basename(handler[0]._model.resultTextModel.uri));

		const options = {
			cancelId: 1,
			detail: isMany
				? localize('detailNotDirtyN', "The files contain unhandled conflicts.")
				: localize('detailNotDirty1', "The file contains unhandled conflicts.")
		};

		const actions = [
			localize('closeWithConflicts', "Close with Conflicts"),
			localize('cancel', "Cancel"),
		];

		const { choice } = await this._dialogService.show(Severity.Info, message, actions, options);
		if (choice === options.cancelId) {
			return ConfirmResult.CANCEL;
		} else {
			return ConfirmResult.SAVE;
		}
	}
}
