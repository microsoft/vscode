/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as modes from 'vs/editor/common/modes';
import * as types from './extHostTypes';
import * as search from 'vs/workbench/parts/search/common/search';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { EditorViewColumn } from 'vs/workbench/api/shared/editor';
import { IDecorationOptions, IThemeDecorationRenderOptions, IDecorationRenderOptions, IContentDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { EndOfLineSequence, TrackedRangeStickiness } from 'vs/editor/common/model';
import * as vscode from 'vscode';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ProgressLocation as MainProgressLocation } from 'vs/platform/progress/common/progress';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import * as htmlContent from 'vs/base/common/htmlContent';
import * as languageSelector from 'vs/editor/common/modes/languageSelector';
import { WorkspaceEditDto, ResourceTextEditDto, ResourceFileEditDto } from 'vs/workbench/api/node/extHost.protocol';
import { MarkerSeverity, IRelatedInformation, IMarkerData, MarkerTag } from 'vs/platform/markers/common/markers';
import { ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { isString, isNumber } from 'vs/base/common/types';
import * as marked from 'vs/base/common/marked/marked';
import { parse } from 'vs/base/common/marshalling';
import { cloneAndChange } from 'vs/base/common/objects';
import { LogLevel as _MainLogLevel } from 'vs/platform/log/common/log';

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
export namespace Selection {

	export function to(selection: ISelection): types.Selection {
		const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = selection;
		const start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
		const end = new types.Position(positionLineNumber - 1, positionColumn - 1);
		return new types.Selection(start, end);
	}

	export function from(selection: SelectionLike): ISelection {
		const { anchor, active } = selection;
		return {
			selectionStartLineNumber: anchor.line + 1,
			selectionStartColumn: anchor.character + 1,
			positionLineNumber: active.line + 1,
			positionColumn: active.character + 1
		};
	}
}
export namespace Range {

	export function from(range: RangeLike): IRange {
		if (!range) {
			return undefined;
		}
		const { start, end } = range;
		return {
			startLineNumber: start.line + 1,
			startColumn: start.character + 1,
			endLineNumber: end.line + 1,
			endColumn: end.character + 1
		};
	}

	export function to(range: IRange): types.Range {
		if (!range) {
			return undefined;
		}
		const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
		return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
	}
}

export namespace Position {
	export function to(position: IPosition): types.Position {
		return new types.Position(position.lineNumber - 1, position.column - 1);
	}
	export function from(position: types.Position): IPosition {
		return { lineNumber: position.line + 1, column: position.character + 1 };
	}
}

export namespace DiagnosticTag {
	export function from(value: vscode.DiagnosticTag): MarkerTag {
		switch (value) {
			case types.DiagnosticTag.Unnecessary:
				return MarkerTag.Unnecessary;
		}
		return undefined;
	}
}

export namespace Diagnostic {
	export function from(value: vscode.Diagnostic): IMarkerData {
		return {
			...Range.from(value.range),
			message: value.message,
			source: value.source,
			code: isString(value.code) || isNumber(value.code) ? String(value.code) : undefined,
			severity: DiagnosticSeverity.from(value.severity),
			relatedInformation: value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.from),
			tags: Array.isArray(value.tags) ? value.tags.map(DiagnosticTag.from) : undefined,
		};
	}
}

export namespace DiagnosticRelatedInformation {
	export function from(value: types.DiagnosticRelatedInformation): IRelatedInformation {
		return {
			...Range.from(value.location.range),
			message: value.message,
			resource: value.location.uri
		};
	}
	export function to(value: IRelatedInformation): types.DiagnosticRelatedInformation {
		return new types.DiagnosticRelatedInformation(new types.Location(value.resource, Range.to(value)), value.message);
	}
}
export namespace DiagnosticSeverity {

	export function from(value: number): MarkerSeverity {
		switch (value) {
			case types.DiagnosticSeverity.Error:
				return MarkerSeverity.Error;
			case types.DiagnosticSeverity.Warning:
				return MarkerSeverity.Warning;
			case types.DiagnosticSeverity.Information:
				return MarkerSeverity.Info;
			case types.DiagnosticSeverity.Hint:
				return MarkerSeverity.Hint;
		}
		return MarkerSeverity.Error;
	}

	export function to(value: MarkerSeverity): types.DiagnosticSeverity {
		switch (value) {
			case MarkerSeverity.Info:
				return types.DiagnosticSeverity.Information;
			case MarkerSeverity.Warning:
				return types.DiagnosticSeverity.Warning;
			case MarkerSeverity.Error:
				return types.DiagnosticSeverity.Error;
			case MarkerSeverity.Hint:
				return types.DiagnosticSeverity.Hint;
		}
		return types.DiagnosticSeverity.Error;
	}
}

export namespace ViewColumn {
	export function from(column?: vscode.ViewColumn): EditorViewColumn {
		if (typeof column === 'number' && column >= types.ViewColumn.One) {
			return column - 1; // adjust zero index (ViewColumn.ONE => 0)
		}

		if (column === types.ViewColumn.Beside) {
			return SIDE_GROUP;
		}

		return ACTIVE_GROUP; // default is always the active group
	}

	export function to(position?: EditorViewColumn): vscode.ViewColumn {
		if (typeof position === 'number' && position >= 0) {
			return position + 1; // adjust to index (ViewColumn.ONE => 1)
		}

		return undefined;
	}
}

function isDecorationOptions(something: any): something is vscode.DecorationOptions {
	return (typeof something.range !== 'undefined');
}

export function isDecorationOptionsArr(something: vscode.Range[] | vscode.DecorationOptions[]): something is vscode.DecorationOptions[] {
	if (something.length === 0) {
		return true;
	}
	return isDecorationOptions(something[0]) ? true : false;
}

export namespace MarkdownString {

	export function fromMany(markup: (vscode.MarkdownString | vscode.MarkedString)[]): htmlContent.IMarkdownString[] {
		return markup.map(MarkdownString.from);
	}

	interface Codeblock {
		language: string;
		value: string;
	}

	function isCodeblock(thing: any): thing is Codeblock {
		return thing && typeof thing === 'object'
			&& typeof (<Codeblock>thing).language === 'string'
			&& typeof (<Codeblock>thing).value === 'string';
	}

	export function from(markup: vscode.MarkdownString | vscode.MarkedString): htmlContent.IMarkdownString {
		let res: htmlContent.IMarkdownString;
		if (isCodeblock(markup)) {
			const { language, value } = markup;
			res = { value: '```' + language + '\n' + value + '\n```\n' };
		} else if (htmlContent.isMarkdownString(markup)) {
			res = markup;
		} else if (typeof markup === 'string') {
			res = { value: <string>markup };
		} else {
			res = { value: '' };
		}

		// extract uris into a separate object
		res.uris = Object.create(null);
		let renderer = new marked.Renderer();
		renderer.image = renderer.link = (href: string): string => {
			try {
				let uri = URI.parse(href, true);
				uri = uri.with({ query: _uriMassage(uri.query, res.uris) });
				res.uris[href] = uri;
			} catch (e) {
				// ignore
			}
			return '';
		};
		marked(res.value, { renderer });

		return res;
	}

	function _uriMassage(part: string, bucket: { [n: string]: UriComponents }): string {
		if (!part) {
			return part;
		}
		let data: any;
		try {
			data = parse(decodeURIComponent(part));
		} catch (e) {
			// ignore
		}
		if (!data) {
			return part;
		}
		data = cloneAndChange(data, value => {
			if (value instanceof URI) {
				let key = `__uri_${Math.random().toString(16).slice(2, 8)}`;
				bucket[key] = value;
				return key;
			} else {
				return undefined;
			}
		});
		return encodeURIComponent(JSON.stringify(data));
	}

	export function to(value: htmlContent.IMarkdownString): vscode.MarkdownString {
		const ret = new htmlContent.MarkdownString(value.value);
		ret.isTrusted = value.isTrusted;
		return ret;
	}

	export function fromStrict(value: string | types.MarkdownString): undefined | string | htmlContent.IMarkdownString {
		if (!value) {
			return undefined;
		}
		return typeof value === 'string' ? value : MarkdownString.from(value);
	}
}

export function fromRangeOrRangeWithMessage(ranges: vscode.Range[] | vscode.DecorationOptions[]): IDecorationOptions[] {
	if (isDecorationOptionsArr(ranges)) {
		return ranges.map(r => {
			return {
				range: Range.from(r.range),
				hoverMessage: Array.isArray(r.hoverMessage) ? MarkdownString.fromMany(r.hoverMessage) : r.hoverMessage && MarkdownString.from(r.hoverMessage),
				renderOptions: <any> /* URI vs Uri */r.renderOptions
			};
		});
	} else {
		return ranges.map((r): IDecorationOptions => {
			return {
				range: Range.from(r)
			};
		});
	}
}

function pathOrURIToURI(value: string | URI): URI {
	if (typeof value === 'undefined') {
		return value;
	}
	if (typeof value === 'string') {
		return URI.file(value);
	} else {
		return value;
	}
}

export namespace ThemableDecorationAttachmentRenderOptions {
	export function from(options: vscode.ThemableDecorationAttachmentRenderOptions): IContentDecorationRenderOptions {
		if (typeof options === 'undefined') {
			return options;
		}
		return {
			contentText: options.contentText,
			contentIconPath: pathOrURIToURI(options.contentIconPath),
			border: options.border,
			borderColor: <string | types.ThemeColor>options.borderColor,
			fontStyle: options.fontStyle,
			fontWeight: options.fontWeight,
			textDecoration: options.textDecoration,
			color: <string | types.ThemeColor>options.color,
			backgroundColor: <string | types.ThemeColor>options.backgroundColor,
			margin: options.margin,
			width: options.width,
			height: options.height,
		};
	}
}

export namespace ThemableDecorationRenderOptions {
	export function from(options: vscode.ThemableDecorationRenderOptions): IThemeDecorationRenderOptions {
		if (typeof options === 'undefined') {
			return options;
		}
		return {
			backgroundColor: <string | types.ThemeColor>options.backgroundColor,
			outline: options.outline,
			outlineColor: <string | types.ThemeColor>options.outlineColor,
			outlineStyle: options.outlineStyle,
			outlineWidth: options.outlineWidth,
			border: options.border,
			borderColor: <string | types.ThemeColor>options.borderColor,
			borderRadius: options.borderRadius,
			borderSpacing: options.borderSpacing,
			borderStyle: options.borderStyle,
			borderWidth: options.borderWidth,
			fontStyle: options.fontStyle,
			fontWeight: options.fontWeight,
			textDecoration: options.textDecoration,
			cursor: options.cursor,
			color: <string | types.ThemeColor>options.color,
			opacity: options.opacity,
			letterSpacing: options.letterSpacing,
			gutterIconPath: pathOrURIToURI(options.gutterIconPath),
			gutterIconSize: options.gutterIconSize,
			overviewRulerColor: <string | types.ThemeColor>options.overviewRulerColor,
			before: ThemableDecorationAttachmentRenderOptions.from(options.before),
			after: ThemableDecorationAttachmentRenderOptions.from(options.after),
		};
	}
}

export namespace DecorationRangeBehavior {
	export function from(value: types.DecorationRangeBehavior): TrackedRangeStickiness {
		if (typeof value === 'undefined') {
			return value;
		}
		switch (value) {
			case types.DecorationRangeBehavior.OpenOpen:
				return TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
			case types.DecorationRangeBehavior.ClosedClosed:
				return TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
			case types.DecorationRangeBehavior.OpenClosed:
				return TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
			case types.DecorationRangeBehavior.ClosedOpen:
				return TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
		}
	}
}

export namespace DecorationRenderOptions {
	export function from(options: vscode.DecorationRenderOptions): IDecorationRenderOptions {
		return {
			isWholeLine: options.isWholeLine,
			rangeBehavior: DecorationRangeBehavior.from(options.rangeBehavior),
			overviewRulerLane: options.overviewRulerLane,
			light: ThemableDecorationRenderOptions.from(options.light),
			dark: ThemableDecorationRenderOptions.from(options.dark),

			backgroundColor: <string | types.ThemeColor>options.backgroundColor,
			outline: options.outline,
			outlineColor: <string | types.ThemeColor>options.outlineColor,
			outlineStyle: options.outlineStyle,
			outlineWidth: options.outlineWidth,
			border: options.border,
			borderColor: <string | types.ThemeColor>options.borderColor,
			borderRadius: options.borderRadius,
			borderSpacing: options.borderSpacing,
			borderStyle: options.borderStyle,
			borderWidth: options.borderWidth,
			fontStyle: options.fontStyle,
			fontWeight: options.fontWeight,
			textDecoration: options.textDecoration,
			cursor: options.cursor,
			color: <string | types.ThemeColor>options.color,
			opacity: options.opacity,
			letterSpacing: options.letterSpacing,
			gutterIconPath: pathOrURIToURI(options.gutterIconPath),
			gutterIconSize: options.gutterIconSize,
			overviewRulerColor: <string | types.ThemeColor>options.overviewRulerColor,
			before: ThemableDecorationAttachmentRenderOptions.from(options.before),
			after: ThemableDecorationAttachmentRenderOptions.from(options.after),
		};
	}
}

export namespace TextEdit {

	export function from(edit: vscode.TextEdit): modes.TextEdit {
		return <modes.TextEdit>{
			text: edit.newText,
			eol: EndOfLine.from(edit.newEol),
			range: Range.from(edit.range)
		};
	}

	export function to(edit: modes.TextEdit): types.TextEdit {
		const result = new types.TextEdit(Range.to(edit.range), edit.text);
		result.newEol = EndOfLine.to(edit.eol);
		return result;
	}
}

export namespace WorkspaceEdit {
	export function from(value: vscode.WorkspaceEdit, documents?: ExtHostDocumentsAndEditors): WorkspaceEditDto {
		const result: WorkspaceEditDto = {
			edits: []
		};
		for (const entry of (value as types.WorkspaceEdit)._allEntries()) {
			const [uri, uriOrEdits] = entry;
			if (Array.isArray(uriOrEdits)) {
				// text edits
				const doc = documents ? documents.getDocument(uri.toString()) : undefined;
				result.edits.push(<ResourceTextEditDto>{ resource: uri, modelVersionId: doc && doc.version, edits: uriOrEdits.map(TextEdit.from) });
			} else {
				// resource edits
				result.edits.push(<ResourceFileEditDto>{ oldUri: uri, newUri: uriOrEdits, options: entry[2] });
			}
		}
		return result;
	}

	export function to(value: WorkspaceEditDto) {
		const result = new types.WorkspaceEdit();
		for (const edit of value.edits) {
			if (Array.isArray((<ResourceTextEditDto>edit).edits)) {
				result.set(
					URI.revive((<ResourceTextEditDto>edit).resource),
					<types.TextEdit[]>(<ResourceTextEditDto>edit).edits.map(TextEdit.to)
				);
			} else {
				result.renameFile(
					URI.revive((<ResourceFileEditDto>edit).oldUri),
					URI.revive((<ResourceFileEditDto>edit).newUri),
					(<ResourceFileEditDto>edit).options
				);
			}
		}
		return result;
	}
}


export namespace SymbolKind {

	const _fromMapping: { [kind: number]: modes.SymbolKind } = Object.create(null);
	_fromMapping[types.SymbolKind.File] = modes.SymbolKind.File;
	_fromMapping[types.SymbolKind.Module] = modes.SymbolKind.Module;
	_fromMapping[types.SymbolKind.Namespace] = modes.SymbolKind.Namespace;
	_fromMapping[types.SymbolKind.Package] = modes.SymbolKind.Package;
	_fromMapping[types.SymbolKind.Class] = modes.SymbolKind.Class;
	_fromMapping[types.SymbolKind.Method] = modes.SymbolKind.Method;
	_fromMapping[types.SymbolKind.Property] = modes.SymbolKind.Property;
	_fromMapping[types.SymbolKind.Field] = modes.SymbolKind.Field;
	_fromMapping[types.SymbolKind.Constructor] = modes.SymbolKind.Constructor;
	_fromMapping[types.SymbolKind.Enum] = modes.SymbolKind.Enum;
	_fromMapping[types.SymbolKind.Interface] = modes.SymbolKind.Interface;
	_fromMapping[types.SymbolKind.Function] = modes.SymbolKind.Function;
	_fromMapping[types.SymbolKind.Variable] = modes.SymbolKind.Variable;
	_fromMapping[types.SymbolKind.Constant] = modes.SymbolKind.Constant;
	_fromMapping[types.SymbolKind.String] = modes.SymbolKind.String;
	_fromMapping[types.SymbolKind.Number] = modes.SymbolKind.Number;
	_fromMapping[types.SymbolKind.Boolean] = modes.SymbolKind.Boolean;
	_fromMapping[types.SymbolKind.Array] = modes.SymbolKind.Array;
	_fromMapping[types.SymbolKind.Object] = modes.SymbolKind.Object;
	_fromMapping[types.SymbolKind.Key] = modes.SymbolKind.Key;
	_fromMapping[types.SymbolKind.Null] = modes.SymbolKind.Null;
	_fromMapping[types.SymbolKind.EnumMember] = modes.SymbolKind.EnumMember;
	_fromMapping[types.SymbolKind.Struct] = modes.SymbolKind.Struct;
	_fromMapping[types.SymbolKind.Event] = modes.SymbolKind.Event;
	_fromMapping[types.SymbolKind.Operator] = modes.SymbolKind.Operator;
	_fromMapping[types.SymbolKind.TypeParameter] = modes.SymbolKind.TypeParameter;

	export function from(kind: vscode.SymbolKind): modes.SymbolKind {
		return typeof _fromMapping[kind] === 'number' ? _fromMapping[kind] : modes.SymbolKind.Property;
	}

	export function to(kind: modes.SymbolKind): vscode.SymbolKind {
		for (const k in _fromMapping) {
			if (_fromMapping[k] === kind) {
				return Number(k);
			}
		}
		return types.SymbolKind.Property;
	}
}

export namespace WorkspaceSymbol {
	export function from(info: vscode.SymbolInformation): search.IWorkspaceSymbol {
		return <search.IWorkspaceSymbol>{
			name: info.name,
			kind: SymbolKind.from(info.kind),
			containerName: info.containerName,
			location: location.from(info.location)
		};
	}
	export function to(info: search.IWorkspaceSymbol): types.SymbolInformation {
		return new types.SymbolInformation(
			info.name,
			SymbolKind.to(info.kind),
			info.containerName,
			location.to(info.location)
		);
	}
}

export namespace DocumentSymbol {
	export function from(info: vscode.DocumentSymbol): modes.DocumentSymbol {
		const result: modes.DocumentSymbol = {
			name: info.name || '!!MISSING: name!!',
			detail: info.detail,
			range: Range.from(info.range),
			selectionRange: Range.from(info.selectionRange),
			kind: SymbolKind.from(info.kind)
		};
		if (info.children) {
			result.children = info.children.map(from);
		}
		return result;
	}
	export function to(info: modes.DocumentSymbol): vscode.DocumentSymbol {
		const result = new types.DocumentSymbol(
			info.name,
			info.detail,
			SymbolKind.to(info.kind),
			Range.to(info.range),
			Range.to(info.selectionRange),
		);
		if (info.children) {
			result.children = info.children.map(to) as any;
		}
		return result;
	}
}

export namespace location {
	export function from(value: vscode.Location): modes.Location {
		return {
			range: value.range && Range.from(value.range),
			uri: value.uri
		};
	}

	export function to(value: modes.Location): types.Location {
		return new types.Location(value.uri, Range.to(value.range));
	}
}

export namespace DefinitionLink {
	export function from(value: vscode.Location | vscode.DefinitionLink): modes.DefinitionLink {
		const definitionLink = <vscode.DefinitionLink>value;
		const location = <vscode.Location>value;
		return {
			origin: definitionLink.originSelectionRange
				? Range.from(definitionLink.originSelectionRange)
				: undefined,
			uri: definitionLink.targetUri ? definitionLink.targetUri : location.uri,
			range: Range.from(definitionLink.targetRange ? definitionLink.targetRange : location.range),
			selectionRange: definitionLink.targetSelectionRange
				? Range.from(definitionLink.targetSelectionRange)
				: undefined,
		};
	}
}

export namespace Hover {
	export function from(hover: vscode.Hover): modes.Hover {
		return <modes.Hover>{
			range: Range.from(hover.range),
			contents: MarkdownString.fromMany(hover.contents)
		};
	}

	export function to(info: modes.Hover): types.Hover {
		return new types.Hover(info.contents.map(MarkdownString.to), Range.to(info.range));
	}
}
export namespace DocumentHighlight {
	export function from(documentHighlight: vscode.DocumentHighlight): modes.DocumentHighlight {
		return {
			range: Range.from(documentHighlight.range),
			kind: documentHighlight.kind
		};
	}
	export function to(occurrence: modes.DocumentHighlight): types.DocumentHighlight {
		return new types.DocumentHighlight(Range.to(occurrence.range), occurrence.kind);
	}
}

export namespace CompletionTriggerKind {
	export function to(kind: modes.CompletionTriggerKind) {
		switch (kind) {
			case modes.CompletionTriggerKind.TriggerCharacter:
				return types.CompletionTriggerKind.TriggerCharacter;
			case modes.CompletionTriggerKind.TriggerForIncompleteCompletions:
				return types.CompletionTriggerKind.TriggerForIncompleteCompletions;
			case modes.CompletionTriggerKind.Invoke:
			default:
				return types.CompletionTriggerKind.Invoke;
		}
	}
}

export namespace CompletionContext {
	export function to(context: modes.CompletionContext): types.CompletionContext {
		return {
			triggerKind: CompletionTriggerKind.to(context.triggerKind),
			triggerCharacter: context.triggerCharacter
		};
	}
}

export namespace CompletionItemKind {

	export function from(kind: types.CompletionItemKind): modes.CompletionItemKind {
		switch (kind) {
			case types.CompletionItemKind.Method: return modes.CompletionItemKind.Method;
			case types.CompletionItemKind.Function: return modes.CompletionItemKind.Function;
			case types.CompletionItemKind.Constructor: return modes.CompletionItemKind.Constructor;
			case types.CompletionItemKind.Field: return modes.CompletionItemKind.Field;
			case types.CompletionItemKind.Variable: return modes.CompletionItemKind.Variable;
			case types.CompletionItemKind.Class: return modes.CompletionItemKind.Class;
			case types.CompletionItemKind.Interface: return modes.CompletionItemKind.Interface;
			case types.CompletionItemKind.Struct: return modes.CompletionItemKind.Struct;
			case types.CompletionItemKind.Module: return modes.CompletionItemKind.Module;
			case types.CompletionItemKind.Property: return modes.CompletionItemKind.Property;
			case types.CompletionItemKind.Unit: return modes.CompletionItemKind.Unit;
			case types.CompletionItemKind.Value: return modes.CompletionItemKind.Value;
			case types.CompletionItemKind.Constant: return modes.CompletionItemKind.Constant;
			case types.CompletionItemKind.Enum: return modes.CompletionItemKind.Enum;
			case types.CompletionItemKind.EnumMember: return modes.CompletionItemKind.EnumMember;
			case types.CompletionItemKind.Keyword: return modes.CompletionItemKind.Keyword;
			case types.CompletionItemKind.Snippet: return modes.CompletionItemKind.Snippet;
			case types.CompletionItemKind.Text: return modes.CompletionItemKind.Text;
			case types.CompletionItemKind.Color: return modes.CompletionItemKind.Color;
			case types.CompletionItemKind.File: return modes.CompletionItemKind.File;
			case types.CompletionItemKind.Reference: return modes.CompletionItemKind.Reference;
			case types.CompletionItemKind.Folder: return modes.CompletionItemKind.Folder;
			case types.CompletionItemKind.Event: return modes.CompletionItemKind.Event;
			case types.CompletionItemKind.Operator: return modes.CompletionItemKind.Operator;
			case types.CompletionItemKind.TypeParameter: return modes.CompletionItemKind.TypeParameter;
		}
		return modes.CompletionItemKind.Property;
	}

	export function to(kind: modes.CompletionItemKind): types.CompletionItemKind {
		switch (kind) {
			case modes.CompletionItemKind.Method: return types.CompletionItemKind.Method;
			case modes.CompletionItemKind.Function: return types.CompletionItemKind.Function;
			case modes.CompletionItemKind.Constructor: return types.CompletionItemKind.Constructor;
			case modes.CompletionItemKind.Field: return types.CompletionItemKind.Field;
			case modes.CompletionItemKind.Variable: return types.CompletionItemKind.Variable;
			case modes.CompletionItemKind.Class: return types.CompletionItemKind.Class;
			case modes.CompletionItemKind.Interface: return types.CompletionItemKind.Interface;
			case modes.CompletionItemKind.Struct: return types.CompletionItemKind.Struct;
			case modes.CompletionItemKind.Module: return types.CompletionItemKind.Module;
			case modes.CompletionItemKind.Property: return types.CompletionItemKind.Property;
			case modes.CompletionItemKind.Unit: return types.CompletionItemKind.Unit;
			case modes.CompletionItemKind.Value: return types.CompletionItemKind.Value;
			case modes.CompletionItemKind.Constant: return types.CompletionItemKind.Constant;
			case modes.CompletionItemKind.Enum: return types.CompletionItemKind.Enum;
			case modes.CompletionItemKind.EnumMember: return types.CompletionItemKind.EnumMember;
			case modes.CompletionItemKind.Keyword: return types.CompletionItemKind.Keyword;
			case modes.CompletionItemKind.Snippet: return types.CompletionItemKind.Snippet;
			case modes.CompletionItemKind.Text: return types.CompletionItemKind.Text;
			case modes.CompletionItemKind.Color: return types.CompletionItemKind.Color;
			case modes.CompletionItemKind.File: return types.CompletionItemKind.File;
			case modes.CompletionItemKind.Reference: return types.CompletionItemKind.Reference;
			case modes.CompletionItemKind.Folder: return types.CompletionItemKind.Folder;
			case modes.CompletionItemKind.Event: return types.CompletionItemKind.Event;
			case modes.CompletionItemKind.Operator: return types.CompletionItemKind.Operator;
			case modes.CompletionItemKind.TypeParameter: return types.CompletionItemKind.TypeParameter;
		}
		return types.CompletionItemKind.Property;
	}
}

export namespace CompletionItem {

	export function to(suggestion: modes.CompletionItem): types.CompletionItem {
		const result = new types.CompletionItem(suggestion.label);
		result.insertText = suggestion.insertText;
		result.kind = CompletionItemKind.to(suggestion.kind);
		result.detail = suggestion.detail;
		result.documentation = htmlContent.isMarkdownString(suggestion.documentation) ? MarkdownString.to(suggestion.documentation) : suggestion.documentation;
		result.sortText = suggestion.sortText;
		result.filterText = suggestion.filterText;
		result.preselect = suggestion.preselect;
		result.commitCharacters = suggestion.commitCharacters;
		result.range = Range.to(suggestion.range);
		result.keepWhitespace = Boolean(suggestion.insertTextRules & modes.CompletionItemInsertTextRule.KeepWhitespace);
		// 'inserText'-logic
		if (suggestion.insertTextRules & modes.CompletionItemInsertTextRule.InsertAsSnippet) {
			result.insertText = new types.SnippetString(suggestion.insertText);
		} else {
			result.insertText = suggestion.insertText;
			result.textEdit = new types.TextEdit(result.range, result.insertText);
		}
		// TODO additionalEdits, command

		return result;
	}
}

export namespace ParameterInformation {
	export function from(info: types.ParameterInformation): modes.ParameterInformation {
		return {
			label: info.label,
			documentation: MarkdownString.fromStrict(info.documentation)
		};
	}
	export function to(info: modes.ParameterInformation): types.ParameterInformation {
		return {
			label: info.label,
			documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation
		};
	}
}

export namespace SignatureInformation {

	export function from(info: types.SignatureInformation): modes.SignatureInformation {
		return {
			label: info.label,
			documentation: MarkdownString.fromStrict(info.documentation),
			parameters: info.parameters && info.parameters.map(ParameterInformation.from)
		};
	}

	export function to(info: modes.SignatureInformation): types.SignatureInformation {
		return {
			label: info.label,
			documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation,
			parameters: info.parameters && info.parameters.map(ParameterInformation.to)
		};
	}
}

export namespace SignatureHelp {

	export function from(help: types.SignatureHelp): modes.SignatureHelp {
		return {
			activeSignature: help.activeSignature,
			activeParameter: help.activeParameter,
			signatures: help.signatures && help.signatures.map(SignatureInformation.from)
		};
	}

	export function to(help: modes.SignatureHelp): types.SignatureHelp {
		return {
			activeSignature: help.activeSignature,
			activeParameter: help.activeParameter,
			signatures: help.signatures && help.signatures.map(SignatureInformation.to)
		};
	}
}

export namespace DocumentLink {

	export function from(link: vscode.DocumentLink): modes.ILink {
		return {
			range: Range.from(link.range),
			url: link.target && link.target.toString()
		};
	}

	export function to(link: modes.ILink): vscode.DocumentLink {
		return new types.DocumentLink(Range.to(link.range), link.url && URI.parse(link.url));
	}
}

export namespace ColorPresentation {
	export function to(colorPresentation: modes.IColorPresentation): types.ColorPresentation {
		const cp = new types.ColorPresentation(colorPresentation.label);
		if (colorPresentation.textEdit) {
			cp.textEdit = TextEdit.to(colorPresentation.textEdit);
		}
		if (colorPresentation.additionalTextEdits) {
			cp.additionalTextEdits = colorPresentation.additionalTextEdits.map(value => TextEdit.to(value));
		}
		return cp;
	}

	export function from(colorPresentation: vscode.ColorPresentation): modes.IColorPresentation {
		return {
			label: colorPresentation.label,
			textEdit: colorPresentation.textEdit ? TextEdit.from(colorPresentation.textEdit) : undefined,
			additionalTextEdits: colorPresentation.additionalTextEdits ? colorPresentation.additionalTextEdits.map(value => TextEdit.from(value)) : undefined
		};
	}
}

export namespace Color {
	export function to(c: [number, number, number, number]): types.Color {
		return new types.Color(c[0], c[1], c[2], c[3]);
	}
	export function from(color: types.Color): [number, number, number, number] {
		return [color.red, color.green, color.blue, color.alpha];
	}
}

export namespace SelectionRangeKind {

	export function from(kind: vscode.SelectionRangeKind): string {
		return kind.value;
	}

	export function to(value: string): vscode.SelectionRangeKind {
		return new types.SelectionRangeKind(value);
	}
}

export namespace SelectionRange {
	export function from(obj: vscode.SelectionRange): modes.SelectionRange {
		return {
			kind: SelectionRangeKind.from(obj.kind),
			range: Range.from(obj.range)
		};
	}

	export function to(obj: modes.SelectionRange): vscode.SelectionRange {
		return new types.SelectionRange(Range.to(obj.range), SelectionRangeKind.to(obj.kind));
	}
}

export namespace TextDocumentSaveReason {

	export function to(reason: SaveReason): vscode.TextDocumentSaveReason {
		switch (reason) {
			case SaveReason.AUTO:
				return types.TextDocumentSaveReason.AfterDelay;
			case SaveReason.EXPLICIT:
				return types.TextDocumentSaveReason.Manual;
			case SaveReason.FOCUS_CHANGE:
			case SaveReason.WINDOW_CHANGE:
				return types.TextDocumentSaveReason.FocusOut;
		}
	}
}


export namespace EndOfLine {

	export function from(eol: vscode.EndOfLine): EndOfLineSequence {
		if (eol === types.EndOfLine.CRLF) {
			return EndOfLineSequence.CRLF;
		} else if (eol === types.EndOfLine.LF) {
			return EndOfLineSequence.LF;
		}
		return undefined;
	}

	export function to(eol: EndOfLineSequence): vscode.EndOfLine {
		if (eol === EndOfLineSequence.CRLF) {
			return types.EndOfLine.CRLF;
		} else if (eol === EndOfLineSequence.LF) {
			return types.EndOfLine.LF;
		}
		return undefined;
	}
}

export namespace ProgressLocation {
	export function from(loc: vscode.ProgressLocation): MainProgressLocation {
		switch (loc) {
			case types.ProgressLocation.SourceControl: return MainProgressLocation.Scm;
			case types.ProgressLocation.Window: return MainProgressLocation.Window;
			case types.ProgressLocation.Notification: return MainProgressLocation.Notification;
		}
		return undefined;
	}
}

export namespace FoldingRange {
	export function from(r: vscode.FoldingRange): modes.FoldingRange {
		const range: modes.FoldingRange = { start: r.start + 1, end: r.end + 1 };
		if (r.kind) {
			range.kind = FoldingRangeKind.from(r.kind);
		}
		return range;
	}
}

export namespace FoldingRangeKind {
	export function from(kind: vscode.FoldingRangeKind | undefined): modes.FoldingRangeKind | undefined {
		if (kind) {
			switch (kind) {
				case types.FoldingRangeKind.Comment:
					return modes.FoldingRangeKind.Comment;
				case types.FoldingRangeKind.Imports:
					return modes.FoldingRangeKind.Imports;
				case types.FoldingRangeKind.Region:
					return modes.FoldingRangeKind.Region;
			}
		}
		return undefined;
	}
}

export namespace TextEditorOptions {

	export function from(options?: vscode.TextDocumentShowOptions): ITextEditorOptions {
		if (options) {
			return {
				pinned: typeof options.preview === 'boolean' ? !options.preview : undefined,
				preserveFocus: options.preserveFocus,
				selection: typeof options.selection === 'object' ? Range.from(options.selection) : undefined
			} as ITextEditorOptions;
		}

		return undefined;
	}

}

export namespace GlobPattern {

	export function from(pattern: vscode.GlobPattern): string | types.RelativePattern {
		if (pattern instanceof types.RelativePattern) {
			return pattern;
		}

		if (typeof pattern === 'string') {
			return pattern;
		}

		if (isRelativePattern(pattern)) {
			return new types.RelativePattern(pattern.base, pattern.pattern);
		}

		return pattern; // preserve `undefined` and `null`
	}

	function isRelativePattern(obj: any): obj is vscode.RelativePattern {
		const rp = obj as vscode.RelativePattern;
		return rp && typeof rp.base === 'string' && typeof rp.pattern === 'string';
	}
}

export namespace LanguageSelector {

	export function from(selector: vscode.DocumentSelector): languageSelector.LanguageSelector {
		if (!selector) {
			return undefined;
		} else if (Array.isArray(selector)) {
			return <languageSelector.LanguageSelector>selector.map(from);
		} else if (typeof selector === 'string') {
			return selector;
		} else {
			return <languageSelector.LanguageFilter>{
				language: selector.language,
				scheme: selector.scheme,
				pattern: GlobPattern.from(selector.pattern),
				exclusive: selector.exclusive
			};
		}
	}
}

export namespace LogLevel {
	export function from(extLevel: types.LogLevel): _MainLogLevel {
		switch (extLevel) {
			case types.LogLevel.Trace:
				return _MainLogLevel.Trace;
			case types.LogLevel.Debug:
				return _MainLogLevel.Debug;
			case types.LogLevel.Info:
				return _MainLogLevel.Info;
			case types.LogLevel.Warning:
				return _MainLogLevel.Warning;
			case types.LogLevel.Error:
				return _MainLogLevel.Error;
			case types.LogLevel.Critical:
				return _MainLogLevel.Critical;
			case types.LogLevel.Off:
				return _MainLogLevel.Off;
		}

		return _MainLogLevel.Info;
	}

	export function to(mainLevel: _MainLogLevel): types.LogLevel {
		switch (mainLevel) {
			case _MainLogLevel.Trace:
				return types.LogLevel.Trace;
			case _MainLogLevel.Debug:
				return types.LogLevel.Debug;
			case _MainLogLevel.Info:
				return types.LogLevel.Info;
			case _MainLogLevel.Warning:
				return types.LogLevel.Warning;
			case _MainLogLevel.Error:
				return types.LogLevel.Error;
			case _MainLogLevel.Critical:
				return types.LogLevel.Critical;
			case _MainLogLevel.Off:
				return types.LogLevel.Off;
		}

		return types.LogLevel.Info;
	}
}
