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
import { dispose } from 'vs/base/common/lifecycle';

class OneSnippet {

	private readonly _editor: ICommonCodeEditor;
	private readonly _snippet: TextmateSnippet;
	private readonly _offset: number;

	private _snippetDecoration: string;
	private _placeholderDecorations: Map<Placeholder, string>;
	private _placeholderGroups: Placeholder[][];
	private _placeholderGroupsIdx: number;

	private static readonly _decor = {
		active: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, className: 'snippet-placeholder' },
		inactive: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'snippet-placeholder' },
		activeFinal: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'finish-snippet-placeholder' },
		inactiveFinal: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'finish-snippet-placeholder' },
		snippet: <IModelDecorationOptions>{ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
	};

	constructor(editor: ICommonCodeEditor, snippet: TextmateSnippet, offset: number) {
		this._editor = editor;
		this._snippet = snippet;
		this._offset = offset;
	}

	dispose(): void {
		if (!this._placeholderDecorations) {
			return;
		}
		this._editor.changeDecorations(accessor => this._placeholderDecorations.forEach(handle => accessor.removeDecoration(handle)));
		this._placeholderGroups.length = 0;
	}

	private _init(): void {

		if (this._placeholderDecorations) {
			// already initialized
			return;
		}

		this._placeholderDecorations = new Map<Placeholder, string>();
		const model = this._editor.getModel();

		this._editor.changeDecorations(accessor => {

			// create one decoration for the whole snippets
			const range = Range.fromPositions(
				model.getPositionAt(this._offset),
				model.getPositionAt(this._offset + this._snippet.text.length)
			);
			this._snippetDecoration = accessor.addDecoration(range, OneSnippet._decor.snippet);

			// create a decoration for each placeholder
			for (const placeholder of this._snippet.getPlaceholders()) {
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

		this._placeholderGroupsIdx = -1;
		this._placeholderGroups = [];
		let lastBucket: Placeholder[];
		this._snippet.getPlaceholders().sort(Placeholder.compareByIndex).forEach(a => {
			if (!lastBucket || lastBucket[0].index !== a.index) {
				lastBucket = [a];
				this._placeholderGroups.push(lastBucket);
			} else {
				lastBucket.push(a);
			}
		});
	}

	move(fwd: boolean): Selection[] {

		this._init();

		let prevGroupsIdx = -1;

		if (fwd && this._placeholderGroupsIdx < this._placeholderGroups.length - 1) {
			prevGroupsIdx = this._placeholderGroupsIdx;
			this._placeholderGroupsIdx += 1;

		} else if (!fwd && this._placeholderGroupsIdx > 0) {
			prevGroupsIdx = this._placeholderGroupsIdx;
			this._placeholderGroupsIdx -= 1;
		}

		return this._editor.getModel().changeDecorations(accessor => {

			// change stickness to never grow when typing at its edges
			// so that in-active tabstops never grow
			if (prevGroupsIdx !== -1) {
				for (const placeholder of this._placeholderGroups[prevGroupsIdx]) {
					const id = this._placeholderDecorations.get(placeholder);
					accessor.changeDecorationOptions(id, OneSnippet._decor.inactive);
				}
			}

			// change stickiness to always grow when typing at its edges
			// because these decorations represent the currently active
			// tabstop. Special case: reaching the final tab stop
			const selections: Selection[] = [];
			for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
				const id = this._placeholderDecorations.get(placeholder);
				const range = this._editor.getModel().getDecorationRange(id);
				selections.push(new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn));

				accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? OneSnippet._decor.activeFinal : OneSnippet._decor.active);
			}
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

	get range() {
		return this._snippetDecoration !== undefined && this._editor.getModel().getDecorationRange(this._snippetDecoration);
	}
}

export class SnippetSession {

	static normalizeWhitespace(model: IModel, position: IPosition, template: string): string {

		const line = model.getLineContent(position.lineNumber);
		const lineLeadingWhitespace = getLeadingWhitespace(line, 0, position.column - 1);
		const templateLines = template.split(/\r\n|\r|\n/);

		for (let i = 0; i < templateLines.length; i++) {
			let templateLeadingWhitespace = getLeadingWhitespace(templateLines[i]);
			if (templateLeadingWhitespace.length > 0) {
				templateLines[i] = model.normalizeIndentation(lineLeadingWhitespace + templateLeadingWhitespace) + templateLines[i].substr(templateLeadingWhitespace.length);
			}
		}
		return templateLines.join(model.getEOL());
	}

	static adjustRange(model: IModel, range: Range, overwriteBefore: number, overwriteAfter: number): Range {
		if (overwriteBefore !== 0 || overwriteAfter !== 0) {
			let { startLineNumber, startColumn, endLineNumber, endColumn } = range;
			startColumn -= overwriteBefore;
			endColumn += overwriteAfter;

			range = Range.plusRange(range, {
				startLineNumber,
				startColumn,
				endLineNumber,
				endColumn,
			});
			range = model.validateRange(range);
		}
		return range;
	}

	private readonly _editor: ICommonCodeEditor;
	private readonly _template: string;
	private readonly _overwriteBefore: number;
	private readonly _overwriteAfter: number;
	private readonly _snippets: OneSnippet[];

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
		let delta = 0;
		let edits: IIdentifiedSingleEditOperation[] = [];
		let model = this._editor.getModel();

		for (const selection of this._editor.getSelections()) {
			const range = SnippetSession.adjustRange(model, selection, this._overwriteBefore, this._overwriteAfter);
			const start = range.getStartPosition();
			const adjustedTemplate = SnippetSession.normalizeWhitespace(model, start, this._template);

			const snippet = SnippetParser.parse(adjustedTemplate);
			const offset = model.getOffsetAt(start) + delta;

			edits.push(EditOperation.replaceMove(range, snippet.text));
			this._snippets.push(new OneSnippet(this._editor, snippet, offset));

			delta += snippet.text.length - model.getValueLengthInRange(range);
		}

		// make insert edit and start with first selections
		const newSelections = model.pushEditOperations(this._editor.getSelections(), edits, () => this._move(true));
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

	validateSelections(): boolean {
		const selections = this._editor.getSelections();
		if (selections.length < this._snippets.length) {
			return false;
		}

		for (const selection of selections) {
			let found = false;
			for (const snippet of this._snippets) {
				if (snippet.range.containsRange(selection)) {
					found = true;
					break;
				}
			}
			if (!found) {
				return false;
			}
		}

		return true;
	}
}
