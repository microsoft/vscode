/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { ok } from 'vs/base/common/assert';
import { readonly, illegalArgument, V8CallSite } from 'vs/base/common/errors';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtHostDocumentData } from 'vs/workbench/api/node/extHostDocumentData';
import { Selection, Range, Position, EndOfLine, TextEditorRevealType, TextEditorLineNumbersStyle, SnippetString } from './extHostTypes';
import { ISingleEditOperation } from 'vs/editor/common/editorCommon';
import * as TypeConverters from './extHostTypeConverters';
import { MainThreadEditorsShape, MainThreadTelemetryShape, IResolvedTextEditorConfiguration, ITextEditorConfigurationUpdate } from './extHost.protocol';
import * as vscode from 'vscode';
import { TextEditorCursorStyle } from 'vs/editor/common/config/editorOptions';
import { IRange } from 'vs/editor/common/core/range';
import { containsCommandLink } from 'vs/base/common/htmlContent';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';

export class TextEditorDecorationType implements vscode.TextEditorDecorationType {

	private static _Keys = new IdGenerator('TextEditorDecorationType');

	private _proxy: MainThreadEditorsShape;
	public key: string;

	constructor(proxy: MainThreadEditorsShape, options: vscode.DecorationRenderOptions) {
		this.key = TextEditorDecorationType._Keys.nextId();
		this._proxy = proxy;
		this._proxy.$registerTextEditorDecorationType(this.key, <any>/* URI vs Uri */ options);
	}

	public dispose(): void {
		this._proxy.$removeTextEditorDecorationType(this.key);
	}
}

export interface ITextEditOperation {
	range: vscode.Range;
	text: string;
	forceMoveMarkers: boolean;
}

export interface IEditData {
	documentVersionId: number;
	edits: ITextEditOperation[];
	setEndOfLine: EndOfLine;
	undoStopBefore: boolean;
	undoStopAfter: boolean;
}

export class TextEditorEdit {

	private readonly _document: vscode.TextDocument;
	private readonly _documentVersionId: number;
	private _collectedEdits: ITextEditOperation[];
	private _setEndOfLine: EndOfLine;
	private readonly _undoStopBefore: boolean;
	private readonly _undoStopAfter: boolean;

	constructor(document: vscode.TextDocument, options: { undoStopBefore: boolean; undoStopAfter: boolean; }) {
		this._document = document;
		this._documentVersionId = document.version;
		this._collectedEdits = [];
		this._setEndOfLine = 0;
		this._undoStopBefore = options.undoStopBefore;
		this._undoStopAfter = options.undoStopAfter;
	}

	finalize(): IEditData {
		return {
			documentVersionId: this._documentVersionId,
			edits: this._collectedEdits,
			setEndOfLine: this._setEndOfLine,
			undoStopBefore: this._undoStopBefore,
			undoStopAfter: this._undoStopAfter
		};
	}

	replace(location: Position | Range | Selection, value: string): void {
		let range: Range = null;

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
		this._pushEdit(new Range(location, location), value, true);
	}

	delete(location: Range | Selection): void {
		let range: Range = null;

		if (location instanceof Range) {
			range = location;
		} else {
			throw new Error('Unrecognized location');
		}

		this._pushEdit(range, null, true);
	}

	private _pushEdit(range: Range, text: string, forceMoveMarkers: boolean): void {
		let validRange = this._document.validateRange(range);
		this._collectedEdits.push({
			range: validRange,
			text: text,
			forceMoveMarkers: forceMoveMarkers
		});
	}

	setEndOfLine(endOfLine: EndOfLine): void {
		if (endOfLine !== EndOfLine.LF && endOfLine !== EndOfLine.CRLF) {
			throw illegalArgument('endOfLine');
		}

		this._setEndOfLine = endOfLine;
	}
}


function deprecated(name: string, message: string = 'Refer to the documentation for further details.') {
	return (target: Object, key: string, descriptor: TypedPropertyDescriptor<any>) => {
		const originalMethod = descriptor.value;
		descriptor.value = function (...args: any[]) {
			console.warn(`[Deprecation Warning] method '${name}' is deprecated and should no longer be used. ${message}`);
			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}

export class ExtHostTextEditorOptions implements vscode.TextEditorOptions {

	private _proxy: MainThreadEditorsShape;
	private _id: string;

	private _tabSize: number;
	private _insertSpaces: boolean;
	private _cursorStyle: TextEditorCursorStyle;
	private _lineNumbers: TextEditorLineNumbersStyle;

	constructor(proxy: MainThreadEditorsShape, id: string, source: IResolvedTextEditorConfiguration) {
		this._proxy = proxy;
		this._id = id;
		this._accept(source);
	}

	public _accept(source: IResolvedTextEditorConfiguration): void {
		this._tabSize = source.tabSize;
		this._insertSpaces = source.insertSpaces;
		this._cursorStyle = source.cursorStyle;
		this._lineNumbers = source.lineNumbers;
	}

	public get tabSize(): number | string {
		return this._tabSize;
	}

	private _validateTabSize(value: number | string): number | 'auto' | null {
		if (value === 'auto') {
			return 'auto';
		}
		if (typeof value === 'number') {
			let r = Math.floor(value);
			return (r > 0 ? r : null);
		}
		if (typeof value === 'string') {
			let r = parseInt(value, 10);
			if (isNaN(r)) {
				return null;
			}
			return (r > 0 ? r : null);
		}
		return null;
	}

	public set tabSize(value: number | string) {
		let tabSize = this._validateTabSize(value);
		if (tabSize === null) {
			// ignore invalid call
			return;
		}
		if (typeof tabSize === 'number') {
			if (this._tabSize === tabSize) {
				// nothing to do
				return;
			}
			// reflect the new tabSize value immediately
			this._tabSize = tabSize;
		}
		warnOnError(this._proxy.$trySetOptions(this._id, {
			tabSize: tabSize
		}));
	}

	public get insertSpaces(): boolean | string {
		return this._insertSpaces;
	}

	private _validateInsertSpaces(value: boolean | string): boolean | 'auto' {
		if (value === 'auto') {
			return 'auto';
		}
		return (value === 'false' ? false : Boolean(value));
	}

	public set insertSpaces(value: boolean | string) {
		let insertSpaces = this._validateInsertSpaces(value);
		if (typeof insertSpaces === 'boolean') {
			if (this._insertSpaces === insertSpaces) {
				// nothing to do
				return;
			}
			// reflect the new insertSpaces value immediately
			this._insertSpaces = insertSpaces;
		}
		warnOnError(this._proxy.$trySetOptions(this._id, {
			insertSpaces: insertSpaces
		}));
	}

	public get cursorStyle(): TextEditorCursorStyle {
		return this._cursorStyle;
	}

	public set cursorStyle(value: TextEditorCursorStyle) {
		if (this._cursorStyle === value) {
			// nothing to do
			return;
		}
		this._cursorStyle = value;
		warnOnError(this._proxy.$trySetOptions(this._id, {
			cursorStyle: value
		}));
	}

	public get lineNumbers(): TextEditorLineNumbersStyle {
		return this._lineNumbers;
	}

	public set lineNumbers(value: TextEditorLineNumbersStyle) {
		if (this._lineNumbers === value) {
			// nothing to do
			return;
		}
		this._lineNumbers = value;
		warnOnError(this._proxy.$trySetOptions(this._id, {
			lineNumbers: value
		}));
	}

	public assign(newOptions: vscode.TextEditorOptions) {
		let bulkConfigurationUpdate: ITextEditorConfigurationUpdate = {};
		let hasUpdate = false;

		if (typeof newOptions.tabSize !== 'undefined') {
			let tabSize = this._validateTabSize(newOptions.tabSize);
			if (tabSize === 'auto') {
				hasUpdate = true;
				bulkConfigurationUpdate.tabSize = tabSize;
			} else if (typeof tabSize === 'number' && this._tabSize !== tabSize) {
				// reflect the new tabSize value immediately
				this._tabSize = tabSize;
				hasUpdate = true;
				bulkConfigurationUpdate.tabSize = tabSize;
			}
		}

		if (typeof newOptions.insertSpaces !== 'undefined') {
			let insertSpaces = this._validateInsertSpaces(newOptions.insertSpaces);
			if (insertSpaces === 'auto') {
				hasUpdate = true;
				bulkConfigurationUpdate.insertSpaces = insertSpaces;
			} else if (this._insertSpaces !== insertSpaces) {
				// reflect the new insertSpaces value immediately
				this._insertSpaces = insertSpaces;
				hasUpdate = true;
				bulkConfigurationUpdate.insertSpaces = insertSpaces;
			}
		}

		if (typeof newOptions.cursorStyle !== 'undefined') {
			if (this._cursorStyle !== newOptions.cursorStyle) {
				this._cursorStyle = newOptions.cursorStyle;
				hasUpdate = true;
				bulkConfigurationUpdate.cursorStyle = newOptions.cursorStyle;
			}
		}

		if (typeof newOptions.lineNumbers !== 'undefined') {
			if (this._lineNumbers !== newOptions.lineNumbers) {
				this._lineNumbers = newOptions.lineNumbers;
				hasUpdate = true;
				bulkConfigurationUpdate.lineNumbers = newOptions.lineNumbers;
			}
		}

		if (hasUpdate) {
			warnOnError(this._proxy.$trySetOptions(this._id, bulkConfigurationUpdate));
		}
	}
}

export class ExtHostTextEditor implements vscode.TextEditor {

	private readonly _proxy: MainThreadEditorsShape;
	private readonly _id: string;
	private readonly _documentData: ExtHostDocumentData;

	private _selections: Selection[];
	private _options: ExtHostTextEditorOptions;
	private _viewColumn: vscode.ViewColumn;
	private _disposed: boolean = false;

	get id(): string { return this._id; }

	constructor(proxy: MainThreadEditorsShape, id: string, document: ExtHostDocumentData, selections: Selection[], options: IResolvedTextEditorConfiguration, viewColumn: vscode.ViewColumn) {
		this._proxy = proxy;
		this._id = id;
		this._documentData = document;
		this._selections = selections;
		this._options = new ExtHostTextEditorOptions(this._proxy, this._id, options);
		this._viewColumn = viewColumn;
	}

	dispose() {
		ok(!this._disposed);
		this._disposed = true;
	}

	@deprecated('TextEditor.show') show(column: vscode.ViewColumn) {
		this._proxy.$tryShowEditor(this._id, TypeConverters.fromViewColumn(column));
	}

	@deprecated('TextEditor.hide') hide() {
		this._proxy.$tryHideEditor(this._id);
	}

	// ---- the document

	get document(): vscode.TextDocument {
		return this._documentData.document;
	}

	set document(value) {
		throw readonly('document');
	}

	// ---- options

	get options(): vscode.TextEditorOptions {
		return this._options;
	}

	set options(value: vscode.TextEditorOptions) {
		if (!this._disposed) {
			this._options.assign(value);
		}
	}

	_acceptOptions(options: IResolvedTextEditorConfiguration): void {
		ok(!this._disposed);
		this._options._accept(options);
	}

	// ---- view column

	get viewColumn(): vscode.ViewColumn {
		return this._viewColumn;
	}

	set viewColumn(value) {
		throw readonly('viewColumn');
	}

	_acceptViewColumn(value: vscode.ViewColumn) {
		ok(!this._disposed);
		this._viewColumn = value;
	}

	// ---- selections

	get selection(): Selection {
		return this._selections && this._selections[0];
	}

	set selection(value: Selection) {
		if (!(value instanceof Selection)) {
			throw illegalArgument('selection');
		}
		this._selections = [value];
		this._trySetSelection();
	}

	get selections(): Selection[] {
		return this._selections;
	}

	set selections(value: Selection[]) {
		if (!Array.isArray(value) || value.some(a => !(a instanceof Selection))) {
			throw illegalArgument('selections');
		}
		this._selections = value;
		this._trySetSelection();
	}

	setDecorations(decorationType: vscode.TextEditorDecorationType, ranges: Range[] | vscode.DecorationOptions[]): void {
		this._runOnProxy(
			() => this._proxy.$trySetDecorations(
				this._id,
				decorationType.key,
				TypeConverters.fromRangeOrRangeWithMessage(ranges)
			)
		);
	}

	revealRange(range: Range, revealType: vscode.TextEditorRevealType): void {
		this._runOnProxy(
			() => this._proxy.$tryRevealRange(
				this._id,
				TypeConverters.fromRange(range),
				(revealType || TextEditorRevealType.Default)
			)
		);
	}

	private _trySetSelection(): TPromise<vscode.TextEditor> {
		let selection = this._selections.map(TypeConverters.fromSelection);
		return this._runOnProxy(() => this._proxy.$trySetSelections(this._id, selection));
	}

	_acceptSelections(selections: Selection[]): void {
		ok(!this._disposed);
		this._selections = selections;
	}

	// ---- editing

	edit(callback: (edit: TextEditorEdit) => void, options: { undoStopBefore: boolean; undoStopAfter: boolean; } = { undoStopBefore: true, undoStopAfter: true }): Thenable<boolean> {
		if (this._disposed) {
			return TPromise.wrapError<boolean>(new Error('TextEditor#edit not possible on closed editors'));
		}
		let edit = new TextEditorEdit(this._documentData.document, options);
		callback(edit);
		return this._applyEdit(edit);
	}

	private _applyEdit(editBuilder: TextEditorEdit): TPromise<boolean> {
		let editData = editBuilder.finalize();

		// check that the edits are not overlapping (i.e. illegal)
		let editRanges = editData.edits.map(edit => edit.range);

		// sort ascending (by end and then by start)
		editRanges.sort((a, b) => {
			if (a.end.line === b.end.line) {
				if (a.end.character === b.end.character) {
					if (a.start.line === b.start.line) {
						return a.start.character - b.start.character;
					}
					return a.start.line - b.start.line;
				}
				return a.end.character - b.end.character;
			}
			return a.end.line - b.end.line;
		});

		// check that no edits are overlapping
		for (let i = 0, count = editRanges.length - 1; i < count; i++) {
			const rangeEnd = editRanges[i].end;
			const nextRangeStart = editRanges[i + 1].start;

			if (nextRangeStart.isBefore(rangeEnd)) {
				// overlapping ranges
				return TPromise.wrapError<boolean>(
					new Error('Overlapping ranges are not allowed!')
				);
			}
		}

		// prepare data for serialization
		let edits: ISingleEditOperation[] = editData.edits.map((edit) => {
			return {
				range: TypeConverters.fromRange(edit.range),
				text: edit.text,
				forceMoveMarkers: edit.forceMoveMarkers
			};
		});

		return this._proxy.$tryApplyEdits(this._id, editData.documentVersionId, edits, {
			setEndOfLine: editData.setEndOfLine,
			undoStopBefore: editData.undoStopBefore,
			undoStopAfter: editData.undoStopAfter
		});
	}

	insertSnippet(snippet: SnippetString, where?: Position | Position[] | Range | Range[], options: { undoStopBefore: boolean; undoStopAfter: boolean; } = { undoStopBefore: true, undoStopAfter: true }): Thenable<boolean> {
		if (this._disposed) {
			return TPromise.wrapError<boolean>(new Error('TextEditor#insertSnippet not possible on closed editors'));
		}
		let ranges: IRange[];

		if (!where || (Array.isArray(where) && where.length === 0)) {
			ranges = this._selections.map(TypeConverters.fromRange);

		} else if (where instanceof Position) {
			const { lineNumber, column } = TypeConverters.fromPosition(where);
			ranges = [{ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column }];

		} else if (where instanceof Range) {
			ranges = [TypeConverters.fromRange(where)];
		} else {
			ranges = [];
			for (const posOrRange of where) {
				if (posOrRange instanceof Range) {
					ranges.push(TypeConverters.fromRange(posOrRange));
				} else {
					const { lineNumber, column } = TypeConverters.fromPosition(posOrRange);
					ranges.push({ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column });
				}
			}
		}

		return this._proxy.$tryInsertSnippet(this._id, snippet.value, ranges, options);
	}

	// ---- util

	private _runOnProxy(callback: () => TPromise<any>): TPromise<ExtHostTextEditor> {
		if (this._disposed) {
			console.warn('TextEditor is closed/disposed');
			return TPromise.as(undefined);
		}
		return callback().then(() => this, err => {
			if (!(err instanceof Error && err.name === 'DISPOSED')) {
				console.warn(err);
			}
			return null;
		});
	}
}

export class ExtHostTextEditor2 extends ExtHostTextEditor {

	constructor(
		private readonly _extHostExtensions: ExtHostExtensionService,
		private readonly _mainThreadTelemetry: MainThreadTelemetryShape,
		proxy: MainThreadEditorsShape,
		id: string,
		document: ExtHostDocumentData,
		selections: Selection[],
		options: IResolvedTextEditorConfiguration,
		viewColumn: vscode.ViewColumn
	) {
		super(proxy, id, document, selections, options, viewColumn);
	}

	setDecorations(decorationType: vscode.TextEditorDecorationType, rangesOrOptions: Range[] | vscode.DecorationOptions[]): void {
		// (1) find out if this decoration is important for us
		let usesCommandLink = false;
		outer: for (const rangeOrOption of rangesOrOptions) {
			if (Range.isRange(rangeOrOption)) {
				break;
			}
			if (typeof rangeOrOption.hoverMessage === 'string' && containsCommandLink(rangeOrOption.hoverMessage)) {
				usesCommandLink = true;
				break;
			} else if (Array.isArray(rangeOrOption.hoverMessage)) {
				for (const message of rangeOrOption.hoverMessage) {
					if (typeof message === 'string' && containsCommandLink(message)) {
						usesCommandLink = true;
						break outer;
					}
				}
			}
		}
		// (2) send event for important decorations
		if (usesCommandLink) {
			let tag = new Error();
			this._extHostExtensions.getExtensionPathIndex().then(index => {
				const oldHandler = (<any>Error).prepareStackTrace;
				(<any>Error).prepareStackTrace = (error: Error, stackTrace: V8CallSite[]) => {
					for (const call of stackTrace) {
						const extension = index.findSubstr(call.getFileName());
						if (extension) {
							this._mainThreadTelemetry.$publicLog('usesCommandLink', {
								extension: extension.id,
								from: 'decoration',
							});
							return;
						}
					}
				};
				// it all happens here...
				// tslint:disable-next-line:no-unused-expression
				tag.stack;
				(<any>Error).prepareStackTrace = oldHandler;
			});
		}

		// (3) do it
		super.setDecorations(decorationType, rangesOrOptions);
	}
}


function warnOnError(promise: TPromise<any>): void {
	promise.then(null, (err) => {
		console.warn(err);
	});
}
