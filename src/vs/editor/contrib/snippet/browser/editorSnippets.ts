/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { getLeadingWhitespace, compare } from 'vs/base/common/strings';
import { ICommonCodeEditor, TrackedRangeStickiness } from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { TextmateSnippet, Placeholder } from '../common/snippetParser';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';

class OneSnippet {

	private readonly _editor: ICommonCodeEditor;
	private readonly _placeholderDecoration = new Map<Placeholder, string>();
	private readonly _placeholderGroups: Placeholder[][];

	private _placeholderGroupsIdx: number;

	constructor(editor: ICommonCodeEditor, selection: Selection, snippet: TextmateSnippet) {

		this._editor = editor;

		// for each selection get the leading 'reference'-whitespace and adjust the snippet accordingly.
		const model = editor.getModel();
		const line = model.getLineContent(selection.startLineNumber);
		const leadingWhitespace = getLeadingWhitespace(line, 0, selection.startColumn - 1);
		snippet = snippet.withIndentation(whitespace => model.normalizeIndentation(leadingWhitespace + whitespace));

		const offset = model.getOffsetAt(selection.getStartPosition());

		this._editor.executeEdits('onesnieppt', [EditOperation.replaceMove(selection, snippet.value)]);

		// create a decoration (tracked range) for each placeholder
		this._editor.changeDecorations(accessor => {

			let lastRange: Range;

			for (const placeholder of snippet.getPlaceholders()) {
				const placeholderOffset = snippet.offset(placeholder);
				const placeholderLen = snippet.len(placeholder);
				const start = model.getPositionAt(offset + placeholderOffset);
				const end = model.getPositionAt(offset + placeholderOffset + placeholderLen);
				const range = new Range(start.lineNumber, start.column, end.lineNumber, end.column);

				let stickiness: TrackedRangeStickiness;
				if (lastRange && lastRange.getEndPosition().equals(range.getStartPosition())) {
					stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
				} else {
					stickiness = TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
				}

				const handle = accessor.addDecoration(range, { stickiness });
				this._placeholderDecoration.set(placeholder, handle);

				lastRange = range;
			}
		});

		this._placeholderGroupsIdx = -1;
		this._placeholderGroups = [];
		let lastBucket: Placeholder[];
		snippet.getPlaceholders().sort((a, b) => compare(a.name, b.name)).reverse().forEach(a => {
			if (!lastBucket || lastBucket[0].name !== a.name) {
				lastBucket = [a];
				this._placeholderGroups.push(lastBucket);
			} else {
				lastBucket.push(a);
			}
		});
	}

	dispose(): void {
		this._editor.changeDecorations(accessor => this._placeholderDecoration.forEach(handle => accessor.removeDecoration(handle)));
	}

	next(): Selection[] {
		this._placeholderGroupsIdx += 1;
		if (this._placeholderGroupsIdx >= this._placeholderGroups.length) {
			return undefined;
		}
		const ranges: Selection[] = [];
		for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
			const handle = this._placeholderDecoration.get(placeholder);
			const range = this._editor.getModel().getDecorationRange(handle);
			ranges.push(new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn));
		}
		return ranges;
	}
}

export class SnippetSession {

	private readonly _editor: ICommonCodeEditor;
	private readonly _snippets: OneSnippet[] = [];

	constructor(editor: ICommonCodeEditor, snippet: TextmateSnippet) {
		this._editor = editor;
		this._editor.pushUndoStop();
		for (const selection of editor.getSelections()) {
			const oneSnippet = new OneSnippet(editor, selection, snippet);
			this._snippets.push(oneSnippet);
		}
		this._editor.pushUndoStop();
		this.next();
	}

	next(): void {
		const selections: Selection[] = [];
		for (const snippet of this._snippets) {
			const sel = snippet.next();
			selections.push(...sel);
		}
		this._editor.setSelections(selections);
	}
}
