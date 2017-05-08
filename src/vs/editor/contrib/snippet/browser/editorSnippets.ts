/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { getLeadingWhitespace, compare } from 'vs/base/common/strings';
import { ICommonCodeEditor, IModel, TrackedRangeStickiness, IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
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

	private _placeholderDecorations: Map<Placeholder, string>;
	private _placeholderGroups: Placeholder[][];
	private _placeholderGroupsIdx: number;

	constructor(editor: ICommonCodeEditor, snippet: TextmateSnippet, offset: number) {
		this._editor = editor;
		this._snippet = snippet;
		this._offset = offset;
	}

	dispose(): void {
		if (this._placeholderDecorations) {
			this._editor.changeDecorations(accessor => this._placeholderDecorations.forEach(handle => accessor.removeDecoration(handle)));
		}
	}

	private _init(): void {

		if (this._placeholderDecorations) {
			// already initialized
			return;
		}

		this._placeholderDecorations = new Map<Placeholder, string>();
		const model = this._editor.getModel();

		// create a decoration (tracked range) for each placeholder
		this._editor.changeDecorations(accessor => {

			let lastRange: Range;

			for (const placeholder of this._snippet.getPlaceholders()) {
				const placeholderOffset = this._snippet.offset(placeholder);
				const placeholderLen = this._snippet.len(placeholder);
				const start = model.getPositionAt(this._offset + placeholderOffset);
				const end = model.getPositionAt(this._offset + placeholderOffset + placeholderLen);
				const range = new Range(start.lineNumber, start.column, end.lineNumber, end.column);

				let stickiness: TrackedRangeStickiness;
				if (lastRange && lastRange.getEndPosition().equals(range.getStartPosition())) {
					stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
				} else {
					stickiness = TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
				}

				const handle = accessor.addDecoration(range, { stickiness });
				this._placeholderDecorations.set(placeholder, handle);

				lastRange = range;
			}
		});

		this._placeholderGroupsIdx = -1;
		this._placeholderGroups = [];
		let lastBucket: Placeholder[];
		this._snippet.getPlaceholders().sort((a, b) => compare(a.name, b.name)).reverse().forEach(a => {
			if (!lastBucket || lastBucket[0].name !== a.name) {
				lastBucket = [a];
				this._placeholderGroups.push(lastBucket);
			} else {
				lastBucket.push(a);
			}
		});
	}

	move(fwd: boolean): Selection[] {

		this._init();

		if (fwd && this._placeholderGroupsIdx < this._placeholderGroups.length - 1) {
			this._placeholderGroupsIdx += 1;
			return this._getCurrentPlaceholderSelections();

		} else if (!fwd && this._placeholderGroupsIdx > 0) {
			this._placeholderGroupsIdx -= 1;
			return this._getCurrentPlaceholderSelections();

		} else {
			return undefined;
		}
	}


	private _getCurrentPlaceholderSelections(): Selection[] {
		const selections: Selection[] = [];
		for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
			const handle = this._placeholderDecorations.get(placeholder);
			const range = this._editor.getModel().getDecorationRange(handle);
			selections.push(new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn));
		}
		return selections;
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

	private readonly _editor: ICommonCodeEditor;
	private readonly _snippets: OneSnippet[];

	constructor(editor: ICommonCodeEditor, template: string) {
		this._editor = editor;
		this._snippets = [];

		let delta = 0;
		let edits: IIdentifiedSingleEditOperation[] = [];
		let model = editor.getModel();

		for (const selection of editor.getSelections()) {
			const start = selection.getStartPosition();
			const adjustedTemplate = SnippetSession.normalizeWhitespace(model, start, template);

			const snippet = SnippetParser.parse(adjustedTemplate);
			const offset = model.getOffsetAt(start) + delta;

			edits.push(EditOperation.replaceMove(selection, snippet.value));
			this._snippets.push(new OneSnippet(editor, snippet, offset));

			delta += snippet.value.length - model.getValueLengthInRange(selection);
		}

		// make insert edit and start with first selections
		const newSelections = model.pushEditOperations(editor.getSelections(), edits, () => this._move(true));
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
			if (!oneSelection) {
				if (fwd) {
					this.stop();
				}
				return this._editor.getSelections();
			}
			selections.push(...oneSelection);
		}
		return selections;
	}

	stop(): void {
		dispose(this._snippets);
	}
}
