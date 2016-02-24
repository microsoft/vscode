/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ExtHostCommands} from 'vs/workbench/api/node/extHostCommands';
import Severity from 'vs/base/common/severity';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as types from './extHostTypes';
import {Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {IPosition, ISelection, IRange, IRangeWithMessage, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {ITypeBearing} from 'vs/workbench/parts/search/common/search';
import * as vscode from 'vscode';

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

export function toSelection(selection: ISelection): types.Selection {
	let {selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn} = selection;
	let start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
	let end = new types.Position(positionLineNumber - 1, positionColumn - 1);
	return new types.Selection(start, end);
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

export function toRange(range: IRange): types.Range {
	let {startLineNumber, startColumn, endLineNumber, endColumn} = range;
	return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
}

export function toPosition(position: IPosition): types.Position {
	return new types.Position(position.lineNumber - 1, position.column - 1);
}

export function fromPosition(position: types.Position):IPosition {
	return { lineNumber: position.line + 1, column: position.character + 1};
}

export function fromDiagnosticSeverity(value: number): Severity {
	switch (value) {
		case types.DiagnosticSeverity.Error:
			return Severity.Error;
		case types.DiagnosticSeverity.Warning:
			return Severity.Warning;
		case types.DiagnosticSeverity.Information:
			return Severity.Info;
		case types.DiagnosticSeverity.Hint:
			return Severity.Ignore;
	}
	return Severity.Error;
}

export function toDiagnosticSeverty(value: Severity): types.DiagnosticSeverity {
	switch (value) {
		case Severity.Info:
			return types.DiagnosticSeverity.Information;
		case Severity.Warning:
			return types.DiagnosticSeverity.Warning;
		case Severity.Error:
			return types.DiagnosticSeverity.Error;
		case Severity.Ignore:
			return types.DiagnosticSeverity.Hint;
	}
	return types.DiagnosticSeverity.Error;
}

export function fromViewColumn(column?: vscode.ViewColumn): EditorPosition {
	let editorColumn = EditorPosition.LEFT;
	if (typeof column !== 'number') {
		// stick with LEFT
	} else if (column === <number>types.ViewColumn.Two) {
		editorColumn = EditorPosition.CENTER;
	} else if (column === <number>types.ViewColumn.Three) {
		editorColumn = EditorPosition.RIGHT;
	}
	return editorColumn;
}

export function toViewColumn(position?: EditorPosition): vscode.ViewColumn {
	if (typeof position !== 'number') {
		return;
	}
	if (position === EditorPosition.LEFT) {
		return <number> types.ViewColumn.One;
	} else if (position === EditorPosition.CENTER) {
		return <number> types.ViewColumn.Two;
	} else if (position === EditorPosition.RIGHT) {
		return <number> types.ViewColumn.Three;
	}
}

export function fromFormattedString(value: vscode.MarkedString): IHTMLContentElement {
	if (typeof value === 'string') {
		return { markdown: value };
	} else if (typeof value === 'object') {
		return { code: value };
	}
}

export function toFormattedString(value: IHTMLContentElement): vscode.MarkedString {
	if (typeof value.code === 'string') {
		return value.code;
	}
	let {markdown, text} = value;
	return markdown || text || '<???>';
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
	return isRangeWithMessage(something[0]) ? true : false;
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
			};
		});
	}
}

export const TextEdit = {
	from(edit: vscode.TextEdit): ISingleEditOperation{
		return <ISingleEditOperation>{
			text: edit.newText,
			range: fromRange(edit.range)
		};
	},
	to(edit: ISingleEditOperation): vscode.TextEdit {
		return new types.TextEdit(toRange(edit.range), edit.text);
	}
};

export namespace SymbolKind {

	export function from(kind: number | types.SymbolKind): string {
		switch (kind) {
			case types.SymbolKind.Method:
				return 'method';
			case types.SymbolKind.Function:
				return 'function';
			case types.SymbolKind.Constructor:
				return 'constructor';
			case types.SymbolKind.Variable:
				return 'variable';
			case types.SymbolKind.Class:
				return 'class';
			case types.SymbolKind.Interface:
				return 'interface';
			case types.SymbolKind.Namespace:
				return 'namespace';
			case types.SymbolKind.Package:
				return 'package';
			case types.SymbolKind.Module:
				return 'module';
			case types.SymbolKind.Property:
				return 'property';
			case types.SymbolKind.Enum:
				return 'enum';
			case types.SymbolKind.String:
				return 'string';
			case types.SymbolKind.File:
				return 'file';
			case types.SymbolKind.Array:
				return 'array';
			case types.SymbolKind.Number:
				return 'number';
			case types.SymbolKind.Boolean:
				return 'boolean';
			case types.SymbolKind.Object:
				return 'object';
			case types.SymbolKind.Key:
				return 'key';
			case types.SymbolKind.Null:
				return 'null';
		}
		return 'property';
	}

	export function to(type: string): types.SymbolKind {
		switch (type) {
			case 'method':
				return types.SymbolKind.Method;
			case 'function':
				return types.SymbolKind.Function;
			case 'constructor':
				return types.SymbolKind.Constructor;
			case 'variable':
				return types.SymbolKind.Variable;
			case 'class':
				return types.SymbolKind.Class;
			case 'interface':
				return types.SymbolKind.Interface;
			case 'namespace':
				return types.SymbolKind.Namespace;
			case 'package':
				return types.SymbolKind.Package;
			case 'module':
				return types.SymbolKind.Module;
			case 'property':
				return types.SymbolKind.Property;
			case 'enum':
				return types.SymbolKind.Enum;
			case 'string':
				return types.SymbolKind.String;
			case 'file':
				return types.SymbolKind.File;
			case 'array':
				return types.SymbolKind.Array;
			case 'number':
				return types.SymbolKind.Number;
			case 'boolean':
				return types.SymbolKind.Boolean;
			case 'object':
				return types.SymbolKind.Object;
			case 'key':
				return types.SymbolKind.Key;
			case 'null':
				return types.SymbolKind.Null;
		}
		return types.SymbolKind.Property;
	}
}

export namespace SymbolInformation {

	export function fromOutlineEntry(entry: modes.IOutlineEntry): types.SymbolInformation {
		return new types.SymbolInformation(entry.label,
			SymbolKind.to(entry.type),
			toRange(entry.range),
			undefined,
			entry.containerLabel);
	}

	export function toOutlineEntry(symbol: vscode.SymbolInformation): modes.IOutlineEntry {
		return <modes.IOutlineEntry>{
			type: SymbolKind.from(symbol.kind),
			range: fromRange(symbol.location.range),
			containerLabel: symbol.containerName,
			label: symbol.name,
			icon: undefined,
		};
	}
}

export function fromSymbolInformation(info: vscode.SymbolInformation): ITypeBearing {
	return <ITypeBearing>{
		name: info.name,
		type: types.SymbolKind[info.kind || types.SymbolKind.Property].toLowerCase(),
		range: fromRange(info.location.range),
		resourceUri: info.location.uri,
		containerName: info.containerName,
		parameters: '',
	};
}

export function toSymbolInformation(bearing: ITypeBearing): types.SymbolInformation {
	return new types.SymbolInformation(bearing.name,
		types.SymbolKind[bearing.type.charAt(0).toUpperCase() + bearing.type.substr(1)],
		toRange(bearing.range),
		bearing.resourceUri,
		bearing.containerName);
}


export const location = {
	from(value: types.Location): modes.IReference {
		return {
			range: fromRange(value.range),
			resource: value.uri
		};
	},
	to(value: modes.IReference): types.Location {
		return new types.Location(value.resource, toRange(value.range));
	}
};

export function fromHover(hover: vscode.Hover): modes.IComputeExtraInfoResult {
	return <modes.IComputeExtraInfoResult>{
		range: fromRange(hover.range),
		htmlContent: hover.contents.map(fromFormattedString)
	};
}

export function toHover(info: modes.IComputeExtraInfoResult): types.Hover {
	return new types.Hover(info.htmlContent.map(toFormattedString), toRange(info.range));
}

export function toDocumentHighlight(occurrence: modes.IOccurence): types.DocumentHighlight {
	return new types.DocumentHighlight(toRange(occurrence.range),
		types.DocumentHighlightKind[occurrence.kind.charAt(0).toUpperCase() + occurrence.kind.substr(1)]);
}

export const Suggest = {

	from(item: vscode.CompletionItem): modes.ISuggestion {
		const suggestion: modes.ISuggestion = {
			label: item.label,
			codeSnippet: item.insertText || item.label,
			type: types.CompletionItemKind[item.kind || types.CompletionItemKind.Text].toString().toLowerCase(),
			typeLabel: item.detail,
			documentationLabel: item.documentation,
			sortText: item.sortText,
			filterText: item.filterText
		};
		return suggestion;
	},

	to(container: modes.ISuggestResult, position: types.Position, suggestion: modes.ISuggestion): types.CompletionItem {
		const result = new types.CompletionItem(suggestion.label);
		result.insertText = suggestion.codeSnippet;
		result.kind = types.CompletionItemKind[suggestion.type.charAt(0).toUpperCase() + suggestion.type.substr(1)];
		result.detail = suggestion.typeLabel;
		result.documentation = suggestion.documentationLabel;
		result.sortText = suggestion.sortText;
		result.filterText = suggestion.filterText;

		let overwriteBefore = (typeof suggestion.overwriteBefore === 'number') ? suggestion.overwriteBefore : container.currentWord.length;
		let startPosition = new types.Position(position.line, Math.max(0, position.character - overwriteBefore));
		let endPosition = position;
		if (typeof suggestion.overwriteAfter === 'number') {
			endPosition = new types.Position(position.line, position.character + suggestion.overwriteAfter);
		}

		result.textEdit = types.TextEdit.replace(new types.Range(startPosition, endPosition), suggestion.codeSnippet);
		return result;
	}
};

export namespace SignatureHelp {

	export function from(signatureHelp: types.SignatureHelp): modes.IParameterHints {

		let result: modes.IParameterHints = {
			currentSignature: signatureHelp.activeSignature,
			currentParameter: signatureHelp.activeParameter,
			signatures: []
		};

		for (let signature of signatureHelp.signatures) {

			let signatureItem: modes.ISignature = {
				label: signature.label,
				documentation: signature.documentation,
				parameters: []
			};

			let idx = 0;
			for (let parameter of signature.parameters) {

				let parameterItem: modes.IParameter = {
					label: parameter.label,
					documentation: parameter.documentation,
				};

				signatureItem.parameters.push(parameterItem);
				idx = signature.label.indexOf(parameter.label, idx);

				if (idx >= 0) {
					parameterItem.signatureLabelOffset = idx;
					idx += parameter.label.length;
					parameterItem.signatureLabelEnd = idx;
				} else {
					parameterItem.signatureLabelOffset = 0;
					parameterItem.signatureLabelEnd = 0;
				}
			}

			result.signatures.push(signatureItem);
		}

		return result;
	}

	export function to(hints: modes.IParameterHints): types.SignatureHelp {

		const result = new types.SignatureHelp();
		result.activeSignature = hints.currentSignature;
		result.activeParameter = hints.currentParameter;

		for (let signature of hints.signatures) {

			const signatureItem = new types.SignatureInformation(signature.label, signature.documentation);
			result.signatures.push(signatureItem);

			for (let parameter of signature.parameters) {

				const parameterItem = new types.ParameterInformation(parameter.label, parameter.documentation);
				signatureItem.parameters.push(parameterItem);
			}
		}

		return result;
	}
}


export namespace Command {

	const _cache: { [id: string]: vscode.Command } = Object.create(null);
	let _idPool = 1;

	export function from(command: vscode.Command, context: { commands: ExtHostCommands; disposables: IDisposable[]; }): modes.ICommand {

		if (!command) {
			return;
		}

		const result = <modes.ICommand>{
			id: command.command,
			title: command.title
		};

		if (!isFalsyOrEmpty(command.arguments)) {

			// keep command around
			const id = `${command.command}-no-args-wrapper-${_idPool++}`;
			result.id = id;
			_cache[id] = command;

			const disposable1 = context.commands.registerCommand(id, () => context.commands.executeCommand(command.command, ..._cache[id].arguments));
			const disposable2 = { dispose() { delete _cache[id]; } };
			context.disposables.push(disposable1, disposable2);
		}

		return result;
	}

	export function to(command: modes.ICommand): vscode.Command {

		let result = _cache[command.id];
		if (!result) {
			result = {
				command: command.id,
				title: command.title
			};
		}
		return result;
	}
}
