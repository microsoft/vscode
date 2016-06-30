/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as collections from 'vs/base/common/collections';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as strings from 'vs/base/common/strings';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';

interface IParsedLinePlaceHolderInfo {
	id: string;
	value: string;
	startColumn: number;
	endColumn: number;
}

interface IParsedLine {
	line: string;
	placeHolders: IParsedLinePlaceHolderInfo[];
}

export interface IPlaceHolder {
	id: string;
	value: string;
	occurences: editorCommon.IRange[];
}

export interface IIndentationNormalizer {
	normalizeIndentation(str:string): string;
}

export interface ICodeSnippet {
	lines:string[];
	placeHolders:IPlaceHolder[];
	finishPlaceHolderIndex:number;
}

export enum ExternalSnippetType {
	TextMateSnippet,
	EmmetSnippet
}

export class CodeSnippet implements ICodeSnippet {

	private _lastGeneratedId: number;
	public lines:string[];
	public placeHolders:IPlaceHolder[];
	public finishPlaceHolderIndex:number;

	constructor(snippetTemplate:string) {
		this.lines = [];
		this.placeHolders = [];
		this._lastGeneratedId = 0;
		this.finishPlaceHolderIndex = -1;

		this.parseTemplate(snippetTemplate);
	}

	private parseTemplate(template: string): void {

		var placeHoldersMap: collections.IStringDictionary<IPlaceHolder> = {};
		var i: number, len: number, j: number, lenJ: number, templateLines = template.split('\n');

		for (i = 0, len = templateLines.length; i < len; i++) {
			var parsedLine = this.parseLine(templateLines[i], (id:string) => {
				if (collections.contains(placeHoldersMap, id)) {
					return placeHoldersMap[id].value;
				}
				return '';
			});
			for (j = 0, lenJ = parsedLine.placeHolders.length; j < lenJ; j++) {
				var linePlaceHolder = parsedLine.placeHolders[j];
				var occurence = new Range(i + 1, linePlaceHolder.startColumn, i + 1, linePlaceHolder.endColumn);
				var placeHolder: IPlaceHolder;

				if (collections.contains(placeHoldersMap, linePlaceHolder.id)) {
					placeHolder = placeHoldersMap[linePlaceHolder.id];
				} else {
					placeHolder = {
						id: linePlaceHolder.id,
						value: linePlaceHolder.value,
						occurences: []
					};
					this.placeHolders.push(placeHolder);
					placeHoldersMap[linePlaceHolder.id] = placeHolder;
				}

				placeHolder.occurences.push(occurence);
			}

			this.lines.push(parsedLine.line);
		}

		// Named variables (e.g. {greeting} and {greeting:Hello}) are sorted first, followed by
		// tab-stops and numeric variables (e.g. $1, $2, ${3:foo}) which are sorted in ascending order
		this.placeHolders.sort((a, b) => {
			let nonIntegerId = (v: IPlaceHolder) => !(/^\d+$/).test(v.id);
			let isFinishPlaceHolder = (v: IPlaceHolder) => v.id === '' && v.value === '';

			// Sort finish placeholder last
			if (isFinishPlaceHolder(a)) {
				return 1;
			} else if (isFinishPlaceHolder(b)) {
				return -1;
			}

			// Sort named placeholders first
			if (nonIntegerId(a) && nonIntegerId(b)) {
				return 0;
			} else if (nonIntegerId(a)) {
				return -1;
			} else if (nonIntegerId(b)) {
				return 1;
			}

			if (a.id === b.id) {
				return 0;
			}

			return Number(a.id) < Number(b.id) ? -1 : 1;
		});

		if (this.placeHolders.length > 0 && this.placeHolders[this.placeHolders.length - 1].value === '') {
			this.finishPlaceHolderIndex = this.placeHolders.length - 1;
		}
	}

	private parseLine(line:string, findDefaultValueForId:(id:string)=>string) : IParsedLine {

		// Placeholder 0 is the entire line
		var placeHolderStack: { placeHolderId: string; placeHolderText: string; }[] = [{ placeHolderId: '', placeHolderText: '' }];
		var placeHolders: IParsedLinePlaceHolderInfo[] = [];

		var i = 0;
		var len = line.length;
		var resultIndex = 0;
		while (i < len) {

			var restOfLine = line.substr(i);

			// Look for the start of a placeholder {{
			if (/^{{/.test(restOfLine)) {
				i += 2;
				placeHolderStack.push({ placeHolderId: '', placeHolderText: '' });

				// Look for id
				var matches = restOfLine.match(/^{{(\w+):/);
				if (Array.isArray(matches) && matches.length === 2) {
					placeHolderStack[placeHolderStack.length - 1].placeHolderId = matches[1];
					i += matches[1].length + 1; // +1 to account for the : at the end of the id
				}

				continue;
			}

			// Look for the end of a placeholder. placeHolderStack[0] is the top-level line.
			if (placeHolderStack.length > 1 && /^}}/.test(restOfLine)) {
				i += 2;

				if (placeHolderStack[placeHolderStack.length - 1].placeHolderId.length === 0) {
					// This placeholder did not have an explicit id
					placeHolderStack[placeHolderStack.length - 1].placeHolderId = placeHolderStack[placeHolderStack.length - 1].placeHolderText;

					if (placeHolderStack[placeHolderStack.length - 1].placeHolderId === '_') {
						// This is just an empty tab stop
						placeHolderStack[placeHolderStack.length - 1].placeHolderId = 'TAB_STOP_' + String(++this._lastGeneratedId);
						placeHolderStack[placeHolderStack.length - 1].placeHolderText = '';
						--resultIndex; // Roll back one iteration of the result index as we made the text empty
					}
				}

				if (placeHolderStack[placeHolderStack.length - 1].placeHolderText.length === 0) {
					// This placeholder is empty or was a mirror
					var defaultValue = findDefaultValueForId(placeHolderStack[placeHolderStack.length - 1].placeHolderId);
					placeHolderStack[placeHolderStack.length - 1].placeHolderText = defaultValue;
					resultIndex += defaultValue.length;
				}

				placeHolders.push({
					id: placeHolderStack[placeHolderStack.length - 1].placeHolderId,
					value: placeHolderStack[placeHolderStack.length - 1].placeHolderText,
					startColumn: resultIndex + 1 - placeHolderStack[placeHolderStack.length - 1].placeHolderText.length,
					endColumn: resultIndex + 1
				});

				// Insert our text into the previous placeholder
				placeHolderStack[placeHolderStack.length - 2].placeHolderText += placeHolderStack[placeHolderStack.length - 1].placeHolderText;
				placeHolderStack.pop();
				continue;
			}

			// Look for escapes
			if (/^\\./.test(restOfLine)) {
				if (restOfLine.charAt(1) === '{' || restOfLine.charAt(1) === '}' || restOfLine.charAt(1) === '\\') {
					++i; // Skip the escape slash and take the character literally
				} else {
					// invalid escapes
					placeHolderStack[placeHolderStack.length - 1].placeHolderText += line.charAt(i);
					++resultIndex;
					++i;
				}
			}

			//This is an escape sequence or not a special character, just insert it
			placeHolderStack[placeHolderStack.length - 1].placeHolderText += line.charAt(i);
			++resultIndex;
			++i;
		}

		// Sort the placeholder in order of apperance:
		placeHolders.sort( (a, b) => {
			if (a.startColumn < b.startColumn) {
				return -1;
			}
			if (a.startColumn > b.startColumn) {
				return 1;
			}
			if (a.endColumn < b.endColumn) {
				return -1;
			}
			if (a.endColumn > b.endColumn) {
				return 1;
			}
			return 0;
		});

		return {
			line: placeHolderStack[0].placeHolderText,
			placeHolders: placeHolders
		};
	}

	// This is used for both TextMate and Emmet
	public static convertExternalSnippet(snippet: string, snippetType: ExternalSnippetType) : string {
		var openBraces = 0;
		var convertedSnippet = '';
		var i = 0;
		var len = snippet.length;

		while (i < len) {
			var restOfLine = snippet.substr(i);

			// Cursor tab stop
			if (/^\$0/.test(restOfLine)) {
				i += 2;
				convertedSnippet += snippetType === ExternalSnippetType.EmmetSnippet ? '{{_}}' : '{{}}';
				continue;
			}
			if (/^\$\{0\}/.test(restOfLine)) {
				i += 4;
				convertedSnippet += snippetType === ExternalSnippetType.EmmetSnippet ? '{{_}}' :'{{}}';
				continue;
			}
			if (snippetType === ExternalSnippetType.EmmetSnippet && /^\|/.test(restOfLine)) {
				++i;
				convertedSnippet += '{{}}';
				continue;
			}

			// Tab stops
			var matches = restOfLine.match(/^\$(\d+)/);
			if (Array.isArray(matches) && matches.length === 2) {
				i += 1 + matches[1].length;
				convertedSnippet += '{{' + matches[1] + ':}}';
				continue;
			}
			matches = restOfLine.match(/^\$\{(\d+)\}/);
			if (Array.isArray(matches) && matches.length === 2) {
				i += 3 + matches[1].length;
				convertedSnippet += '{{' + matches[1] + ':}}';
				continue;
			}

			// Open brace patterns placeholder
			if (/^\${/.test(restOfLine)) {
				i += 2;
				++openBraces;
				convertedSnippet += '{{';
				continue;
			}

			// Close brace patterns placeholder
			if (openBraces > 0 && /^}/.test(restOfLine)) {
				i += 1;
				--openBraces;
				convertedSnippet += '}}';
				continue;
			}

			// Escapes
			if (/^\\./.test(restOfLine)) {
				i += 2;
				if (/^\\\$/.test(restOfLine)) {
					convertedSnippet += '$';
				} else {
					convertedSnippet += restOfLine.substr(0, 2);
				}
				continue;
			}

			// Escape braces that don't belong to a placeholder
			matches = restOfLine.match(/^({|})/);
			if (Array.isArray(matches) && matches.length === 2) {
				i += 1;
				convertedSnippet += '\\' + matches[1];
				continue;
			}

			i += 1;
			convertedSnippet += restOfLine.charAt(0);
		}

		return convertedSnippet;
	}

	private extractLineIndentation(str:string, maxColumn:number=Number.MAX_VALUE): string {
		var fullIndentation = strings.getLeadingWhitespace(str);

		if (fullIndentation.length > maxColumn - 1) {
			return fullIndentation.substring(0, maxColumn - 1);
		}

		return fullIndentation;
	}

	public bind(referenceLine:string, deltaLine:number, firstLineDeltaColumn:number, config:IIndentationNormalizer):ICodeSnippet {
		var resultLines: string[] = [];
		var resultPlaceHolders: IPlaceHolder[] = [];

		var referenceIndentation = this.extractLineIndentation(referenceLine, firstLineDeltaColumn + 1);
		var originalLine: string, originalLineIndentation: string, remainingLine: string, indentation: string;
		var i:number, len:number, j: number, lenJ: number;

		// Compute resultLines & keep deltaColumns as a reference for adjusting placeholders
		var deltaColumns: number[] = [];
		for (i = 0, len = this.lines.length; i < len; i++) {
			originalLine = this.lines[i];
			if (i === 0) {
				deltaColumns[i + 1] = firstLineDeltaColumn;
				resultLines[i] = originalLine;
			} else {
				originalLineIndentation = this.extractLineIndentation(originalLine);
				remainingLine = originalLine.substr(originalLineIndentation.length);
				indentation = config.normalizeIndentation(referenceIndentation + originalLineIndentation);
				deltaColumns[i + 1] = indentation.length - originalLineIndentation.length;
				resultLines[i] = indentation + remainingLine;
			}
		}

		// Compute resultPlaceHolders
		var originalPlaceHolder: IPlaceHolder, originalOccurence: editorCommon.IRange, resultOccurences: editorCommon.IRange[];
		for (i = 0, len = this.placeHolders.length; i < len; i++) {
			originalPlaceHolder = this.placeHolders[i];

			resultOccurences = [];
			for (j = 0, lenJ = originalPlaceHolder.occurences.length; j < lenJ; j++) {
				originalOccurence = originalPlaceHolder.occurences[j];

				resultOccurences.push({
					startLineNumber: originalOccurence.startLineNumber + deltaLine,
					startColumn: originalOccurence.startColumn + deltaColumns[originalOccurence.startLineNumber],
					endLineNumber: originalOccurence.endLineNumber + deltaLine,
					endColumn: originalOccurence.endColumn + deltaColumns[originalOccurence.endLineNumber]
				});
			}

			resultPlaceHolders.push({
				id: originalPlaceHolder.id,
				value: originalPlaceHolder.value,
				occurences: resultOccurences
			});
		}

		return {
			lines: resultLines,
			placeHolders: resultPlaceHolders,
			finishPlaceHolderIndex: this.finishPlaceHolderIndex
		};
	}
}


export interface ITrackedPlaceHolder {
	ranges: string[];
}


class InsertSnippetController {

	private editor: editorCommon.ICommonCodeEditor;
	private model: editorCommon.IModel;
	private finishPlaceHolderIndex:number;

	private listenersToRemove:IDisposable[];
	private trackedPlaceHolders:ITrackedPlaceHolder[];
	private placeHolderDecorations: string[];
	private currentPlaceHolderIndex:number;
	private highlightDecorationId:string;
	private isFinished:boolean;

	private _onStop: () => void;
	private _initialAlternativeVersionId: number;

	constructor(editor: editorCommon.ICommonCodeEditor, adaptedSnippet:ICodeSnippet, startLineNumber:number, initialAlternativeVersionId: number, onStop: () => void) {
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

	private initialize(adaptedSnippet:ICodeSnippet, startLineNumber:number): void {
		var i:number, len:number;

		for (i = 0, len = adaptedSnippet.placeHolders.length; i < len; i++) {
			var placeHolder = adaptedSnippet.placeHolders[i];

			var trackedRanges:string[] = [];
			for (var j = 0, lenJ = placeHolder.occurences.length; j < lenJ; j++) {
				trackedRanges.push(this.model.addTrackedRange(placeHolder.occurences[j], editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges));
			}

			this.trackedPlaceHolders.push({
				ranges: trackedRanges
			});
		}

		this.editor.changeDecorations((changeAccessor:editorCommon.IModelDecorationsChangeAccessor) => {
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
		this.listenersToRemove.push(this.editor.onDidChangeModelRawContent((e:editorCommon.IModelContentChangedEvent) => {
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

		this.listenersToRemove.push(this.editor.onDidChangeCursorPosition((e:editorCommon.ICursorPositionChangedEvent) => {
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
						this.editor.changeDecorations((changeAccessor:editorCommon.IModelDecorationsChangeAccessor) => {
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

	public onNextPlaceHolder():boolean {
		return this.changePlaceHolder(true);
	}

	public onPrevPlaceHolder():boolean {
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

	public onAccept():boolean {
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

	public onEscape():boolean {
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
		this._onStop();

		this.isFinished = true;

		this.listenersToRemove = dispose(this.listenersToRemove);

		for (var i = 0; i < this.trackedPlaceHolders.length; i++) {
			var ranges = this.trackedPlaceHolders[i].ranges;
			for (var j = 0; j < ranges.length; j++) {
				this.model.removeTrackedRange(ranges[j]);
			}
		}
		this.trackedPlaceHolders = [];

		this.editor.changeDecorations((changeAccessor:editorCommon.IModelDecorationsChangeAccessor) => {
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

export interface ISnippetController extends editorCommon.IEditorContribution {
	run(snippet: CodeSnippet, overwriteBefore: number, overwriteAfter: number, stripPrefix?:boolean): void;
	/**
	 * Inserts once `snippet` at the start of `replaceRange`, after deleting `replaceRange`.
	 */
	runWithReplaceRange(snippet: CodeSnippet, replaceRange:Range, undoStops:boolean): void;
	jumpToNextPlaceholder(): void;
	jumpToPrevPlaceholder(): void;
	acceptSnippet(): void;
	leaveSnippet(): void;
}

export function getSnippetController(editor: editorCommon.ICommonCodeEditor): ISnippetController {
	return <ISnippetController>editor.getContribution(SnippetController.ID);
}

interface IPreparedSnippet {
	typeRange: Range;
	adaptedSnippet: ICodeSnippet;
}

class SnippetController implements ISnippetController {

	public static ID = 'editor.contrib.snippetController';

	private _editor: editorCommon.ICommonCodeEditor;
	private _currentController: InsertSnippetController;
	private _inSnippetMode: IKeybindingContextKey<boolean>;

	constructor(editor: editorCommon.ICommonCodeEditor, @IKeybindingService keybindingService: IKeybindingService) {
		this._editor = editor;
		this._currentController = null;
		this._inSnippetMode = keybindingService.createKey(CONTEXT_SNIPPET_MODE, false);
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

	public run(snippet:CodeSnippet, overwriteBefore:number, overwriteAfter:number, stripPrefix?:boolean): void {
		this._runAndRestoreController(() => {
			if (snippet.placeHolders.length === 0) {
				// No placeholders => execute for all editor selections
				this._runForAllSelections(snippet, overwriteBefore, overwriteAfter, stripPrefix);
			} else {
				let prepared = SnippetController._prepareSnippet(this._editor, this._editor.getSelection(), snippet, overwriteBefore, overwriteAfter, stripPrefix);
				this._runPreparedSnippetForPrimarySelection(prepared, true);
			}
		});
	}

	public runWithReplaceRange(snippet: CodeSnippet, replaceRange:Range, undoStops:boolean): void {
		this._runAndRestoreController(() => {
			this._runPreparedSnippetForPrimarySelection({
				typeRange: replaceRange,
				adaptedSnippet: SnippetController._getAdaptedSnippet(this._editor.getModel(), snippet, replaceRange)
			}, undoStops);
		});
	}

	private _runAndRestoreController(callback:()=>void): void {
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

	private static _getTypeRangeForSelection(model:editorCommon.IModel, selection:Selection, overwriteBefore:number, overwriteAfter:number): Range {
		var typeRange:Range;
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

	private static _getAdaptedSnippet(model:editorCommon.IModel, snippet:CodeSnippet, typeRange:Range): ICodeSnippet {
		return snippet.bind(model.getLineContent(typeRange.startLineNumber), typeRange.startLineNumber - 1, typeRange.startColumn - 1, model);
	}

	private static _addCommandForSnippet(model:editorCommon.ITextModel, adaptedSnippet:ICodeSnippet, typeRange:Range, out:editorCommon.IIdentifiedSingleEditOperation[]): void {
		let insertText = adaptedSnippet.lines.join('\n');
		let currentText = model.getValueInRange(typeRange, editorCommon.EndOfLinePreference.LF);
		if (insertText !== currentText) {
			out.push(EditOperation.replaceMove(typeRange, insertText));
		}
	}

	private _runPreparedSnippetForPrimarySelection(prepared: IPreparedSnippet, undoStops:boolean): void {
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
			});
		}
	}

	private _runForAllSelections(snippet:CodeSnippet, overwriteBefore:number, overwriteAfter:number, stripPrefix?:boolean): void {
		let selections = this._editor.getSelections(),
			edits:editorCommon.IIdentifiedSingleEditOperation[] = [];

		for (let i = 0; i < selections.length; i++) {
			let prepared = SnippetController._prepareSnippet(this._editor, selections[i], snippet, overwriteBefore, overwriteAfter, stripPrefix);
			SnippetController._addCommandForSnippet(this._editor.getModel(), prepared.adaptedSnippet, prepared.typeRange, edits);
		}

		if (edits.length > 0) {
			this._editor.pushUndoStop();
			this._editor.executeEdits('editor.contrib.insertSnippetHelper', edits);
			this._editor.pushUndoStop();
		}
	}

	private static _prepareSnippet(editor:editorCommon.ICommonCodeEditor, selection:Selection, snippet:CodeSnippet, overwriteBefore:number, overwriteAfter:number, stripPrefix = true): { typeRange: Range; adaptedSnippet: ICodeSnippet; } {
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

	private static _getSnippetCursorOnly(snippet:ICodeSnippet):editorCommon.IPosition {

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

export var CONTEXT_SNIPPET_MODE = 'inSnippetMode';

var weight = CommonEditorRegistry.commandWeight(30);

CommonEditorRegistry.registerEditorContribution(SnippetController);
CommonEditorRegistry.registerEditorCommand('jumpToNextSnippetPlaceholder', weight, { primary: KeyCode.Tab }, true, CONTEXT_SNIPPET_MODE,(ctx, editor, args) => {
	getSnippetController(editor).jumpToNextPlaceholder();
});
CommonEditorRegistry.registerEditorCommand('jumpToPrevSnippetPlaceholder', weight, { primary: KeyMod.Shift | KeyCode.Tab }, true, CONTEXT_SNIPPET_MODE,(ctx, editor, args) => {
	getSnippetController(editor).jumpToPrevPlaceholder();
});
CommonEditorRegistry.registerEditorCommand('acceptSnippet', weight, { primary: KeyCode.Enter }, true, CONTEXT_SNIPPET_MODE,(ctx, editor, args) => {
	getSnippetController(editor).acceptSnippet();
});
CommonEditorRegistry.registerEditorCommand('leaveSnippet', weight, { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, true, CONTEXT_SNIPPET_MODE,(ctx, editor, args) => {
	getSnippetController(editor).leaveSnippet();
});
