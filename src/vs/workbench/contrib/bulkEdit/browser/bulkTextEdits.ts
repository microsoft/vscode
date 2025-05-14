/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dispose, IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { EndOfLineSequence, ITextModel } from '../../../../editor/common/model.js';
import { ITextModelService, IResolvedTextEditorModel } from '../../../../editor/common/services/resolverService.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IUndoRedoService, UndoRedoGroup, UndoRedoSource } from '../../../../platform/undoRedo/common/undoRedo.js';
import { SingleModelEditStackElement, MultiModelEditStackElement } from '../../../../editor/common/model/editStack.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { SnippetParser } from '../../../../editor/contrib/snippet/browser/snippetParser.js';
import { ISnippetEdit } from '../../../../editor/contrib/snippet/browser/snippetSession.js';

type ValidationResult = { canApply: true } | { canApply: false; reason: URI };

type ISingleSnippetEditOperation = ISingleEditOperation & { insertAsSnippet?: boolean; keepWhitespace?: boolean };

class ModelEditTask implements IDisposable {

	readonly model: ITextModel;

	private _expectedModelVersionId: number | undefined;
	protected _edits: ISingleSnippetEditOperation[];
	protected _newEol: EndOfLineSequence | undefined;

	constructor(private readonly _modelReference: IReference<IResolvedTextEditorModel>) {
		this.model = this._modelReference.object.textEditorModel;
		this._edits = [];
	}

	dispose() {
		this._modelReference.dispose();
	}

	isNoOp() {
		if (this._edits.length > 0) {
			// contains textual edits
			return false;
		}
		if (this._newEol !== undefined && this._newEol !== this.model.getEndOfLineSequence()) {
			// contains an eol change that is a real change
			return false;
		}
		return true;
	}

	addEdit(resourceEdit: ResourceTextEdit): void {
		this._expectedModelVersionId = resourceEdit.versionId;
		const { textEdit } = resourceEdit;

		if (typeof textEdit.eol === 'number') {
			// honor eol-change
			this._newEol = textEdit.eol;
		}
		if (!textEdit.range && !textEdit.text) {
			// lacks both a range and the text
			return;
		}
		if (Range.isEmpty(textEdit.range) && !textEdit.text) {
			// no-op edit (replace empty range with empty text)
			return;
		}

		// create edit operation
		let range: Range;
		if (!textEdit.range) {
			range = this.model.getFullModelRange();
		} else {
			range = Range.lift(textEdit.range);
		}
		this._edits.push({ ...EditOperation.replaceMove(range, textEdit.text), insertAsSnippet: textEdit.insertAsSnippet, keepWhitespace: textEdit.keepWhitespace });
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
			this._edits = this._edits
				.map(this._transformSnippetStringToInsertText, this) // no editor -> no snippet mode
				.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			this.model.pushEditOperations(null, this._edits, () => null);
		}
		if (this._newEol !== undefined) {
			this.model.pushEOL(this._newEol);
		}
	}

	protected _transformSnippetStringToInsertText(edit: ISingleSnippetEditOperation): ISingleSnippetEditOperation {
		// transform a snippet edit (and only those) into a normal text edit
		// for that we need to parse the snippet and get its actual text, e.g without placeholder
		// or variable syntaxes
		if (!edit.insertAsSnippet) {
			return edit;
		}
		if (!edit.text) {
			return edit;
		}
		const text = SnippetParser.asInsertText(edit.text);
		return { ...edit, insertAsSnippet: false, text };
	}
}

class EditorEditTask extends ModelEditTask {

	private readonly _editor: ICodeEditor;

	constructor(modelReference: IReference<IResolvedTextEditorModel>, editor: ICodeEditor) {
		super(modelReference);
		this._editor = editor;
	}

	override getBeforeCursorState(): Selection[] | null {
		return this._canUseEditor() ? this._editor.getSelections() : null;
	}

	override apply(): void {

		// Check that the editor is still for the wanted model. It might have changed in the
		// meantime and that means we cannot use the editor anymore (instead we perform the edit through the model)
		if (!this._canUseEditor()) {
			super.apply();
			return;
		}

		if (this._edits.length > 0) {
			const snippetCtrl = SnippetController2.get(this._editor);
			if (snippetCtrl && this._edits.some(edit => edit.insertAsSnippet)) {
				// some edit is a snippet edit -> use snippet controller and ISnippetEdits
				const snippetEdits: ISnippetEdit[] = [];
				for (const edit of this._edits) {
					if (edit.range && edit.text !== null) {
						snippetEdits.push({
							range: Range.lift(edit.range),
							template: edit.insertAsSnippet ? edit.text : SnippetParser.escape(edit.text),
							keepWhitespace: edit.keepWhitespace
						});
					}
				}
				snippetCtrl.apply(snippetEdits, { undoStopBefore: false, undoStopAfter: false });

			} else {
				// normal edit
				this._edits = this._edits
					.map(this._transformSnippetStringToInsertText, this) // mixed edits (snippet and normal) -> no snippet mode
					.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
				this._editor.executeEdits('', this._edits);
			}
		}
		if (this._newEol !== undefined) {
			if (this._editor.hasModel()) {
				this._editor.getModel().pushEOL(this._newEol);
			}
		}
	}

	private _canUseEditor(): boolean {
		return this._editor?.getModel()?.uri.toString() === this.model.uri.toString();
	}
}

export class BulkTextEdits {

	private readonly _edits = new ResourceMap<ResourceTextEdit[]>();

	constructor(
		private readonly _label: string,
		private readonly _code: string,
		private readonly _editor: ICodeEditor | undefined,
		private readonly _undoRedoGroup: UndoRedoGroup,
		private readonly _undoRedoSource: UndoRedoSource | undefined,
		private readonly _progress: IProgress<void>,
		private readonly _token: CancellationToken,
		edits: ResourceTextEdit[],
		@IEditorWorkerService private readonly _editorWorker: IEditorWorkerService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService
	) {

		for (const edit of edits) {
			let array = this._edits.get(edit.resource);
			if (!array) {
				array = [];
				this._edits.set(edit.resource, array);
			}
			array.push(edit);
		}
	}

	private _validateBeforePrepare(): void {
		// First check if loaded models were not changed in the meantime
		for (const array of this._edits.values()) {
			for (const edit of array) {
				if (typeof edit.versionId === 'number') {
					const model = this._modelService.getModel(edit.resource);
					if (model && model.getVersionId() !== edit.versionId) {
						// model changed in the meantime
						throw new Error(`${model.uri.toString()} has changed in the meantime`);
					}
				}
			}
		}
	}

	private async _createEditsTasks(): Promise<ModelEditTask[]> {

		const tasks: ModelEditTask[] = [];
		const promises: Promise<any>[] = [];

		for (const [key, edits] of this._edits) {
			const promise = this._textModelResolverService.createModelReference(key).then(async ref => {
				let task: ModelEditTask;
				let makeMinimal = false;
				if (this._editor?.getModel()?.uri.toString() === ref.object.textEditorModel.uri.toString()) {
					task = new EditorEditTask(ref, this._editor);
					makeMinimal = true;
				} else {
					task = new ModelEditTask(ref);
				}
				tasks.push(task);


				if (!makeMinimal) {
					edits.forEach(task.addEdit, task);
					return;
				}

				// group edits by type (snippet, metadata, or simple) and make simple groups more minimal

				const makeGroupMoreMinimal = async (start: number, end: number) => {
					const oldEdits = edits.slice(start, end);
					const newEdits = await this._editorWorker.computeMoreMinimalEdits(ref.object.textEditorModel.uri, oldEdits.map(e => e.textEdit), false);
					if (!newEdits) {
						oldEdits.forEach(task.addEdit, task);
					} else {
						newEdits.forEach(edit => task.addEdit(new ResourceTextEdit(ref.object.textEditorModel.uri, edit, undefined, undefined)));
					}
				};

				let start = 0;
				let i = 0;
				for (; i < edits.length; i++) {
					if (edits[i].textEdit.insertAsSnippet || edits[i].metadata) {
						await makeGroupMoreMinimal(start, i); // grouped edits until now
						task.addEdit(edits[i]); // this edit
						start = i + 1;
					}
				}
				await makeGroupMoreMinimal(start, i);

			});
			promises.push(promise);
		}

		await Promise.all(promises);
		return tasks;
	}

	private _validateTasks(tasks: ModelEditTask[]): ValidationResult {
		for (const task of tasks) {
			const result = task.validate();
			if (!result.canApply) {
				return result;
			}
		}
		return { canApply: true };
	}

	async apply(): Promise<readonly URI[]> {

		this._validateBeforePrepare();
		const tasks = await this._createEditsTasks();

		try {
			if (this._token.isCancellationRequested) {
				return [];
			}

			const resources: URI[] = [];
			const validation = this._validateTasks(tasks);
			if (!validation.canApply) {
				throw new Error(`${validation.reason.toString()} has changed in the meantime`);
			}
			if (tasks.length === 1) {
				// This edit touches a single model => keep things simple
				const task = tasks[0];
				if (!task.isNoOp()) {
					const singleModelEditStackElement = new SingleModelEditStackElement(this._label, this._code, task.model, task.getBeforeCursorState());
					this._undoRedoService.pushElement(singleModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
					task.apply();
					singleModelEditStackElement.close();
					resources.push(task.model.uri);
				}
				this._progress.report(undefined);
			} else {
				// prepare multi model undo element
				const multiModelEditStackElement = new MultiModelEditStackElement(
					this._label,
					this._code,
					tasks.map(t => new SingleModelEditStackElement(this._label, this._code, t.model, t.getBeforeCursorState()))
				);
				this._undoRedoService.pushElement(multiModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
				for (const task of tasks) {
					task.apply();
					this._progress.report(undefined);
					resources.push(task.model.uri);
				}
				multiModelEditStackElement.close();
			}

			return resources;

		} finally {
			dispose(tasks);
		}
	}
}
