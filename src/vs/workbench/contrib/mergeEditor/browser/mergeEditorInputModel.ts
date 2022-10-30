/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn } from 'vs/base/common/assert';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { derived, IObservable, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { basename, isEqual } from 'vs/base/common/resources';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { WorkerBasedDocumentDiffProvider } from 'vs/editor/browser/widget/workerBasedDocumentDiffProvider';
import { IModelService } from 'vs/editor/common/services/model';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { ConfirmResult, IDialogOptions, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRevertOptions, SaveSourceRegistry } from 'vs/workbench/common/editor';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { conflictMarkers } from 'vs/workbench/contrib/mergeEditor/browser/mergeMarkers/mergeMarkersController';
import { MergeDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { InputData, MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { MergeEditorTelemetry } from 'vs/workbench/contrib/mergeEditor/browser/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileEditorModel, ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export interface MergeEditorArgs {
	base: URI;
	input1: MergeEditorInputData;
	input2: MergeEditorInputData;
	result: URI;
}

export interface IMergeEditorInputModelFactory {
	createInputModel(args: MergeEditorArgs): Promise<IMergeEditorInputModel>;
}

export interface IMergeEditorInputModel extends IDisposable, IEditorModel {
	readonly resultUri: URI;

	readonly model: MergeEditorModel;
	readonly isDirty: IObservable<boolean>;

	save(options?: ITextFileSaveOptions): Promise<void>;

	/**
	 * If save resets the dirty state, revert must do so too.
	*/
	revert(options?: IRevertOptions): Promise<void>;

	shouldConfirmClose(): boolean;

	confirmClose(inputModels: IMergeEditorInputModel[]): Promise<ConfirmResult>;

	/**
	 * Marks the merge as done. The merge editor must be closed afterwards.
	*/
	accept(): Promise<void>;
}

/* ================ Temp File ================ */

export class TempFileMergeEditorModeFactory implements IMergeEditorInputModelFactory {
	constructor(
		private readonly _mergeEditorTelemetry: MergeEditorTelemetry,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
	) {
	}

	async createInputModel(args: MergeEditorArgs): Promise<IMergeEditorInputModel> {
		const store = new DisposableStore();

		const [
			base,
			result,
			input1Data,
			input2Data,
		] = await Promise.all([
			this._textModelService.createModelReference(args.base),
			this._textModelService.createModelReference(args.result),
			toInputData(args.input1, this._textModelService, store),
			toInputData(args.input2, this._textModelService, store),
		]);

		store.add(base);
		store.add(result);

		const tempResultUri = result.object.textEditorModel.uri.with({ scheme: 'merge-result' });

		const temporaryResultModel = this._modelService.createModel(
			'',
			{
				languageId: result.object.textEditorModel.getLanguageId(),
				onDidChange: Event.None,
			},
			tempResultUri,
		);
		store.add(temporaryResultModel);

		const diffProvider = this._instantiationService.createInstance(WorkerBasedDocumentDiffProvider);
		const model = this._instantiationService.createInstance(
			MergeEditorModel,
			base.object.textEditorModel,
			input1Data,
			input2Data,
			temporaryResultModel,
			this._instantiationService.createInstance(MergeDiffComputer, diffProvider),
			this._instantiationService.createInstance(MergeDiffComputer, diffProvider),
			{
				resetResult: true,
			},
			this._mergeEditorTelemetry,
		);
		store.add(model);

		await model.onInitialized;

		return this._instantiationService.createInstance(TempFileMergeEditorInputModel, model, store, result.object, args.result);
	}
}

class TempFileMergeEditorInputModel extends EditorModel implements IMergeEditorInputModel {
	private readonly savedAltVersionId = observableValue('initialAltVersionId', this.model.resultTextModel.getAlternativeVersionId());
	private readonly altVersionId = observableFromEvent(
		e => this.model.resultTextModel.onDidChangeContent(e),
		() =>
			/** @description getAlternativeVersionId */ this.model.resultTextModel.getAlternativeVersionId()
	);

	public readonly isDirty = derived(
		'isDirty',
		(reader) => this.altVersionId.read(reader) !== this.savedAltVersionId.read(reader)
	);

	private finished = false;

	constructor(
		public readonly model: MergeEditorModel,
		private readonly disposable: IDisposable,
		private readonly result: IResolvedTextEditorModel,
		public readonly resultUri: URI,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	override dispose(): void {
		this.disposable.dispose();
		super.dispose();
	}

	async accept(): Promise<void> {
		const value = await this.model.resultTextModel.getValue();
		this.result.textEditorModel.setValue(value);
		this.savedAltVersionId.set(this.model.resultTextModel.getAlternativeVersionId(), undefined);
		await this.textFileService.save(this.result.textEditorModel.uri);
		this.finished = true;
	}

	private async _discard(): Promise<void> {
		await this.textFileService.revert(this.model.resultTextModel.uri);
		this.savedAltVersionId.set(this.model.resultTextModel.getAlternativeVersionId(), undefined);
		this.finished = true;
	}

	public shouldConfirmClose(): boolean {
		return true;
	}

	public async confirmClose(inputModels: TempFileMergeEditorInputModel[]): Promise<ConfirmResult> {
		assertFn(
			() => inputModels.some((m) => m === this)
		);

		const someDirty = inputModels.some((m) => m.isDirty.get());
		let choice: number;
		if (someDirty) {
			const isMany = inputModels.length > 1;

			const message = isMany
				? localize('messageN', 'Do you want keep the merge result of {0} files?', inputModels.length)
				: localize('message1', 'Do you want keep the merge result of {0}?', basename(inputModels[0].model.resultTextModel.uri));

			const hasUnhandledConflicts = inputModels.some((m) => m.model.hasUnhandledConflicts.get());

			const options: IDialogOptions = {
				cancelId: 2,
				detail:
					hasUnhandledConflicts
						? isMany
							? localize('detailNConflicts', "The files contain unhandled conflicts. The merge results will be lost if you don't save them.")
							: localize('detail1Conflicts', "The file contains unhandled conflicts. The merge result will be lost if you don't save it.")
						: isMany
							? localize('detailN', "The merge results will be lost if you don't save them.")
							: localize('detail1', "The merge result will be lost if you don't save it.")
			};

			const actions: string[] = [
				hasUnhandledConflicts ? localize('saveWithConflict', "Save With Conflicts") : localize('save', "Save"),
				localize('discard', "Don't Save"),
				localize('cancel', "Cancel"),
			];

			choice = (await this.dialogService.show(Severity.Info, message, actions, options)).choice;
		} else {
			choice = 1;
		}

		if (choice === 2) {
			// cancel: stay in editor
			return ConfirmResult.CANCEL;
		} else if (choice === 0) {
			// save with conflicts
			await Promise.all(inputModels.map(m => m.accept()));
			return ConfirmResult.SAVE; // Save is a no-op anyway
		} else {
			// discard changes
			await Promise.all(inputModels.map(m => m._discard()));
			return ConfirmResult.DONT_SAVE; // Revert is a no-op
		}
	}

	public async save(options?: ITextFileSaveOptions): Promise<void> {
		if (this.finished) {
			return;
		}
		// It does not make sense to save anything in the temp file mode.
		// The file stays dirty from the first edit on.

		(async () => {
			const result = await this.dialogService.show(
				Severity.Info,
				localize(
					'saveTempFile',
					"Do you want to accept the merge result? This will write the merge result to the original file and close the merge editor."
				),
				[
					localize('acceptMerge', 'Accept Merge'),
					localize('cancel', "Cancel"),
				],
				{ cancelId: 1 }
			);

			if (result.choice === 0) {
				await this.accept();
				const editors = this.editorService.findEditors(this.resultUri).filter(e => e.editor.typeId === 'mergeEditor.Input');
				await this.editorService.closeEditors(editors);
			}
		})();
	}

	public async revert(options?: IRevertOptions): Promise<void> {
		// no op
	}
}

/* ================ Workspace ================ */

export class WorkspaceMergeEditorModeFactory implements IMergeEditorInputModelFactory {
	constructor(
		private readonly _mergeEditorTelemetry: MergeEditorTelemetry,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
	) {
	}

	private static readonly FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource('merge-editor.source', localize('merge-editor.source', "Before Resolving Conflicts In Merge Editor"));

	public async createInputModel(args: MergeEditorArgs): Promise<IMergeEditorInputModel> {
		const store = new DisposableStore();

		let resultTextFileModel = undefined as ITextFileEditorModel | undefined;
		const modelListener = store.add(new DisposableStore());
		const handleDidCreate = (model: ITextFileEditorModel) => {
			if (isEqual(args.result, model.resource)) {
				modelListener.clear();
				resultTextFileModel = model;
			}
		};
		modelListener.add(this.textFileService.files.onDidCreate(handleDidCreate));
		this.textFileService.files.models.forEach(handleDidCreate);

		const [
			base,
			result,
			input1Data,
			input2Data,
		] = await Promise.all([
			this._textModelService.createModelReference(args.base),
			this._textModelService.createModelReference(args.result),
			toInputData(args.input1, this._textModelService, store),
			toInputData(args.input2, this._textModelService, store),
		]);

		store.add(base);
		store.add(result);

		if (!resultTextFileModel) {
			throw new BugIndicatingError();
		}
		// So that "Don't save" does revert the file
		await resultTextFileModel.save({ source: WorkspaceMergeEditorModeFactory.FILE_SAVED_SOURCE });

		const lines = resultTextFileModel.textEditorModel!.getLinesContent();
		const hasConflictMarkers = lines.some(l => l.startsWith(conflictMarkers.start));
		const resetResult = hasConflictMarkers;

		const diffProvider = this._instantiationService.createInstance(WorkerBasedDocumentDiffProvider);
		const model = this._instantiationService.createInstance(
			MergeEditorModel,
			base.object.textEditorModel,
			input1Data,
			input2Data,
			result.object.textEditorModel,
			this._instantiationService.createInstance(MergeDiffComputer, diffProvider),
			this._instantiationService.createInstance(MergeDiffComputer, diffProvider),
			{
				resetResult
			},
			this._mergeEditorTelemetry,
		);
		store.add(model);

		await model.onInitialized;

		return this._instantiationService.createInstance(WorkspaceMergeEditorInputModel, model, store, resultTextFileModel, this._mergeEditorTelemetry);
	}
}

class WorkspaceMergeEditorInputModel extends EditorModel implements IMergeEditorInputModel {
	public readonly isDirty = observableFromEvent(
		Event.any(this.resultTextFileModel.onDidChangeDirty, this.resultTextFileModel.onDidSaveError),
		() => /** @description isDirty */ this.resultTextFileModel.isDirty()
	);

	private reported = false;
	private readonly dateTimeOpened = new Date();

	constructor(
		public readonly model: MergeEditorModel,
		private readonly disposableStore: DisposableStore,
		private readonly resultTextFileModel: ITextFileEditorModel,
		private readonly telemetry: MergeEditorTelemetry,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();
	}

	public override dispose(): void {
		this.disposableStore.dispose();
		super.dispose();

		this.reportClose(false);
	}

	private reportClose(accepted: boolean): void {
		if (!this.reported) {
			const remainingConflictCount = this.model.unhandledConflictsCount.get();
			const durationOpenedMs = new Date().getTime() - this.dateTimeOpened.getTime();
			this.telemetry.reportMergeEditorClosed({
				durationOpenedSecs: durationOpenedMs / 1000,
				remainingConflictCount,
				accepted,

				conflictCount: this.model.conflictCount,
				combinableConflictCount: this.model.combinableConflictCount,

				conflictsResolvedWithBase: this.model.conflictsResolvedWithBase,
				conflictsResolvedWithInput1: this.model.conflictsResolvedWithInput1,
				conflictsResolvedWithInput2: this.model.conflictsResolvedWithInput2,
				conflictsResolvedWithSmartCombination: this.model.conflictsResolvedWithSmartCombination,

				manuallySolvedConflictCountThatEqualNone: this.model.manuallySolvedConflictCountThatEqualNone,
				manuallySolvedConflictCountThatEqualSmartCombine: this.model.manuallySolvedConflictCountThatEqualSmartCombine,
				manuallySolvedConflictCountThatEqualInput1: this.model.manuallySolvedConflictCountThatEqualInput1,
				manuallySolvedConflictCountThatEqualInput2: this.model.manuallySolvedConflictCountThatEqualInput2,

				manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBase,
				manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1,
				manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2,
				manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart,
				manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart,
			});
			this.reported = true;
		}
	}

	public async accept(): Promise<void> {
		this.reportClose(true);
		await this.resultTextFileModel.save();
	}

	get resultUri(): URI {
		return this.resultTextFileModel.resource;
	}

	async save(options?: ITextFileSaveOptions): Promise<void> {
		await this.resultTextFileModel.save(options);
	}

	/**
	 * If save resets the dirty state, revert must do so too.
	*/
	async revert(options?: IRevertOptions): Promise<void> {
		await this.resultTextFileModel.revert(options);
	}

	shouldConfirmClose(): boolean {
		// Always confirm
		return true;
	}

	async confirmClose(inputModels: IMergeEditorInputModel[]): Promise<ConfirmResult> {
		const isMany = inputModels.length > 1;
		const someDirty = inputModels.some(m => m.isDirty.get());
		const someUnhandledConflicts = inputModels.some(m => m.model.hasUnhandledConflicts.get());
		if (someDirty) {
			const message = isMany
				? localize('workspace.messageN', 'Do you want to save the changes you made to {0} files?', inputModels.length)
				: localize('workspace.message1', 'Do you want to save the changes you made to {0}?', basename(inputModels[0].resultUri));
			const options: IDialogOptions = {
				detail:
					someUnhandledConflicts ?
						isMany
							? localize('workspace.detailN.unhandled', "The files contain unhandled conflicts. Your changes will be lost if you don't save them.")
							: localize('workspace.detail1.unhandled', "The file contains unhandled conflicts. Your changes will be lost if you don't save them.")
						: isMany
							? localize('workspace.detailN.handled', "Your changes will be lost if you don't save them.")
							: localize('workspace.detail1.handled', "Your changes will be lost if you don't save them.")
			};
			const actions: [string, ConfirmResult][] = [
				[
					someUnhandledConflicts
						? localize('workspace.saveWithConflict', 'Save with Conflicts')
						: localize('workspace.save', 'Save'),
					ConfirmResult.SAVE,
				],
				[localize('workspace.doNotSave', "Don't Save"), ConfirmResult.DONT_SAVE],
				[localize('workspace.cancel', 'Cancel'), ConfirmResult.CANCEL],
			];

			const { choice } = await this._dialogService.show(Severity.Info, message, actions.map(a => a[0]), { ...options, cancelId: actions.length - 1 });
			return actions[choice][1];

		} else if (someUnhandledConflicts) {
			const message = isMany
				? localize('workspace.messageN.nonDirty', 'Do you want to close {0} merge editors?', inputModels.length)
				: localize('workspace.message1.nonDirty', 'Do you want to close the merge editor for {0}?', basename(inputModels[0].resultUri));
			const options: IDialogOptions = {
				detail:
					someUnhandledConflicts ?
						isMany
							? localize('workspace.detailN.unhandled.nonDirty', "The files contain unhandled conflicts.")
							: localize('workspace.detail1.unhandled.nonDirty', "The file contains unhandled conflicts.")
						: undefined
			};
			const actions: [string, ConfirmResult][] = [
				[
					someUnhandledConflicts
						? localize('workspace.closeWithConflicts', 'Close with Conflicts')
						: localize('workspace.close', 'Close'),
					ConfirmResult.SAVE,
				],
				[localize('workspace.cancel', 'Cancel'), ConfirmResult.CANCEL],
			];

			const { choice } = await this._dialogService.show(Severity.Info, message, actions.map(a => a[0]), { ...options, cancelId: actions.length - 1 });
			return actions[choice][1];
		} else {
			// This shouldn't do anything
			return ConfirmResult.SAVE;
		}
	}
}

/* ================= Utils ================== */

async function toInputData(data: MergeEditorInputData, textModelService: ITextModelService, store: DisposableStore): Promise<InputData> {
	const ref = await textModelService.createModelReference(data.uri);
	store.add(ref);
	return {
		textModel: ref.object.textEditorModel,
		title: data.title,
		description: data.description,
		detail: data.detail,
	};
}
