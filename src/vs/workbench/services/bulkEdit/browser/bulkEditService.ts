/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeSort } from 'vs/base/common/arrays';
import { dispose, IDisposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditOptions, IBulkEditResult, IBulkEditService, IBulkEditPreviewHandler } from 'vs/editor/browser/services/bulkEditService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EndOfLineSequence, IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { WorkspaceFileEdit, WorkspaceTextEdit, WorkspaceEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModelService, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, IProgressStep, Progress } from 'vs/platform/progress/common/progress';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { SingleModelEditStackElement, MultiModelEditStackElement } from 'vs/editor/common/model/editStack';

type ValidationResult = { canApply: true } | { canApply: false, reason: URI };

class ModelEditTask implements IDisposable {

	public readonly model: ITextModel;

	protected _edits: IIdentifiedSingleEditOperation[];
	private _expectedModelVersionId: number | undefined;
	protected _newEol: EndOfLineSequence | undefined;

	constructor(private readonly _modelReference: IReference<IResolvedTextEditorModel>) {
		this.model = this._modelReference.object.textEditorModel;
		this._edits = [];
	}

	dispose() {
		this._modelReference.dispose();
	}

	addEdit(resourceEdit: WorkspaceTextEdit): void {
		this._expectedModelVersionId = resourceEdit.modelVersionId;
		const { edit } = resourceEdit;

		if (typeof edit.eol === 'number') {
			// honor eol-change
			this._newEol = edit.eol;
		}
		if (!edit.range && !edit.text) {
			// lacks both a range and the text
			return;
		}
		if (Range.isEmpty(edit.range) && !edit.text) {
			// no-op edit (replace empty range with empty text)
			return;
		}

		// create edit operation
		let range: Range;
		if (!edit.range) {
			range = this.model.getFullModelRange();
		} else {
			range = Range.lift(edit.range);
		}
		this._edits.push(EditOperation.replaceMove(range, edit.text));
	}

	validate(): ValidationResult {
		if (typeof this._expectedModelVersionId === 'undefined' || this.model.getVersionId() === this._expectedModelVersionId) {
			return { canApply: true };
		}
		return { canApply: false, reason: this.model.uri };
	}

	getBeforeCursorState(): Selection[] | null {
		return null;
	}

	apply(): void {
		if (this._edits.length > 0) {
			this._edits = mergeSort(this._edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			this.model.pushEditOperations(null, this._edits, () => null);
		}
		if (this._newEol !== undefined) {
			this.model.pushEOL(this._newEol);
		}
	}
}

class EditorEditTask extends ModelEditTask {

	private _editor: ICodeEditor;

	constructor(modelReference: IReference<IResolvedTextEditorModel>, editor: ICodeEditor) {
		super(modelReference);
		this._editor = editor;
	}

	getBeforeCursorState(): Selection[] | null {
		return this._editor.getSelections();
	}

	apply(): void {
		if (this._edits.length > 0) {
			this._edits = mergeSort(this._edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			this._editor.executeEdits('', this._edits);
		}
		if (this._newEol !== undefined) {
			if (this._editor.hasModel()) {
				this._editor.getModel().pushEOL(this._newEol);
			}
		}
	}
}

class BulkEditModel implements IDisposable {

	private _edits = new Map<string, WorkspaceTextEdit[]>();
	private _tasks: ModelEditTask[] | undefined;

	constructor(
		private readonly _label: string | undefined,
		private readonly _editor: ICodeEditor | undefined,
		private readonly _progress: IProgress<void>,
		edits: WorkspaceTextEdit[],
		@IEditorWorkerService private readonly _editorWorker: IEditorWorkerService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService
	) {
		edits.forEach(this._addEdit, this);
	}

	dispose(): void {
		if (this._tasks) {
			dispose(this._tasks);
		}
	}

	private _addEdit(edit: WorkspaceTextEdit): void {
		let array = this._edits.get(edit.resource.toString());
		if (!array) {
			array = [];
			this._edits.set(edit.resource.toString(), array);
		}
		array.push(edit);
	}

	async prepare(): Promise<BulkEditModel> {

		if (this._tasks) {
			throw new Error('illegal state - already prepared');
		}

		this._tasks = [];
		const promises: Promise<any>[] = [];

		this._edits.forEach((value, key) => {
			const promise = this._textModelResolverService.createModelReference(URI.parse(key)).then(async ref => {
				const model = ref.object;

				if (!model || !model.textEditorModel) {
					throw new Error(`Cannot load file ${key}`);
				}

				let task: ModelEditTask;
				let makeMinimal = false;
				if (this._editor && this._editor.hasModel() && this._editor.getModel().uri.toString() === model.textEditorModel.uri.toString()) {
					task = new EditorEditTask(ref, this._editor);
					makeMinimal = true;
				} else {
					task = new ModelEditTask(ref);
				}

				for (const edit of value) {
					if (makeMinimal) {
						const newEdits = await this._editorWorker.computeMoreMinimalEdits(edit.resource, [edit.edit]);
						if (!newEdits) {
							task.addEdit(edit);
						} else {
							for (let moreMinialEdit of newEdits) {
								task.addEdit({ ...edit, edit: moreMinialEdit });
							}
						}
					} else {
						task.addEdit(edit);
					}
				}

				this._tasks!.push(task);
				this._progress.report(undefined);
			});
			promises.push(promise);
		});

		await Promise.all(promises);

		return this;
	}

	validate(): ValidationResult {
		for (const task of this._tasks!) {
			const result = task.validate();
			if (!result.canApply) {
				return result;
			}
		}
		return { canApply: true };
	}

	apply(): void {
		const tasks = this._tasks!;

		if (tasks.length === 1) {
			// This edit touches a single model => keep things simple
			for (const task of tasks) {
				task.model.pushStackElement();
				task.apply();
				task.model.pushStackElement();
				this._progress.report(undefined);
			}
			return;
		}

		const multiModelEditStackElement = new MultiModelEditStackElement(
			this._label || localize('workspaceEdit', "Workspace Edit"),
			tasks.map(t => new SingleModelEditStackElement(t.model, t.getBeforeCursorState()))
		);
		this._undoRedoService.pushElement(multiModelEditStackElement);

		for (const task of tasks) {
			task.apply();
			this._progress.report(undefined);
		}

		multiModelEditStackElement.close();
	}
}

type Edit = WorkspaceFileEdit | WorkspaceTextEdit;

class BulkEdit {

	private readonly _label: string | undefined;
	private readonly _edits: Edit[] = [];
	private readonly _editor: ICodeEditor | undefined;
	private readonly _progress: IProgress<IProgressStep>;

	constructor(
		label: string | undefined,
		editor: ICodeEditor | undefined,
		progress: IProgress<IProgressStep> | undefined,
		edits: Edit[],
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this._label = label;
		this._editor = editor;
		this._progress = progress || Progress.None;
		this._edits = edits;
	}

	ariaMessage(): string {
		const editCount = this._edits.length;
		const resourceCount = this._edits.length;
		if (editCount === 0) {
			return localize('summary.0', "Made no edits");
		} else if (editCount > 1 && resourceCount > 1) {
			return localize('summary.nm', "Made {0} text edits in {1} files", editCount, resourceCount);
		} else {
			return localize('summary.n0', "Made {0} text edits in one file", editCount, resourceCount);
		}
	}

	async perform(): Promise<void> {

		let seen = new Set<string>();
		let total = 0;

		const groups: Edit[][] = [];
		let group: Edit[] | undefined;
		for (const edit of this._edits) {
			if (!group
				|| (WorkspaceFileEdit.is(group[0]) && !WorkspaceFileEdit.is(edit))
				|| (WorkspaceTextEdit.is(group[0]) && !WorkspaceTextEdit.is(edit))
			) {
				group = [];
				groups.push(group);
			}
			group.push(edit);

			if (WorkspaceFileEdit.is(edit)) {
				total += 1;
			} else if (!seen.has(edit.resource.toString())) {
				seen.add(edit.resource.toString());
				total += 2;
			}
		}

		// define total work and progress callback
		// for child operations
		this._progress.report({ total });

		const progress: IProgress<void> = { report: _ => this._progress.report({ increment: 1 }) };

		// do it.
		for (const group of groups) {
			if (WorkspaceFileEdit.is(group[0])) {
				await this._performFileEdits(<WorkspaceFileEdit[]>group, progress);
			} else {
				await this._performTextEdits(<WorkspaceTextEdit[]>group, progress);
			}
		}
	}

	private async _performFileEdits(edits: WorkspaceFileEdit[], progress: IProgress<void>) {
		this._logService.debug('_performFileEdits', JSON.stringify(edits));
		for (const edit of edits) {
			progress.report(undefined);

			let options = edit.options || {};

			if (edit.newUri && edit.oldUri) {
				// rename
				if (options.overwrite === undefined && options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
					continue; // not overwriting, but ignoring, and the target file exists
				}
				await this._workingCopyFileService.move(edit.oldUri, edit.newUri, options.overwrite);

			} else if (!edit.newUri && edit.oldUri) {
				// delete file
				if (await this._fileService.exists(edit.oldUri)) {
					let useTrash = this._configurationService.getValue<boolean>('files.enableTrash');
					if (useTrash && !(this._fileService.hasCapability(edit.oldUri, FileSystemProviderCapabilities.Trash))) {
						useTrash = false; // not supported by provider
					}
					await this._workingCopyFileService.delete(edit.oldUri, { useTrash, recursive: options.recursive });
				} else if (!options.ignoreIfNotExists) {
					throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
				}
			} else if (edit.newUri && !edit.oldUri) {
				// create file
				if (options.overwrite === undefined && options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
					continue; // not overwriting, but ignoring, and the target file exists
				}
				await this._textFileService.create(edit.newUri, undefined, { overwrite: options.overwrite });
			}
		}
	}

	private async _performTextEdits(edits: WorkspaceTextEdit[], progress: IProgress<void>): Promise<void> {
		this._logService.debug('_performTextEdits', JSON.stringify(edits));

		const model = this._instaService.createInstance(BulkEditModel, this._label, this._editor, progress, edits);

		await model.prepare();

		// this._throwIfConflicts(conflicts);
		const validationResult = model.validate();
		if (validationResult.canApply === false) {
			model.dispose();
			throw new Error(`${validationResult.reason.toString()} has changed in the meantime`);
		}

		model.apply();
		model.dispose();
	}
}

export class BulkEditService implements IBulkEditService {

	_serviceBrand: undefined;

	private _previewHandler?: IBulkEditPreviewHandler;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IModelService private readonly _modelService: IModelService,
		@IEditorService private readonly _editorService: IEditorService,
	) { }

	setPreviewHandler(handler: IBulkEditPreviewHandler): IDisposable {
		this._previewHandler = handler;
		return toDisposable(() => {
			if (this._previewHandler === handler) {
				this._previewHandler = undefined;
			}
		});
	}

	hasPreviewHandler(): boolean {
		return Boolean(this._previewHandler);
	}

	async apply(edit: WorkspaceEdit, options?: IBulkEditOptions): Promise<IBulkEditResult> {

		if (edit.edits.length === 0) {
			return { ariaSummary: localize('nothing', "Made no edits") };
		}

		if (this._previewHandler && (options?.showPreview || edit.edits.some(value => value.metadata?.needsConfirmation))) {
			edit = await this._previewHandler(edit, options);
		}

		const { edits } = edit;
		let codeEditor = options?.editor;

		// First check if loaded models were not changed in the meantime
		for (const edit of edits) {
			if (!WorkspaceFileEdit.is(edit) && typeof edit.modelVersionId === 'number') {
				let model = this._modelService.getModel(edit.resource);
				if (model && model.getVersionId() !== edit.modelVersionId) {
					// model changed in the meantime
					return Promise.reject(new Error(`${model.uri.toString()} has changed in the meantime`));
				}
			}
		}

		// try to find code editor
		if (!codeEditor) {
			let candidate = this._editorService.activeTextEditorControl;
			if (isCodeEditor(candidate)) {
				codeEditor = candidate;
			}
		}

		if (codeEditor && codeEditor.getOption(EditorOption.readOnly)) {
			// If the code editor is readonly still allow bulk edits to be applied #68549
			codeEditor = undefined;
		}
		const bulkEdit = this._instaService.createInstance(BulkEdit, options?.quotableLabel || options?.label, codeEditor, options?.progress, edits);
		return bulkEdit.perform().then(() => {
			return { ariaSummary: bulkEdit.ariaMessage() };
		}).catch(err => {
			// console.log('apply FAILED');
			// console.log(err);
			this._logService.error(err);
			throw err;
		});
	}
}

registerSingleton(IBulkEditService, BulkEditService, true);
