/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ReadonlyError, illegalArgument } from '../../../vs/base/common/errors';
import { Position } from '../../../vs/workbench/api/common/extHostTypes/position';
import { Range } from '../../../vs/workbench/api/common/extHostTypes/range';
import { Selection } from '../../../vs/workbench/api/common/extHostTypes/selection';
import { SnippetString } from '../../../vs/workbench/api/common/extHostTypes/snippetString';
import { EndOfLine } from '../../../vs/workbench/api/common/extHostTypes/textEdit';

interface ITextEditOperation {
	range: vscode.Range;
	text: string | null;
	forceMoveMarkers: boolean;
}

interface IEditData {
	documentVersionId: number;
	edits: ITextEditOperation[];
	setEndOfLine: vscode.EndOfLine | undefined;
	undoStopBefore: boolean;
	undoStopAfter: boolean;
}

class TextEditorEdit {

	private readonly _document: vscode.TextDocument;
	private readonly _documentVersionId: number;
	private readonly _undoStopBefore: boolean;
	private readonly _undoStopAfter: boolean;
	private _collectedEdits: ITextEditOperation[] = [];
	private _setEndOfLine: vscode.EndOfLine | undefined = undefined;
	private _finalized: boolean = false;

	constructor(document: vscode.TextDocument, options: { undoStopBefore: boolean; undoStopAfter: boolean }) {
		this._document = document;
		this._documentVersionId = document.version;
		this._undoStopBefore = options.undoStopBefore;
		this._undoStopAfter = options.undoStopAfter;
	}

	finalize(): IEditData {
		this._finalized = true;
		return {
			documentVersionId: this._documentVersionId,
			edits: this._collectedEdits,
			setEndOfLine: this._setEndOfLine,
			undoStopBefore: this._undoStopBefore,
			undoStopAfter: this._undoStopAfter
		};
	}

	private _throwIfFinalized() {
		if (this._finalized) {
			throw new Error('Edit is only valid while callback runs');
		}
	}

	replace(location: Position | Range | Selection, value: string): void {
		this._throwIfFinalized();
		let range: Range | null = null;

		if (location instanceof Position) {
			range = new Range(location, location);
		} else if (location instanceof Range) {
			range = location;
		} else {
			throw new Error('Unrecognized location');
		}

		this._pushEdit(range, value, false);
	}

	insert(location: Position, value: string): void {
		this._throwIfFinalized();
		this._pushEdit(new Range(location, location), value, true);
	}

	delete(location: Range | Selection): void {
		this._throwIfFinalized();
		let range: Range | null = null;

		if (location instanceof Range) {
			range = location;
		} else {
			throw new Error('Unrecognized location');
		}

		this._pushEdit(range, null, true);
	}

	private _pushEdit(range: Range, text: string | null, forceMoveMarkers: boolean): void {
		const validRange = this._document.validateRange(range);
		this._collectedEdits.push({
			range: validRange,
			text: text,
			forceMoveMarkers: forceMoveMarkers
		});
	}

	setEndOfLine(endOfLine: vscode.EndOfLine): void {
		this._throwIfFinalized();
		if (endOfLine !== EndOfLine.LF && endOfLine !== EndOfLine.CRLF) {
			throw illegalArgument('endOfLine');
		}

		this._setEndOfLine = endOfLine;
	}
}

export class ExtHostTextEditor {

	private _selections: vscode.Selection[];
	private _options: vscode.TextEditorOptions;
	private _visibleRanges: vscode.Range[];
	private _viewColumn: vscode.ViewColumn | undefined;

	readonly value: vscode.TextEditor;

	constructor(
		document: vscode.TextDocument,
		selections: vscode.Selection[],
		options: vscode.TextEditorOptions,
		visibleRanges: vscode.Range[],
		viewColumn: vscode.ViewColumn | undefined
	) {
		this._selections = selections;
		this._options = options;
		this._visibleRanges = visibleRanges;
		this._viewColumn = viewColumn;

		const that = this;

		this.value = Object.freeze({
			get document(): vscode.TextDocument {
				return document;
			},
			set document(_value) {
				throw new ReadonlyError('document');
			},
			// --- selection
			get selection(): vscode.Selection {
				return that._selections && that._selections[0];
			},
			set selection(value: Selection) {
				if (!(value instanceof Selection)) {
					throw illegalArgument('selection');
				}
				that._selections = [value];
			},
			get selections(): vscode.Selection[] {
				return that._selections;
			},
			set selections(value: Selection[]) {
				if (!Array.isArray(value) || value.some(a => !(a instanceof Selection))) {
					throw illegalArgument('selections');
				}
				that._selections = value;
			},
			// --- visible ranges
			get visibleRanges(): vscode.Range[] {
				return that._visibleRanges;
			},
			set visibleRanges(_value: Range[]) {
				throw new ReadonlyError('visibleRanges');
			},
			// --- options
			get options(): vscode.TextEditorOptions {
				return that._options;
			},
			set options(value: vscode.TextEditorOptions) {
				throw new Error('Not implemented');
			},
			// --- view column
			get viewColumn(): vscode.ViewColumn | undefined {
				return that._viewColumn;
			},
			set viewColumn(_value) {
				throw new ReadonlyError('viewColumn');
			},
			// --- edit
			edit(callback: (edit: TextEditorEdit) => void, options: { undoStopBefore: boolean; undoStopAfter: boolean } = { undoStopBefore: true, undoStopAfter: true }): Promise<boolean> {
				throw new Error('Not implemented');
			},
			// --- snippet edit
			insertSnippet(snippet: SnippetString, where?: Position | readonly Position[] | Range | readonly Range[], options: { undoStopBefore: boolean; undoStopAfter: boolean } = { undoStopBefore: true, undoStopAfter: true }): Promise<boolean> {
				throw new Error('Not implemented');
			},
			setDecorations(decorationType: vscode.TextEditorDecorationType, ranges: Range[] | vscode.DecorationOptions[]): void {
				throw new Error('Not implemented');
			},
			revealRange(range: Range, revealType: vscode.TextEditorRevealType): void {
				throw new Error('Not implemented');
			},
			show(column: vscode.ViewColumn) {
				throw new Error('Not implemented');
			},
			hide() {
				throw new Error('Not implemented');
			}
		});
	}

	_acceptOptions(options: vscode.TextEditorOptions): void {
		this._options = options;
	}

	_acceptVisibleRanges(value: readonly vscode.Range[]): void {
		this._visibleRanges = value.slice(0);
	}

	_acceptViewColumn(value: vscode.ViewColumn) {
		this._viewColumn = value;
	}

	_acceptSelections(selections: vscode.Selection[]): void {
		this._selections = selections;
	}
}
