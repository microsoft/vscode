/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import * as objects from 'vs/base/common/objects';
import {Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {Selection, Range, Position, SymbolKind, DiagnosticSeverity, ViewColumn} from './pluginHostTypes';
import {IPosition, ISelection, IRange, IRangeWithMessage} from 'vs/editor/common/editorCommon';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';

export interface PositionLike {
	line: number;
	character: number;
}

export interface RangeLike {
	start: PositionLike;
	end: PositionLike;
}

export interface SelectionLike extends RangeLike {
	anchor: PositionLike;
	active: PositionLike;
}

export function toSelection(selection: ISelection): Selection {
	let {selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn} = selection;
	let start = new Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
	let end = new Position(positionLineNumber - 1, positionColumn - 1);
	return new Selection(start, end);
}

export function fromSelection(selection: SelectionLike): ISelection {
	let {anchor, active} = selection;
	return {
		selectionStartLineNumber: anchor.line + 1,
		selectionStartColumn: anchor.character + 1,
		positionLineNumber: active.line + 1,
		positionColumn: active.character + 1
	};
}

export function fromRange(range: RangeLike): IRange {
	let {start, end} = range;
	return {
		startLineNumber: start.line + 1,
		startColumn: start.character + 1,
		endLineNumber: end.line + 1,
		endColumn: end.character + 1
	};
}

export function toRange(range: IRange): Range {
	let {startLineNumber, startColumn, endLineNumber, endColumn} = range;
	return new Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
}

export function toPosition(position: IPosition): Position {
	return new Position(position.lineNumber - 1, position.column - 1);
}

export function fromSymbolKind(kind: number | SymbolKind): string {
	switch (kind) {
		case SymbolKind.Method:
			return 'method';
		case SymbolKind.Function:
			return 'function';
		case SymbolKind.Constructor:
			return 'constructor';
		case SymbolKind.Variable:
			return 'variable';
		case SymbolKind.Class:
			return 'class';
		case SymbolKind.Interface:
			return 'interface';
		case SymbolKind.Module:
		case SymbolKind.Namespace:
		case SymbolKind.Package:
			return 'module';
		case SymbolKind.Property:
			return 'property';
		case SymbolKind.Enum:
			return 'enum';
		case SymbolKind.String:
			return 'string';
		case SymbolKind.File:
			return 'file';
		case SymbolKind.Array:
			return 'array';
		case SymbolKind.Number:
			return 'number';
		case SymbolKind.Boolean:
			return 'boolean';
	}

	return 'property';
}

export function fromDiagnosticSeverity(value: number): Severity {
	switch (value) {
		case DiagnosticSeverity.Error:
			return Severity.Error;
		case DiagnosticSeverity.Warning:
			return Severity.Warning;
		case DiagnosticSeverity.Information:
			return Severity.Info;
		case DiagnosticSeverity.Hint:
			return Severity.Ignore;
	}
	return Severity.Error;
}

export function toDiagnosticSeverty(value: Severity): DiagnosticSeverity {
	switch (value) {
		case Severity.Info:
			return DiagnosticSeverity.Information;
		case Severity.Warning:
			return DiagnosticSeverity.Warning;
		case Severity.Error:
			return DiagnosticSeverity.Error;
		case Severity.Ignore:
			return DiagnosticSeverity.Hint;
	}
	return DiagnosticSeverity.Error;
}

export function fromViewColumn(column?: vscode.ViewColumn): EditorPosition {
	let editorColumn = EditorPosition.LEFT;
	if (typeof column !== 'number') {
		// stick with LEFT
	} else if (column === <number>ViewColumn.Two) {
		editorColumn = EditorPosition.CENTER;
	} else if (column === <number>ViewColumn.Three) {
		editorColumn = EditorPosition.RIGHT;
	}
	return editorColumn;
}


export function fromFormattedString(value: vscode.MarkedString): IHTMLContentElement {
	if (typeof value === 'string') {
		return { formattedText: value };
	} else if (typeof value === 'object') {
		return { code: value };
	}
}

function isMarkedStringArr(something: vscode.MarkedString | vscode.MarkedString[]): something is vscode.MarkedString[] {
	return Array.isArray(something);
}

function fromMarkedStringOrMarkedStringArr(something: vscode.MarkedString | vscode.MarkedString[]): IHTMLContentElement[] {
	if (isMarkedStringArr(something)) {
		return something.map(msg => fromFormattedString(msg));
	} else if (something) {
		return [fromFormattedString(something)];
	} else {
		return [];
	}
}

function isRangeWithMessage(something: any): something is vscode.DecorationOptions {
	return (typeof something.range !== 'undefined');
}

function isRangeWithMessageArr(something: vscode.Range[]|vscode.DecorationOptions[]): something is vscode.DecorationOptions[] {
	if (something.length === 0) {
		return true;
	}
	return isRangeWithMessage(something[0]);
}

export function fromRangeOrRangeWithMessage(ranges:vscode.Range[]|vscode.DecorationOptions[]): IRangeWithMessage[] {
	if (isRangeWithMessageArr(ranges)) {
		return ranges.map((r): IRangeWithMessage => {
			return {
				range: fromRange(r.range),
				hoverMessage: fromMarkedStringOrMarkedStringArr(r.hoverMessage)
			};
		});
	} else {
		return ranges.map((r): IRangeWithMessage => {
			return {
				range: fromRange(r)
			}
		});
	}
}
