/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as strings from 'vs/base/common/strings';
import {RawContextKey, IContextKey, IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, commonEditorContribution, EditorCommand} from 'vs/editor/common/editorCommonExtensions';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ICodeSnippet, CodeSnippet} from './snippet';

import EditorContextKeys = editorCommon.EditorContextKeys;


export class InsertSnippetController {

	private editor: editorCommon.ICommonCodeEditor;
	private model: editorCommon.IModel;
	private finishPlaceHolderIndex: number;

	private listenersToRemove: IDisposable[];
	private trackedPlaceHolders: ITrackedPlaceHolder[];
	private placeHolderDecorations: string[];
	private currentPlaceHolderIndex: number;
	private highlightDecorationId: string;
	private isFinished: boolean;

	private _onStop: () => void;
	private _initialAlternativeVersionId: number;

	constructor(editor: editorCommon.ICommonCodeEditor, adaptedSnippet: ICodeSnippet, startLineNumber: number, initialAlternativeVersionId: number, onStop: () => void) {
		this.editor = editor;
		this._onStop = onStop;
		this.model = editor.getModel();
		this.finishPlaceHolderIndex = adaptedSnippet.finishPlaceHolderIndex;

		this.trackedPlaceHolders = [];
		this.placeHolderDecorations = [];
		this.currentPlaceHolderIndex = 0;
		this.highlightDecorationId = null;
		this.isFinished = false;

		this._initialAlternativeVersionId = initialAlternativeVersionId;

		this.initialize(adaptedSnippet, startLineNumber);
	}

	public dispose(): void {
		this.stopAll();
	}

	private initialize(adaptedSnippet: ICodeSnippet, startLineNumber: number): void {
		var i: number, len: number;

		for (i = 0, len = adaptedSnippet.placeHolders.length; i < len; i++) {
			var placeHolder = adaptedSnippet.placeHolders[i];

			var trackedRanges: string[] = [];
			for (var j = 0, lenJ = placeHolder.occurences.length; j < lenJ; j++) {
				trackedRanges.push(this.model.addTrackedRange(placeHolder.occurences[j], editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges));
			}

			this.trackedPlaceHolders.push({
				ranges: trackedRanges
			});
		}

		this.editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
			let newDecorations: editorCommon.IModelDeltaDecoration[] = [];

			let endLineNumber = startLineNumber + adaptedSnippet.lines.length - 1;
			let endLineNumberMaxColumn = this.model.getLineMaxColumn(endLineNumber);
			newDecorations.push({
				range: new Range(startLineNumber, 1, endLineNumber, endLineNumberMaxColumn),
				options: {
					className: 'new-snippet',
					isWholeLine: true
				}
			});

			for (let i = 0, len = this.trackedPlaceHolders.length; i < len; i++) {
				let className = (i === this.finishPlaceHolderIndex) ? 'finish-snippet-placeholder' : 'snippet-placeholder';
				newDecorations.push({
					range: this.model.getTrackedRange(this.trackedPlaceHolders[i].ranges[0]),
					options: {
						className: className
					}
				});
			}

			let decorations = changeAccessor.deltaDecorations([], newDecorations);
			this.highlightDecorationId = decorations[0];
			this.placeHolderDecorations = decorations.slice(1);
		});

		this.listenersToRemove = [];
		this.listenersToRemove.push(this.editor.onDidChangeModelRawContent((e: editorCommon.IModelContentChangedEvent) => {
			if (this.isFinished) {
				return;
			}

			if (e.changeType === editorCommon.EventType.ModelRawContentChangedFlush) {
				// a model.setValue() was called
				this.stopAll();
			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLineChanged) {
				var changedLine = (<editorCommon.IModelContentChangedLineChangedEvent>e).lineNumber;
				var highlightRange = this.model.getDecorationRange(this.highlightDecorationId);

				if (changedLine < highlightRange.startLineNumber || changedLine > highlightRange.endLineNumber) {
					this.stopAll();
				}
			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesInserted) {
				var insertLine = (<editorCommon.IModelContentChangedLinesInsertedEvent>e).fromLineNumber;
				var highlightRange = this.model.getDecorationRange(this.highlightDecorationId);

				if (insertLine < highlightRange.startLineNumber || insertLine > highlightRange.endLineNumber) {
					this.stopAll();
				}
			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesDeleted) {
				var deleteLine1 = (<editorCommon.IModelContentChangedLinesDeletedEvent>e).fromLineNumber;
				var deleteLine2 = (<editorCommon.IModelContentChangedLinesDeletedEvent>e).toLineNumber;
				var highlightRange = this.model.getDecorationRange(this.highlightDecorationId);

				var deletedLinesAbove = (deleteLine2 < highlightRange.startLineNumber);
				var deletedLinesBelow = (deleteLine1 > highlightRange.endLineNumber);

				if (deletedLinesAbove || deletedLinesBelow) {
					this.stopAll();
				}
			}

			var newAlternateVersionId = this.editor.getModel().getAlternativeVersionId();
			if (this._initialAlternativeVersionId === newAlternateVersionId) {
				// We executed undo until we reached the same version we started with
				this.stopAll();
			}
		}));

		this.listenersToRemove.push(this.editor.onDidChangeCursorPosition((e: editorCommon.ICursorPositionChangedEvent) => {
			if (this.isFinished) {
				return;
			}
			var highlightRange = this.model.getDecorationRange(this.highlightDecorationId);
			var lineNumber = e.position.lineNumber;
			if (lineNumber < highlightRange.startLineNumber || lineNumber > highlightRange.endLineNumber) {
				this.stopAll();
			}
		}));

		this.listenersToRemove.push(this.editor.onDidChangeModel(() => {
			this.stopAll();
		}));

		var blurTimeout = -1;
		this.listenersToRemove.push(this.editor.onDidBlurEditor(() => {
			// Blur if within 100ms we do not focus back
			blurTimeout = setTimeout(() => {
				this.stopAll();
			}, 100);
		}));

		this.listenersToRemove.push(this.editor.onDidFocusEditor(() => {
			// Cancel the blur timeout (if any)
			if (blurTimeout !== -1) {
				clearTimeout(blurTimeout);
				blurTimeout = -1;
			}
		}));

		this.listenersToRemove.push(this.model.onDidChangeDecorations((e) => {
			if (this.isFinished) {
				return;
			}

			var modelEditableRange = this.model.getEditableRange(),
				previousRange: Range = null,
				allCollapsed = true,
				allEqualToEditableRange = true;

			for (var i = 0; (allCollapsed || allEqualToEditableRange) && i < this.trackedPlaceHolders.length; i++) {
				var ranges = this.trackedPlaceHolders[i].ranges;

				for (var j = 0; (allCollapsed || allEqualToEditableRange) && j < ranges.length; j++) {
					var range = this.model.getTrackedRange(ranges[j]);

					if (allCollapsed) {
						if (!range.isEmpty()) {
							allCollapsed = false;
						} else if (previousRange === null) {
							previousRange = range;
						} else if (!previousRange.equalsRange(range)) {
							allCollapsed = false;
						}
					}

					if (allEqualToEditableRange && !modelEditableRange.equalsRange(range)) {
						allEqualToEditableRange = false;
					}
				}
			}


			if (allCollapsed || allEqualToEditableRange) {
				this.stopAll();
			} else {
				if (this.finishPlaceHolderIndex !== -1) {
					var finishPlaceHolderDecorationId = this.placeHolderDecorations[this.finishPlaceHolderIndex];
					var finishPlaceHolderRange = this.model.getDecorationRange(finishPlaceHolderDecorationId);
					var finishPlaceHolderOptions = this.model.getDecorationOptions(finishPlaceHolderDecorationId);

					var finishPlaceHolderRangeIsEmpty = finishPlaceHolderRange.isEmpty();
					var finishPlaceHolderClassNameIsForEmpty = (finishPlaceHolderOptions.className === 'finish-snippet-placeholder');

					// Remember xor? :)
					var needsChanging = Number(finishPlaceHolderRangeIsEmpty) ^ Number(finishPlaceHolderClassNameIsForEmpty);

					if (needsChanging) {
						this.editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
							var className = finishPlaceHolderRangeIsEmpty ? 'finish-snippet-placeholder' : 'snippet-placeholder';
							changeAccessor.changeDecorationOptions(finishPlaceHolderDecorationId, {
								className: className
							});
						});
					}
				}
			}
		}));

		this.doLinkEditing();
	}

	public onNextPlaceHolder(): boolean {
		return this.changePlaceHolder(true);
	}

	public onPrevPlaceHolder(): boolean {
		return this.changePlaceHolder(false);
	}

	private changePlaceHolder(goToNext: boolean): boolean {
		if (this.isFinished) {
			return false;
		}

		var oldPlaceHolderIndex = this.currentPlaceHolderIndex;
		var oldRange = this.model.getTrackedRange(this.trackedPlaceHolders[oldPlaceHolderIndex].ranges[0]);
		var sameRange = true;
		do {
			if (goToNext) {
				this.currentPlaceHolderIndex = (this.currentPlaceHolderIndex + 1) % this.trackedPlaceHolders.length;
			} else {
				this.currentPlaceHolderIndex = (this.trackedPlaceHolders.length + this.currentPlaceHolderIndex - 1) % this.trackedPlaceHolders.length;
			}

			var newRange = this.model.getTrackedRange(this.trackedPlaceHolders[this.currentPlaceHolderIndex].ranges[0]);

			sameRange = oldRange.equalsRange(newRange);

		} while (this.currentPlaceHolderIndex !== oldPlaceHolderIndex && sameRange);

		this.doLinkEditing();
		return true;
	}

	public onAccept(): boolean {
		if (this.isFinished) {
			return false;
		}
		if (this.finishPlaceHolderIndex !== -1) {
			var finishRange = this.model.getTrackedRange(this.trackedPlaceHolders[this.finishPlaceHolderIndex].ranges[0]);
			// Let's just position cursor at the end of the finish range
			this.editor.setPosition({
				lineNumber: finishRange.endLineNumber,
				column: finishRange.endColumn
			});
		}
		this.stopAll();
		return true;
	}

	public onEscape(): boolean {
		if (this.isFinished) {
			return false;
		}
		this.stopAll();
		// Cancel multi-cursor
		this.editor.setSelections([this.editor.getSelections()[0]]);
		return true;
	}

	private doLinkEditing(): void {
		var selections: editorCommon.ISelection[] = [];
		for (var i = 0, len = this.trackedPlaceHolders[this.currentPlaceHolderIndex].ranges.length; i < len; i++) {
			var range = this.model.getTrackedRange(this.trackedPlaceHolders[this.currentPlaceHolderIndex].ranges[i]);
			selections.push({
				selectionStartLineNumber: range.startLineNumber,
				selectionStartColumn: range.startColumn,
				positionLineNumber: range.endLineNumber,
				positionColumn: range.endColumn
			});
		}
		this.editor.setSelections(selections);
	}

	private stopAll(): void {
		if (this.isFinished) {
			return;
		}
		this.isFinished = true;

		this._onStop();

		this.listenersToRemove = dispose(this.listenersToRemove);

		for (var i = 0; i < this.trackedPlaceHolders.length; i++) {
			var ranges = this.trackedPlaceHolders[i].ranges;
			for (var j = 0; j < ranges.length; j++) {
				this.model.removeTrackedRange(ranges[j]);
			}
		}
		this.trackedPlaceHolders = [];

		this.editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
			let toRemove: string[] = [];
			toRemove.push(this.highlightDecorationId);
			for (let i = 0; i < this.placeHolderDecorations.length; i++) {
				toRemove.push(this.placeHolderDecorations[i]);
			}
			changeAccessor.deltaDecorations(toRemove, []);
			this.placeHolderDecorations = [];
			this.highlightDecorationId = null;
		});
	}
}

export interface ITrackedPlaceHolder {
	ranges: string[];
}

interface IPreparedSnippet {
	typeRange: Range;
	adaptedSnippet: ICodeSnippet;
}

@commonEditorContribution
export class SnippetController {

	private static ID = 'editor.contrib.snippetController';

	public static get(editor: editorCommon.ICommonCodeEditor): SnippetController {
		return editor.getContribution<SnippetController>(SnippetController.ID);
	}

	private _editor: editorCommon.ICommonCodeEditor;
	protected _currentController: InsertSnippetController;
	private _inSnippetMode: IContextKey<boolean>;

	constructor(editor: editorCommon.ICommonCodeEditor, @IContextKeyService contextKeyService: IContextKeyService) {
		this._editor = editor;
		this._currentController = null;
		this._inSnippetMode = CONTEXT_SNIPPET_MODE.bindTo(contextKeyService);
	}

	public dispose(): void {
		if (this._currentController) {
			this._currentController.dispose();
			this._currentController = null;
		}
	}

	public getId(): string {
		return SnippetController.ID;
	}

	public run(snippet: CodeSnippet, overwriteBefore: number, overwriteAfter: number, stripPrefix?: boolean): void {
		this._runAndRestoreController(() => {
			if (snippet.isInsertOnly || snippet.isSingleTabstopOnly) {
				// Only inserts text, not placeholders, tabstops etc
				// Only cursor endposition
				this._runForAllSelections(snippet, overwriteBefore, overwriteAfter, stripPrefix);

			} else {
				let prepared = SnippetController._prepareSnippet(this._editor, this._editor.getSelection(), snippet, overwriteBefore, overwriteAfter, stripPrefix);
				this._runPreparedSnippetForPrimarySelection(prepared, true);
			}
		});
	}

	/**
	 * Inserts once `snippet` at the start of `replaceRange`, after deleting `replaceRange`.
	 */
	public runWithReplaceRange(snippet: CodeSnippet, replaceRange: Range): void {
		this._runAndRestoreController(() => {
			this._runPreparedSnippetForPrimarySelection({
				typeRange: replaceRange,
				adaptedSnippet: SnippetController._getAdaptedSnippet(this._editor.getModel(), snippet, replaceRange)
			}, false);
		});
	}

	private _runAndRestoreController(callback: () => void): void {
		let prevController = this._currentController;
		this._currentController = null;

		callback();

		if (!this._currentController) {
			// we didn't end up in snippet mode again => restore previous controller
			this._currentController = prevController;
		} else {
			// we ended up in snippet mode => dispose previous controller if necessary
			if (prevController) {
				prevController.dispose();
			}
		}
	}

	private static _getTypeRangeForSelection(model: editorCommon.IModel, selection: Selection, overwriteBefore: number, overwriteAfter: number): Range {
		var typeRange: Range;
		if (overwriteBefore || overwriteAfter) {
			typeRange = model.validateRange(Range.plusRange(selection, {
				startLineNumber: selection.positionLineNumber,
				startColumn: selection.positionColumn - overwriteBefore,
				endLineNumber: selection.positionLineNumber,
				endColumn: selection.positionColumn + overwriteAfter
			}));
		} else {
			typeRange = selection;
		}
		return typeRange;
	}

	private static _getAdaptedSnippet(model: editorCommon.IModel, snippet: CodeSnippet, typeRange: Range): ICodeSnippet {
		return snippet.bind(model.getLineContent(typeRange.startLineNumber), typeRange.startLineNumber - 1, typeRange.startColumn - 1, model);
	}

	private static _addCommandForSnippet(model: editorCommon.ITextModel, adaptedSnippet: ICodeSnippet, typeRange: Range, out: editorCommon.IIdentifiedSingleEditOperation[]): void {
		let insertText = adaptedSnippet.lines.join('\n');
		let currentText = model.getValueInRange(typeRange, editorCommon.EndOfLinePreference.LF);
		if (insertText !== currentText) {
			out.push(EditOperation.replaceMove(typeRange, insertText));
		}
	}

	private _runPreparedSnippetForPrimarySelection(prepared: IPreparedSnippet, undoStops: boolean): void {
		let initialAlternativeVersionId = this._editor.getModel().getAlternativeVersionId();

		let edits: editorCommon.IIdentifiedSingleEditOperation[] = [];

		SnippetController._addCommandForSnippet(this._editor.getModel(), prepared.adaptedSnippet, prepared.typeRange, edits);

		if (edits.length > 0) {
			if (undoStops) {
				this._editor.pushUndoStop();
			}
			this._editor.executeEdits('editor.contrib.insertSnippetHelper', edits);
			if (undoStops) {
				this._editor.pushUndoStop();
			}
		}

		let cursorOnly = SnippetController._getSnippetCursorOnly(prepared.adaptedSnippet);
		if (cursorOnly) {
			this._editor.setSelection(new Selection(cursorOnly.lineNumber, cursorOnly.column, cursorOnly.lineNumber, cursorOnly.column));
		} else if (prepared.adaptedSnippet.placeHolders.length > 0) {
			this._inSnippetMode.set(true);
			this._currentController = new InsertSnippetController(this._editor, prepared.adaptedSnippet, prepared.typeRange.startLineNumber, initialAlternativeVersionId, () => {
				this._inSnippetMode.reset();
				this._currentController.dispose();
				this._currentController = null;
			});
		}
	}

	private _runForAllSelections(snippet: CodeSnippet, overwriteBefore: number, overwriteAfter: number, stripPrefix?: boolean): void {

		const edits: editorCommon.IIdentifiedSingleEditOperation[] = [];
		const selections = this._editor.getSelections();
		let lineDelta = 0;
		let columnDelta = 0;

		for (let i = 0; i < selections.length; i++) {
			let {adaptedSnippet, typeRange} = SnippetController._prepareSnippet(this._editor, selections[i], snippet, overwriteBefore, overwriteAfter, stripPrefix);
			SnippetController._addCommandForSnippet(this._editor.getModel(), adaptedSnippet, typeRange, edits);

			if (i === 0 && snippet.isSingleTabstopOnly) {
				const finalCursorPos = SnippetController._getSnippetCursorOnly(adaptedSnippet);
				const editEnd = typeRange.getEndPosition();
				editEnd.lineNumber += adaptedSnippet.lines.length - 1;
				editEnd.column = adaptedSnippet.lines[adaptedSnippet.lines.length - 1].length + 1;

				lineDelta = finalCursorPos.lineNumber - editEnd.lineNumber;
				columnDelta = finalCursorPos.column - editEnd.column;
			}
		}

		if (edits.length === 0) {
			return;
		}

		const cursorStateComputer: editorCommon.ICursorStateComputer = function (inverseEdits) {

			return inverseEdits.map((edit, i) => {

				let {endLineNumber, endColumn} = edit.range;
				endLineNumber += lineDelta;
				endColumn += columnDelta;

				return new Selection(endLineNumber, endColumn, endLineNumber, endColumn);
			});
		};

		const model = this._editor.getModel();
		model.pushStackElement();
		this._editor.setSelections(model.pushEditOperations(selections, edits, cursorStateComputer));
		model.pushStackElement();
	}

	private static _prepareSnippet(editor: editorCommon.ICommonCodeEditor, selection: Selection, snippet: CodeSnippet, overwriteBefore: number, overwriteAfter: number, stripPrefix = true): { typeRange: Range; adaptedSnippet: ICodeSnippet; } {
		var model = editor.getModel();

		var typeRange = SnippetController._getTypeRangeForSelection(model, selection, overwriteBefore, overwriteAfter);
		if (snippet.lines.length === 1) {
			var nextTextOnLine = model.getLineContent(typeRange.endLineNumber).substr(typeRange.endColumn - 1);
			var nextInSnippet = snippet.lines[0].substr(overwriteBefore);
			var commonPrefix = strings.commonPrefixLength(nextTextOnLine, nextInSnippet);

			if (commonPrefix > 0 && stripPrefix) {
				typeRange = typeRange.setEndPosition(typeRange.endLineNumber, typeRange.endColumn + commonPrefix);
			}
		}

		var adaptedSnippet = SnippetController._getAdaptedSnippet(model, snippet, typeRange);
		return {
			typeRange: typeRange,
			adaptedSnippet: adaptedSnippet
		};
	}

	private static _getSnippetCursorOnly(snippet: ICodeSnippet): editorCommon.IPosition {

		if (snippet.placeHolders.length !== 1) {
			return null;
		}

		var placeHolder = snippet.placeHolders[0];
		if (placeHolder.value !== '' || placeHolder.occurences.length !== 1) {
			return null;
		}

		var placeHolderRange = placeHolder.occurences[0];
		if (!Range.isEmpty(placeHolderRange)) {
			return null;
		}

		return {
			lineNumber: placeHolderRange.startLineNumber,
			column: placeHolderRange.startColumn
		};
	}

	public jumpToNextPlaceholder(): void {
		if (this._currentController) {
			this._currentController.onNextPlaceHolder();
		}
	}

	public jumpToPrevPlaceholder(): void {
		if (this._currentController) {
			this._currentController.onPrevPlaceHolder();
		}
	}

	public acceptSnippet(): void {
		if (this._currentController) {
			this._currentController.onAccept();
		}
	}

	public leaveSnippet(): void {
		if (this._currentController) {
			this._currentController.onEscape();
		}
	}
}

export var CONTEXT_SNIPPET_MODE = new RawContextKey<boolean>('inSnippetMode', false);

const SnippetCommand = EditorCommand.bindToContribution<SnippetController>(SnippetController.get);

CommonEditorRegistry.registerEditorCommand(new SnippetCommand({
	id: 'jumpToNextSnippetPlaceholder',
	precondition: CONTEXT_SNIPPET_MODE,
	handler: x => x.jumpToNextPlaceholder(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Tab
	}
}));
CommonEditorRegistry.registerEditorCommand(new SnippetCommand({
	id: 'jumpToPrevSnippetPlaceholder',
	precondition: CONTEXT_SNIPPET_MODE,
	handler: x => x.jumpToPrevPlaceholder(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.Tab
	}
}));
CommonEditorRegistry.registerEditorCommand(new SnippetCommand({
	id: 'acceptSnippet',
	precondition: CONTEXT_SNIPPET_MODE,
	handler: x => x.acceptSnippet(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Enter
	}
}));
CommonEditorRegistry.registerEditorCommand(new SnippetCommand({
	id: 'leaveSnippet',
	precondition: CONTEXT_SNIPPET_MODE,
	handler: x => x.leaveSnippet(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));
