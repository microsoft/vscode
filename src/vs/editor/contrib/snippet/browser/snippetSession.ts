/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { getLeadingWhitespace } from 'vs/base/common/strings';
import { ICommonCodeEditor, IModel, IModelDecorationOptions, TrackedRangeStickiness, IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { TextmateSnippet, Placeholder, SnippetParser } from '../common/snippetParser';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';
import { IPosition } from 'vs/editor/common/core/position';
import { groupBy } from 'vs/base/common/arrays';
import { dispose } from 'vs/base/common/lifecycle';
import { EditorSnippetVariableResolver } from "vs/editor/contrib/snippet/common/snippetVariables";

export class OneSnippet {

	private readonly _editor: ICommonCodeEditor;
	private readonly _snippet: TextmateSnippet;
	private readonly _offset: number;

	private _placeholderDecorations: Map<Placeholder, string>;
	private _placeholderGroups: Placeholder[][];
	private _placeholderGroupsIdx: number;

	private static readonly _decor = {
		active: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, className: 'snippet-placeholder' },
		inactive: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'snippet-placeholder' },
		activeFinal: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'finish-snippet-placeholder' },
		inactiveFinal: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'finish-snippet-placeholder' },
	};

	constructor(editor: ICommonCodeEditor, snippet: TextmateSnippet, offset: number) {
		this._editor = editor;
		this._snippet = snippet;
		this._offset = offset;

		this._placeholderGroups = groupBy(snippet.placeholders, Placeholder.compareByIndex);
		this._placeholderGroupsIdx = -1;
	}

	dispose(): void {
		if (this._placeholderDecorations) {
			this._editor.changeDecorations(accessor => this._placeholderDecorations.forEach(handle => accessor.removeDecoration(handle)));
		}
		this._placeholderGroups.length = 0;
	}

	private _initDecorations(): void {

		if (this._placeholderDecorations) {
			// already initialized
			return;
		}

		this._placeholderDecorations = new Map<Placeholder, string>();
		const model = this._editor.getModel();

		this._editor.changeDecorations(accessor => {
			// create a decoration for each placeholder
			for (const placeholder of this._snippet.placeholders) {
				const placeholderOffset = this._snippet.offset(placeholder);
				const placeholderLen = this._snippet.len(placeholder);
				const range = Range.fromPositions(
					model.getPositionAt(this._offset + placeholderOffset),
					model.getPositionAt(this._offset + placeholderOffset + placeholderLen)
				);
				const options = placeholder.isFinalTabstop ? OneSnippet._decor.inactiveFinal : OneSnippet._decor.inactive;
				const handle = accessor.addDecoration(range, options);
				this._placeholderDecorations.set(placeholder, handle);
			}
		});
	}

	move(fwd: boolean): Selection[] {

		this._initDecorations();

		if (fwd && this._placeholderGroupsIdx < this._placeholderGroups.length - 1) {
			this._placeholderGroupsIdx += 1;

		} else if (!fwd && this._placeholderGroupsIdx > 0) {
			this._placeholderGroupsIdx -= 1;

		} else {
			// the selection of the current placeholder might
			// not acurate any more -> simply restore it
		}

		return this._editor.getModel().changeDecorations(accessor => {

			const activePlaceholders = new Set<Placeholder>();

			// change stickiness to always grow when typing at its edges
			// because these decorations represent the currently active
			// tabstop.
			// Special case #1: reaching the final tabstop
			// Special case #2: placeholders enclosing active placeholders
			const selections: Selection[] = [];
			for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
				const id = this._placeholderDecorations.get(placeholder);
				const range = this._editor.getModel().getDecorationRange(id);
				selections.push(new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn));

				accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? OneSnippet._decor.activeFinal : OneSnippet._decor.active);
				activePlaceholders.add(placeholder);

				for (const enclosingPlaceholder of this._snippet.enclosingPlaceholders(placeholder)) {
					const id = this._placeholderDecorations.get(enclosingPlaceholder);
					accessor.changeDecorationOptions(id, enclosingPlaceholder.isFinalTabstop ? OneSnippet._decor.activeFinal : OneSnippet._decor.active);
					activePlaceholders.add(enclosingPlaceholder);
				}
			}

			// change stickness to never grow when typing at its edges
			// so that in-active tabstops never grow
			this._placeholderDecorations.forEach((id, placeholder) => {
				if (!activePlaceholders.has(placeholder)) {
					accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? OneSnippet._decor.inactiveFinal : OneSnippet._decor.inactive);
				}
			});

			return selections;
		});
	}

	get isAtFirstPlaceholder() {
		return this._placeholderGroupsIdx === 0;
	}

	get isAtFinalPlaceholder() {
		if (this._placeholderGroupsIdx < 0) {
			return false;
		} else {
			return this._placeholderGroups[this._placeholderGroupsIdx][0].isFinalTabstop;
		}
	}

	get hasPlaceholder() {
		return this._snippet.placeholders.length > 0;
	}

	get placeholderRanges() {
		const ret: Range[] = [];
		this._placeholderDecorations.forEach((id, placeholder) => {
			if (!placeholder.isFinalTabstop) {
				const range = this._editor.getModel().getDecorationRange(id);
				if (range) {
					ret.push(range);
				}
			}
		});
		return ret;
	}
}

export class SnippetSession {

	static adjustWhitespace(model: IModel, position: IPosition, template: string): string {

		const line = model.getLineContent(position.lineNumber);
		const lineLeadingWhitespace = getLeadingWhitespace(line, 0, position.column - 1);
		const templateLines = template.split(/\r\n|\r|\n/);

		for (let i = 1; i < templateLines.length; i++) {
			let templateLeadingWhitespace = getLeadingWhitespace(templateLines[i]);
			templateLines[i] = model.normalizeIndentation(lineLeadingWhitespace + templateLeadingWhitespace) + templateLines[i].substr(templateLeadingWhitespace.length);
		}
		return templateLines.join(model.getEOL());
	}

	static adjustSelection(model: IModel, selection: Selection, overwriteBefore: number, overwriteAfter: number): Selection {
		if (overwriteBefore !== 0 || overwriteAfter !== 0) {
			let { startLineNumber, startColumn, endLineNumber, endColumn } = selection;
			startColumn -= overwriteBefore;
			endColumn += overwriteAfter;

			const range = model.validateRange(Range.plusRange(selection, {
				startLineNumber,
				startColumn,
				endLineNumber,
				endColumn,
			}));

			selection = Selection.createWithDirection(
				range.startLineNumber, range.startColumn,
				range.endLineNumber, range.endColumn,
				selection.getDirection()
			);
		}
		return selection;
	}

	static makeInsertEditsAndSnippets(editor: ICommonCodeEditor, template: string, overwriteBefore: number = 0, overwriteAfter: number = 0): { edits: IIdentifiedSingleEditOperation[], snippets: OneSnippet[] } {

		let delta = 0;
		let edits: IIdentifiedSingleEditOperation[] = [];
		let snippets: OneSnippet[] = [];
		let model = editor.getModel();

		// know what text the overwrite[Before|After] extensions
		// of the primary curser have selected because only when
		// secondary selections extend to the same text we can grow them
		let firstBeforeText = model.getValueInRange(SnippetSession.adjustSelection(model, editor.getSelection(), overwriteBefore, 0));
		let firstAfterText = model.getValueInRange(SnippetSession.adjustSelection(model, editor.getSelection(), 0, overwriteAfter));

		// sort selections by their start position but remeber
		// the original index. that allows you to create correct
		// offset-based selection logic without changing the
		// primary selection
		const indexedSelection = editor.getSelections()
			.map((selection, idx) => ({ selection, idx }))
			.sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection));

		for (const { selection, idx } of indexedSelection) {

			// extend selection with the `overwriteBefore` and `overwriteAfter` and then
			// compare if this matches the extensions of the primary selection
			let extensionBefore = SnippetSession.adjustSelection(model, selection, overwriteBefore, 0);
			let extensionAfter = SnippetSession.adjustSelection(model, selection, 0, overwriteAfter);
			if (firstBeforeText !== model.getValueInRange(extensionBefore)) {
				extensionBefore = selection;
			}
			if (firstAfterText !== model.getValueInRange(extensionAfter)) {
				extensionAfter = selection;
			}

			// merge the before and after selection into one
			const snippetSelection = selection
				.setStartPosition(extensionBefore.startLineNumber, extensionBefore.startColumn)
				.setEndPosition(extensionAfter.endLineNumber, extensionAfter.endColumn);

			// adjust the template string to match the indentation and
			// whitespace rules of this insert location (can be different for each cursor)
			const start = snippetSelection.getStartPosition();
			const adjustedTemplate = SnippetSession.adjustWhitespace(model, start, template);

			const snippet = SnippetParser.parse(adjustedTemplate).resolveVariables(new EditorSnippetVariableResolver(model, snippetSelection));
			const offset = model.getOffsetAt(start) + delta;
			delta += snippet.text.length - model.getValueLengthInRange(snippetSelection);

			// store snippets with the index of their originating selection.
			// that ensures the primiary cursor stays primary despite not being
			// the one with lowest start position
			edits[idx] = EditOperation.replaceMove(snippetSelection, snippet.text);
			snippets[idx] = new OneSnippet(editor, snippet, offset);
		}

		return { edits, snippets };
	}

	private readonly _editor: ICommonCodeEditor;
	private readonly _template: string;
	private readonly _overwriteBefore: number;
	private readonly _overwriteAfter: number;
	private _snippets: OneSnippet[];

	constructor(editor: ICommonCodeEditor, template: string, overwriteBefore: number = 0, overwriteAfter: number = 0) {
		this._editor = editor;
		this._template = template;
		this._overwriteBefore = overwriteBefore;
		this._overwriteAfter = overwriteAfter;
		this._snippets = [];
	}

	dispose(): void {
		dispose(this._snippets);
	}

	insert(): void {

		const model = this._editor.getModel();
		const { edits, snippets } = SnippetSession.makeInsertEditsAndSnippets(
			this._editor, this._template, this._overwriteBefore, this._overwriteAfter
		);

		// keep snippets around
		this._snippets = snippets;

		// make insert edit and start with first selections
		const newSelections = model.pushEditOperations(this._editor.getSelections(), edits, undoEdits => {
			if (this._snippets[0].hasPlaceholder) {
				return this._move(true);
			} else {
				return undoEdits.map(edit => Selection.fromPositions(edit.range.getEndPosition()));
			}
		});
		this._editor.setSelections(newSelections);
	}

	next(): void {
		const newSelections = this._move(true);
		this._editor.setSelections(newSelections);
	}

	prev(): void {
		const newSelections = this._move(false);
		this._editor.setSelections(newSelections);
	}

	private _move(fwd: boolean): Selection[] {
		const selections: Selection[] = [];
		for (const snippet of this._snippets) {
			const oneSelection = snippet.move(fwd);
			selections.push(...oneSelection);
		}
		return selections;
	}

	get isAtFirstPlaceholder() {
		return this._snippets[0].isAtFirstPlaceholder;
	}

	get isAtFinalPlaceholder() {
		return this._snippets[0].isAtFinalPlaceholder;
	}

	get hasPlaceholder() {
		return this._snippets[0].hasPlaceholder;
	}

	isSelectionWithPlaceholders(): boolean {
		const selections = this._editor.getSelections();
		if (selections.length < this._snippets.length) {
			// this means we started snippet mode with N
			// selections and have M (N > M) selections.
			// So one snippet is without selection -> cancel
			return false;
		}

		const ranges: Range[] = [];
		for (const snippet of this._snippets) {
			ranges.push(...snippet.placeholderRanges);
		}

		if (selections.length > ranges.length) {
			return false;
		}

		// sort selections and ranges by their start position
		// and then make sure each selection is contained by
		// a placeholder range
		selections.sort(Range.compareRangesUsingStarts);
		ranges.sort(Range.compareRangesUsingStarts);

		outer: for (const selection of selections) {
			let range: Range;
			while (range = ranges.shift()) {
				if (range.containsRange(selection)) {
					continue outer;
				}
			}
			return false;
		}

		return true;
	}
}
