/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray, coalesce, isNonEmptyArray } from 'vs/base/common/arrays';
import { VSBuffer } from 'vs/base/common/buffer';
import * as htmlContent from 'vs/base/common/htmlContent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ResourceSet } from 'vs/base/common/map';
import { marked } from 'vs/base/common/marked/marked';
import { parse } from 'vs/base/common/marshalling';
import { cloneAndChange } from 'vs/base/common/objects';
import { isEmptyObject, isNumber, isString, isUndefinedOrNull, withNullAsUndefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import * as editorRange from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { IContentDecorationRenderOptions, IDecorationOptions, IDecorationRenderOptions, IThemeDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import * as languages from 'vs/editor/common/languages';
import * as encodedTokenAttributes from 'vs/editor/common/encodedTokenAttributes';
import * as languageSelector from 'vs/editor/common/languageSelector';
import { EndOfLineSequence, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IMarkerData, IRelatedInformation, MarkerSeverity, MarkerTag } from 'vs/platform/markers/common/markers';
import { ProgressLocation as MainProgressLocation } from 'vs/platform/progress/common/progress';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { getPrivateApiFor } from 'vs/workbench/api/common/extHostTestingPrivateApi';
import { DEFAULT_EDITOR_ASSOCIATION, SaveReason } from 'vs/workbench/common/editor';
import { IViewBadge } from 'vs/workbench/common/views';
import * as notebooks from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import * as search from 'vs/workbench/contrib/search/common/search';
import { TestId, TestPosition } from 'vs/workbench/contrib/testing/common/testId';
import { CoverageDetails, denamespaceTestTag, DetailType, ICoveredCount, IFileCoverage, ISerializedTestResults, ITestErrorMessage, ITestItem, ITestTag, namespaceTestTag, TestMessageType, TestResultItem } from 'vs/workbench/contrib/testing/common/testTypes';
import { EditorGroupColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import type * as vscode from 'vscode';
import * as types from './extHostTypes';
import { once } from 'vs/base/common/functional';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';

export namespace Command {

	export interface ICommandsConverter {
		fromInternal(command: extHostProtocol.ICommandDto): vscode.Command | undefined;
		toInternal(command: vscode.Command | undefined, disposables: DisposableStore): extHostProtocol.ICommandDto | undefined;
	}
}

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

	export function from(range: undefined): undefined;
	export function from(range: RangeLike): editorRange.IRange;
	export function from(range: RangeLike | undefined): editorRange.IRange | undefined;
	export function from(range: RangeLike | undefined): editorRange.IRange | undefined {
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

	export function to(range: undefined): types.Range;
	export function to(range: editorRange.IRange): types.Range;
	export function to(range: editorRange.IRange | undefined): types.Range | undefined;
	export function to(range: editorRange.IRange | undefined): types.Range | undefined {
		if (!range) {
			return undefined;
		}
		const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
		return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
	}
}

export namespace TokenType {
	export function to(type: encodedTokenAttributes.StandardTokenType): types.StandardTokenType {
		switch (type) {
			case encodedTokenAttributes.StandardTokenType.Comment: return types.StandardTokenType.Comment;
			case encodedTokenAttributes.StandardTokenType.Other: return types.StandardTokenType.Other;
			case encodedTokenAttributes.StandardTokenType.RegEx: return types.StandardTokenType.RegEx;
			case encodedTokenAttributes.StandardTokenType.String: return types.StandardTokenType.String;
		}
	}
}

export namespace Position {
	export function to(position: IPosition): types.Position {
		return new types.Position(position.lineNumber - 1, position.column - 1);
	}
	export function from(position: types.Position | vscode.Position): IPosition {
		return { lineNumber: position.line + 1, column: position.character + 1 };
	}
}

export namespace DocumentSelector {

	export function from(value: vscode.DocumentSelector, uriTransformer?: IURITransformer): extHostProtocol.IDocumentFilterDto[] {
		return coalesce(asArray(value).map(sel => _doTransformDocumentSelector(sel, uriTransformer)));
	}

	function _doTransformDocumentSelector(selector: string | vscode.DocumentFilter, uriTransformer: IURITransformer | undefined): extHostProtocol.IDocumentFilterDto | undefined {
		if (typeof selector === 'string') {
			return {
				$serialized: true,
				language: selector
			};
		}

		if (selector) {
			return {
				$serialized: true,
				language: selector.language,
				scheme: _transformScheme(selector.scheme, uriTransformer),
				pattern: GlobPattern.from(selector.pattern) ?? undefined,
				exclusive: selector.exclusive,
				notebookType: selector.notebookType
			};
		}

		return undefined;
	}

	function _transformScheme(scheme: string | undefined, uriTransformer: IURITransformer | undefined): string | undefined {
		if (uriTransformer && typeof scheme === 'string') {
			return uriTransformer.transformOutgoingScheme(scheme);
		}
		return scheme;
	}
}

export namespace DiagnosticTag {
	export function from(value: vscode.DiagnosticTag): MarkerTag | undefined {
		switch (value) {
			case types.DiagnosticTag.Unnecessary:
				return MarkerTag.Unnecessary;
			case types.DiagnosticTag.Deprecated:
				return MarkerTag.Deprecated;
		}
		return undefined;
	}
	export function to(value: MarkerTag): vscode.DiagnosticTag | undefined {
		switch (value) {
			case MarkerTag.Unnecessary:
				return types.DiagnosticTag.Unnecessary;
			case MarkerTag.Deprecated:
				return types.DiagnosticTag.Deprecated;
			default:
				return undefined;
		}
	}
}

export namespace Diagnostic {
	export function from(value: vscode.Diagnostic): IMarkerData {
		let code: string | { value: string; target: URI } | undefined;

		if (value.code) {
			if (isString(value.code) || isNumber(value.code)) {
				code = String(value.code);
			} else {
				code = {
					value: String(value.code.value),
					target: value.code.target,
				};
			}
		}

		return {
			...Range.from(value.range),
			message: value.message,
			source: value.source,
			code,
			severity: DiagnosticSeverity.from(value.severity),
			relatedInformation: value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.from),
			tags: Array.isArray(value.tags) ? coalesce(value.tags.map(DiagnosticTag.from)) : undefined,
		};
	}

	export function to(value: IMarkerData): vscode.Diagnostic {
		const res = new types.Diagnostic(Range.to(value), value.message, DiagnosticSeverity.to(value.severity));
		res.source = value.source;
		res.code = isString(value.code) ? value.code : value.code?.value;
		res.relatedInformation = value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.to);
		res.tags = value.tags && coalesce(value.tags.map(DiagnosticTag.to));
		return res;
	}
}

export namespace DiagnosticRelatedInformation {
	export function from(value: vscode.DiagnosticRelatedInformation): IRelatedInformation {
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
			default:
				return types.DiagnosticSeverity.Error;
		}
	}
}

export namespace ViewColumn {
	export function from(column?: vscode.ViewColumn): EditorGroupColumn {
		if (typeof column === 'number' && column >= types.ViewColumn.One) {
			return column - 1; // adjust zero index (ViewColumn.ONE => 0)
		}

		if (column === types.ViewColumn.Beside) {
			return SIDE_GROUP;
		}

		return ACTIVE_GROUP; // default is always the active group
	}

	export function to(position: EditorGroupColumn): vscode.ViewColumn {
		if (typeof position === 'number' && position >= 0) {
			return position + 1; // adjust to index (ViewColumn.ONE => 1)
		}

		throw new Error(`invalid 'EditorGroupColumn'`);
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
		} else if (types.MarkdownString.isMarkdownString(markup)) {
			res = { value: markup.value, isTrusted: markup.isTrusted, supportThemeIcons: markup.supportThemeIcons, supportHtml: markup.supportHtml, baseUri: markup.baseUri };
		} else if (typeof markup === 'string') {
			res = { value: markup };
		} else {
			res = { value: '' };
		}

		// extract uris into a separate object
		const resUris: { [href: string]: UriComponents } = Object.create(null);
		res.uris = resUris;

		const collectUri = (href: string): string => {
			try {
				let uri = URI.parse(href, true);
				uri = uri.with({ query: _uriMassage(uri.query, resUris) });
				resUris[href] = uri;
			} catch (e) {
				// ignore
			}
			return '';
		};
		const renderer = new marked.Renderer();
		renderer.link = collectUri;
		renderer.image = href => typeof href === 'string' ? collectUri(htmlContent.parseHrefAndDimensions(href).href) : '';

		marked(res.value, { renderer });

		return res;
	}

	function _uriMassage(part: string, bucket: { [n: string]: UriComponents }): string {
		if (!part) {
			return part;
		}
		let data: any;
		try {
			data = parse(part);
		} catch (e) {
			// ignore
		}
		if (!data) {
			return part;
		}
		let changed = false;
		data = cloneAndChange(data, value => {
			if (URI.isUri(value)) {
				const key = `__uri_${Math.random().toString(16).slice(2, 8)}`;
				bucket[key] = value;
				changed = true;
				return key;
			} else {
				return undefined;
			}
		});

		if (!changed) {
			return part;
		}

		return JSON.stringify(data);
	}

	export function to(value: htmlContent.IMarkdownString): vscode.MarkdownString {
		const result = new types.MarkdownString(value.value, value.supportThemeIcons);
		result.isTrusted = value.isTrusted;
		result.supportHtml = value.supportHtml;
		result.baseUri = value.baseUri ? URI.from(value.baseUri) : undefined;
		return result;
	}

	export function fromStrict(value: string | vscode.MarkdownString | undefined | null): undefined | string | htmlContent.IMarkdownString {
		if (!value) {
			return undefined;
		}
		return typeof value === 'string' ? value : MarkdownString.from(value);
	}
}

export function fromRangeOrRangeWithMessage(ranges: vscode.Range[] | vscode.DecorationOptions[]): IDecorationOptions[] {
	if (isDecorationOptionsArr(ranges)) {
		return ranges.map((r): IDecorationOptions => {
			return {
				range: Range.from(r.range),
				hoverMessage: Array.isArray(r.hoverMessage)
					? MarkdownString.fromMany(r.hoverMessage)
					: (r.hoverMessage ? MarkdownString.from(r.hoverMessage) : undefined),
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

export function pathOrURIToURI(value: string | URI): URI {
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
			contentIconPath: options.contentIconPath ? pathOrURIToURI(options.contentIconPath) : undefined,
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
			gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : undefined,
			gutterIconSize: options.gutterIconSize,
			overviewRulerColor: <string | types.ThemeColor>options.overviewRulerColor,
			before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : undefined,
			after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : undefined,
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
			rangeBehavior: options.rangeBehavior ? DecorationRangeBehavior.from(options.rangeBehavior) : undefined,
			overviewRulerLane: options.overviewRulerLane,
			light: options.light ? ThemableDecorationRenderOptions.from(options.light) : undefined,
			dark: options.dark ? ThemableDecorationRenderOptions.from(options.dark) : undefined,

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
			gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : undefined,
			gutterIconSize: options.gutterIconSize,
			overviewRulerColor: <string | types.ThemeColor>options.overviewRulerColor,
			before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : undefined,
			after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : undefined,
		};
	}
}

export namespace TextEdit {

	export function from(edit: vscode.TextEdit): languages.TextEdit {
		return <languages.TextEdit>{
			text: edit.newText,
			eol: edit.newEol && EndOfLine.from(edit.newEol),
			range: Range.from(edit.range)
		};
	}

	export function to(edit: languages.TextEdit): types.TextEdit {
		const result = new types.TextEdit(Range.to(edit.range), edit.text);
		result.newEol = (typeof edit.eol === 'undefined' ? undefined : EndOfLine.to(edit.eol))!;
		return result;
	}
}

export namespace WorkspaceEdit {

	export interface IVersionInformationProvider {
		getTextDocumentVersion(uri: URI): number | undefined;
		getNotebookDocumentVersion(uri: URI): number | undefined;
	}

	export function from(value: vscode.WorkspaceEdit, versionInfo?: IVersionInformationProvider, allowSnippetTextEdit?: boolean): extHostProtocol.IWorkspaceEditDto {
		const result: extHostProtocol.IWorkspaceEditDto = {
			edits: []
		};

		if (value instanceof types.WorkspaceEdit) {

			// collect all files that are to be created so that their version
			// information (in case they exist as text model already) can be ignored
			const toCreate = new ResourceSet();
			for (const entry of value._allEntries()) {
				if (entry._type === types.FileEditType.File && URI.isUri(entry.to) && entry.from === undefined) {
					toCreate.add(entry.to);
				}
			}

			for (const entry of value._allEntries()) {

				if (entry._type === types.FileEditType.File) {
					// file operation
					result.edits.push(<languages.IWorkspaceFileEdit>{
						oldResource: entry.from,
						newResource: entry.to,
						options: entry.options,
						metadata: entry.metadata
					});

				} else if (entry._type === types.FileEditType.Text) {
					// text edits
					result.edits.push(<languages.IWorkspaceTextEdit>{
						resource: entry.uri,
						textEdit: TextEdit.from(entry.edit),
						versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : undefined,
						metadata: entry.metadata
					});
				} else if (entry._type === types.FileEditType.Snippet) {
					// snippet text edits
					if (!allowSnippetTextEdit) {
						console.warn(`DROPPING snippet text edit because proposal IS NOT ENABLED`, entry);
						continue;
					}
					result.edits.push(<languages.IWorkspaceTextEdit>{
						resource: entry.uri,
						textEdit: {
							range: Range.from(entry.range),
							text: entry.edit.value,
							insertAsSnippet: true
						},
						versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : undefined,
						metadata: entry.metadata
					});

				} else if (entry._type === types.FileEditType.Cell) {
					// cell edit
					result.edits.push(<notebooks.IWorkspaceNotebookCellEdit>{
						metadata: entry.metadata,
						resource: entry.uri,
						cellEdit: entry.edit,
						notebookMetadata: entry.notebookMetadata,
						notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri)
					});

				} else if (entry._type === types.FileEditType.CellReplace) {
					// cell replace
					result.edits.push(<extHostProtocol.IWorkspaceCellEditDto>{
						metadata: entry.metadata,
						resource: entry.uri,
						notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri),
						cellEdit: {
							editType: notebooks.CellEditType.Replace,
							index: entry.index,
							count: entry.count,
							cells: entry.cells.map(NotebookCellData.from)
						}
					});
				}
			}
		}
		return result;
	}

	export function to(value: extHostProtocol.IWorkspaceEditDto) {
		const result = new types.WorkspaceEdit();
		for (const edit of value.edits) {
			if ((<extHostProtocol.IWorkspaceTextEditDto>edit).textEdit) {
				result.replace(
					URI.revive((<extHostProtocol.IWorkspaceTextEditDto>edit).resource),
					Range.to((<extHostProtocol.IWorkspaceTextEditDto>edit).textEdit.range),
					(<extHostProtocol.IWorkspaceTextEditDto>edit).textEdit.text
				);
			} else {
				result.renameFile(
					URI.revive((<extHostProtocol.IWorkspaceFileEditDto>edit).oldResource!),
					URI.revive((<extHostProtocol.IWorkspaceFileEditDto>edit).newResource!),
					(<extHostProtocol.IWorkspaceFileEditDto>edit).options
				);
			}
		}
		return result;
	}
}


export namespace SymbolKind {

	const _fromMapping: { [kind: number]: languages.SymbolKind } = Object.create(null);
	_fromMapping[types.SymbolKind.File] = languages.SymbolKind.File;
	_fromMapping[types.SymbolKind.Module] = languages.SymbolKind.Module;
	_fromMapping[types.SymbolKind.Namespace] = languages.SymbolKind.Namespace;
	_fromMapping[types.SymbolKind.Package] = languages.SymbolKind.Package;
	_fromMapping[types.SymbolKind.Class] = languages.SymbolKind.Class;
	_fromMapping[types.SymbolKind.Method] = languages.SymbolKind.Method;
	_fromMapping[types.SymbolKind.Property] = languages.SymbolKind.Property;
	_fromMapping[types.SymbolKind.Field] = languages.SymbolKind.Field;
	_fromMapping[types.SymbolKind.Constructor] = languages.SymbolKind.Constructor;
	_fromMapping[types.SymbolKind.Enum] = languages.SymbolKind.Enum;
	_fromMapping[types.SymbolKind.Interface] = languages.SymbolKind.Interface;
	_fromMapping[types.SymbolKind.Function] = languages.SymbolKind.Function;
	_fromMapping[types.SymbolKind.Variable] = languages.SymbolKind.Variable;
	_fromMapping[types.SymbolKind.Constant] = languages.SymbolKind.Constant;
	_fromMapping[types.SymbolKind.String] = languages.SymbolKind.String;
	_fromMapping[types.SymbolKind.Number] = languages.SymbolKind.Number;
	_fromMapping[types.SymbolKind.Boolean] = languages.SymbolKind.Boolean;
	_fromMapping[types.SymbolKind.Array] = languages.SymbolKind.Array;
	_fromMapping[types.SymbolKind.Object] = languages.SymbolKind.Object;
	_fromMapping[types.SymbolKind.Key] = languages.SymbolKind.Key;
	_fromMapping[types.SymbolKind.Null] = languages.SymbolKind.Null;
	_fromMapping[types.SymbolKind.EnumMember] = languages.SymbolKind.EnumMember;
	_fromMapping[types.SymbolKind.Struct] = languages.SymbolKind.Struct;
	_fromMapping[types.SymbolKind.Event] = languages.SymbolKind.Event;
	_fromMapping[types.SymbolKind.Operator] = languages.SymbolKind.Operator;
	_fromMapping[types.SymbolKind.TypeParameter] = languages.SymbolKind.TypeParameter;

	export function from(kind: vscode.SymbolKind): languages.SymbolKind {
		return typeof _fromMapping[kind] === 'number' ? _fromMapping[kind] : languages.SymbolKind.Property;
	}

	export function to(kind: languages.SymbolKind): vscode.SymbolKind {
		for (const k in _fromMapping) {
			if (_fromMapping[k] === kind) {
				return Number(k);
			}
		}
		return types.SymbolKind.Property;
	}
}

export namespace SymbolTag {

	export function from(kind: types.SymbolTag): languages.SymbolTag {
		switch (kind) {
			case types.SymbolTag.Deprecated: return languages.SymbolTag.Deprecated;
		}
	}

	export function to(kind: languages.SymbolTag): types.SymbolTag {
		switch (kind) {
			case languages.SymbolTag.Deprecated: return types.SymbolTag.Deprecated;
		}
	}
}

export namespace WorkspaceSymbol {
	export function from(info: vscode.SymbolInformation): search.IWorkspaceSymbol {
		return <search.IWorkspaceSymbol>{
			name: info.name,
			kind: SymbolKind.from(info.kind),
			tags: info.tags && info.tags.map(SymbolTag.from),
			containerName: info.containerName,
			location: location.from(info.location)
		};
	}
	export function to(info: search.IWorkspaceSymbol): types.SymbolInformation {
		const result = new types.SymbolInformation(
			info.name,
			SymbolKind.to(info.kind),
			info.containerName,
			location.to(info.location)
		);
		result.tags = info.tags && info.tags.map(SymbolTag.to);
		return result;
	}
}

export namespace DocumentSymbol {
	export function from(info: vscode.DocumentSymbol): languages.DocumentSymbol {
		const result: languages.DocumentSymbol = {
			name: info.name || '!!MISSING: name!!',
			detail: info.detail,
			range: Range.from(info.range),
			selectionRange: Range.from(info.selectionRange),
			kind: SymbolKind.from(info.kind),
			tags: info.tags?.map(SymbolTag.from) ?? []
		};
		if (info.children) {
			result.children = info.children.map(from);
		}
		return result;
	}
	export function to(info: languages.DocumentSymbol): vscode.DocumentSymbol {
		const result = new types.DocumentSymbol(
			info.name,
			info.detail,
			SymbolKind.to(info.kind),
			Range.to(info.range),
			Range.to(info.selectionRange),
		);
		if (isNonEmptyArray(info.tags)) {
			result.tags = info.tags.map(SymbolTag.to);
		}
		if (info.children) {
			result.children = info.children.map(to) as any;
		}
		return result;
	}
}

export namespace CallHierarchyItem {

	export function to(item: extHostProtocol.ICallHierarchyItemDto): types.CallHierarchyItem {
		const result = new types.CallHierarchyItem(
			SymbolKind.to(item.kind),
			item.name,
			item.detail || '',
			URI.revive(item.uri),
			Range.to(item.range),
			Range.to(item.selectionRange)
		);

		result._sessionId = item._sessionId;
		result._itemId = item._itemId;

		return result;
	}

	export function from(item: vscode.CallHierarchyItem, sessionId?: string, itemId?: string): extHostProtocol.ICallHierarchyItemDto {

		sessionId = sessionId ?? (<types.CallHierarchyItem>item)._sessionId;
		itemId = itemId ?? (<types.CallHierarchyItem>item)._itemId;

		if (sessionId === undefined || itemId === undefined) {
			throw new Error('invalid item');
		}

		return {
			_sessionId: sessionId,
			_itemId: itemId,
			name: item.name,
			detail: item.detail,
			kind: SymbolKind.from(item.kind),
			uri: item.uri,
			range: Range.from(item.range),
			selectionRange: Range.from(item.selectionRange),
			tags: item.tags?.map(SymbolTag.from)
		};
	}
}

export namespace CallHierarchyIncomingCall {

	export function to(item: extHostProtocol.IIncomingCallDto): types.CallHierarchyIncomingCall {
		return new types.CallHierarchyIncomingCall(
			CallHierarchyItem.to(item.from),
			item.fromRanges.map(r => Range.to(r))
		);
	}
}

export namespace CallHierarchyOutgoingCall {

	export function to(item: extHostProtocol.IOutgoingCallDto): types.CallHierarchyOutgoingCall {
		return new types.CallHierarchyOutgoingCall(
			CallHierarchyItem.to(item.to),
			item.fromRanges.map(r => Range.to(r))
		);
	}
}


export namespace location {
	export function from(value: vscode.Location): languages.Location {
		return {
			range: value.range && Range.from(value.range),
			uri: value.uri
		};
	}

	export function to(value: extHostProtocol.ILocationDto): types.Location {
		return new types.Location(URI.revive(value.uri), Range.to(value.range));
	}
}

export namespace DefinitionLink {
	export function from(value: vscode.Location | vscode.DefinitionLink): languages.LocationLink {
		const definitionLink = <vscode.DefinitionLink>value;
		const location = <vscode.Location>value;
		return {
			originSelectionRange: definitionLink.originSelectionRange
				? Range.from(definitionLink.originSelectionRange)
				: undefined,
			uri: definitionLink.targetUri ? definitionLink.targetUri : location.uri,
			range: Range.from(definitionLink.targetRange ? definitionLink.targetRange : location.range),
			targetSelectionRange: definitionLink.targetSelectionRange
				? Range.from(definitionLink.targetSelectionRange)
				: undefined,
		};
	}
	export function to(value: extHostProtocol.ILocationLinkDto): vscode.LocationLink {
		return {
			targetUri: URI.revive(value.uri),
			targetRange: Range.to(value.range),
			targetSelectionRange: value.targetSelectionRange
				? Range.to(value.targetSelectionRange)
				: undefined,
			originSelectionRange: value.originSelectionRange
				? Range.to(value.originSelectionRange)
				: undefined
		};
	}
}

export namespace Hover {
	export function from(hover: vscode.Hover): languages.Hover {
		return <languages.Hover>{
			range: Range.from(hover.range),
			contents: MarkdownString.fromMany(hover.contents)
		};
	}

	export function to(info: languages.Hover): types.Hover {
		return new types.Hover(info.contents.map(MarkdownString.to), Range.to(info.range));
	}
}

export namespace EvaluatableExpression {
	export function from(expression: vscode.EvaluatableExpression): languages.EvaluatableExpression {
		return <languages.EvaluatableExpression>{
			range: Range.from(expression.range),
			expression: expression.expression
		};
	}

	export function to(info: languages.EvaluatableExpression): types.EvaluatableExpression {
		return new types.EvaluatableExpression(Range.to(info.range), info.expression);
	}
}

export namespace InlineValue {
	export function from(inlineValue: vscode.InlineValue): languages.InlineValue {
		if (inlineValue instanceof types.InlineValueText) {
			return <languages.InlineValueText>{
				type: 'text',
				range: Range.from(inlineValue.range),
				text: inlineValue.text
			};
		} else if (inlineValue instanceof types.InlineValueVariableLookup) {
			return <languages.InlineValueVariableLookup>{
				type: 'variable',
				range: Range.from(inlineValue.range),
				variableName: inlineValue.variableName,
				caseSensitiveLookup: inlineValue.caseSensitiveLookup
			};
		} else if (inlineValue instanceof types.InlineValueEvaluatableExpression) {
			return <languages.InlineValueExpression>{
				type: 'expression',
				range: Range.from(inlineValue.range),
				expression: inlineValue.expression
			};
		} else {
			throw new Error(`Unknown 'InlineValue' type`);
		}
	}

	export function to(inlineValue: languages.InlineValue): vscode.InlineValue {
		switch (inlineValue.type) {
			case 'text':
				return <vscode.InlineValueText>{
					range: Range.to(inlineValue.range),
					text: inlineValue.text
				};
			case 'variable':
				return <vscode.InlineValueVariableLookup>{
					range: Range.to(inlineValue.range),
					variableName: inlineValue.variableName,
					caseSensitiveLookup: inlineValue.caseSensitiveLookup
				};
			case 'expression':
				return <vscode.InlineValueEvaluatableExpression>{
					range: Range.to(inlineValue.range),
					expression: inlineValue.expression
				};
		}
	}
}

export namespace InlineValueContext {
	export function from(inlineValueContext: vscode.InlineValueContext): extHostProtocol.IInlineValueContextDto {
		return <extHostProtocol.IInlineValueContextDto>{
			frameId: inlineValueContext.frameId,
			stoppedLocation: Range.from(inlineValueContext.stoppedLocation)
		};
	}

	export function to(inlineValueContext: extHostProtocol.IInlineValueContextDto): types.InlineValueContext {
		return new types.InlineValueContext(inlineValueContext.frameId, Range.to(inlineValueContext.stoppedLocation));
	}
}

export namespace DocumentHighlight {
	export function from(documentHighlight: vscode.DocumentHighlight): languages.DocumentHighlight {
		return {
			range: Range.from(documentHighlight.range),
			kind: documentHighlight.kind
		};
	}
	export function to(occurrence: languages.DocumentHighlight): types.DocumentHighlight {
		return new types.DocumentHighlight(Range.to(occurrence.range), occurrence.kind);
	}
}

export namespace CompletionTriggerKind {
	export function to(kind: languages.CompletionTriggerKind) {
		switch (kind) {
			case languages.CompletionTriggerKind.TriggerCharacter:
				return types.CompletionTriggerKind.TriggerCharacter;
			case languages.CompletionTriggerKind.TriggerForIncompleteCompletions:
				return types.CompletionTriggerKind.TriggerForIncompleteCompletions;
			case languages.CompletionTriggerKind.Invoke:
			default:
				return types.CompletionTriggerKind.Invoke;
		}
	}
}

export namespace CompletionContext {
	export function to(context: languages.CompletionContext): types.CompletionContext {
		return {
			triggerKind: CompletionTriggerKind.to(context.triggerKind),
			triggerCharacter: context.triggerCharacter
		};
	}
}

export namespace CompletionItemTag {

	export function from(kind: types.CompletionItemTag): languages.CompletionItemTag {
		switch (kind) {
			case types.CompletionItemTag.Deprecated: return languages.CompletionItemTag.Deprecated;
		}
	}

	export function to(kind: languages.CompletionItemTag): types.CompletionItemTag {
		switch (kind) {
			case languages.CompletionItemTag.Deprecated: return types.CompletionItemTag.Deprecated;
		}
	}
}

export namespace CompletionItemKind {

	const _from = new Map<types.CompletionItemKind, languages.CompletionItemKind>([
		[types.CompletionItemKind.Method, languages.CompletionItemKind.Method],
		[types.CompletionItemKind.Function, languages.CompletionItemKind.Function],
		[types.CompletionItemKind.Constructor, languages.CompletionItemKind.Constructor],
		[types.CompletionItemKind.Field, languages.CompletionItemKind.Field],
		[types.CompletionItemKind.Variable, languages.CompletionItemKind.Variable],
		[types.CompletionItemKind.Class, languages.CompletionItemKind.Class],
		[types.CompletionItemKind.Interface, languages.CompletionItemKind.Interface],
		[types.CompletionItemKind.Struct, languages.CompletionItemKind.Struct],
		[types.CompletionItemKind.Module, languages.CompletionItemKind.Module],
		[types.CompletionItemKind.Property, languages.CompletionItemKind.Property],
		[types.CompletionItemKind.Unit, languages.CompletionItemKind.Unit],
		[types.CompletionItemKind.Value, languages.CompletionItemKind.Value],
		[types.CompletionItemKind.Constant, languages.CompletionItemKind.Constant],
		[types.CompletionItemKind.Enum, languages.CompletionItemKind.Enum],
		[types.CompletionItemKind.EnumMember, languages.CompletionItemKind.EnumMember],
		[types.CompletionItemKind.Keyword, languages.CompletionItemKind.Keyword],
		[types.CompletionItemKind.Snippet, languages.CompletionItemKind.Snippet],
		[types.CompletionItemKind.Text, languages.CompletionItemKind.Text],
		[types.CompletionItemKind.Color, languages.CompletionItemKind.Color],
		[types.CompletionItemKind.File, languages.CompletionItemKind.File],
		[types.CompletionItemKind.Reference, languages.CompletionItemKind.Reference],
		[types.CompletionItemKind.Folder, languages.CompletionItemKind.Folder],
		[types.CompletionItemKind.Event, languages.CompletionItemKind.Event],
		[types.CompletionItemKind.Operator, languages.CompletionItemKind.Operator],
		[types.CompletionItemKind.TypeParameter, languages.CompletionItemKind.TypeParameter],
		[types.CompletionItemKind.Issue, languages.CompletionItemKind.Issue],
		[types.CompletionItemKind.User, languages.CompletionItemKind.User],
	]);

	export function from(kind: types.CompletionItemKind): languages.CompletionItemKind {
		return _from.get(kind) ?? languages.CompletionItemKind.Property;
	}

	const _to = new Map<languages.CompletionItemKind, types.CompletionItemKind>([
		[languages.CompletionItemKind.Method, types.CompletionItemKind.Method],
		[languages.CompletionItemKind.Function, types.CompletionItemKind.Function],
		[languages.CompletionItemKind.Constructor, types.CompletionItemKind.Constructor],
		[languages.CompletionItemKind.Field, types.CompletionItemKind.Field],
		[languages.CompletionItemKind.Variable, types.CompletionItemKind.Variable],
		[languages.CompletionItemKind.Class, types.CompletionItemKind.Class],
		[languages.CompletionItemKind.Interface, types.CompletionItemKind.Interface],
		[languages.CompletionItemKind.Struct, types.CompletionItemKind.Struct],
		[languages.CompletionItemKind.Module, types.CompletionItemKind.Module],
		[languages.CompletionItemKind.Property, types.CompletionItemKind.Property],
		[languages.CompletionItemKind.Unit, types.CompletionItemKind.Unit],
		[languages.CompletionItemKind.Value, types.CompletionItemKind.Value],
		[languages.CompletionItemKind.Constant, types.CompletionItemKind.Constant],
		[languages.CompletionItemKind.Enum, types.CompletionItemKind.Enum],
		[languages.CompletionItemKind.EnumMember, types.CompletionItemKind.EnumMember],
		[languages.CompletionItemKind.Keyword, types.CompletionItemKind.Keyword],
		[languages.CompletionItemKind.Snippet, types.CompletionItemKind.Snippet],
		[languages.CompletionItemKind.Text, types.CompletionItemKind.Text],
		[languages.CompletionItemKind.Color, types.CompletionItemKind.Color],
		[languages.CompletionItemKind.File, types.CompletionItemKind.File],
		[languages.CompletionItemKind.Reference, types.CompletionItemKind.Reference],
		[languages.CompletionItemKind.Folder, types.CompletionItemKind.Folder],
		[languages.CompletionItemKind.Event, types.CompletionItemKind.Event],
		[languages.CompletionItemKind.Operator, types.CompletionItemKind.Operator],
		[languages.CompletionItemKind.TypeParameter, types.CompletionItemKind.TypeParameter],
		[languages.CompletionItemKind.User, types.CompletionItemKind.User],
		[languages.CompletionItemKind.Issue, types.CompletionItemKind.Issue],
	]);

	export function to(kind: languages.CompletionItemKind): types.CompletionItemKind {
		return _to.get(kind) ?? types.CompletionItemKind.Property;
	}
}

export namespace CompletionItem {

	export function to(suggestion: languages.CompletionItem, converter?: Command.ICommandsConverter): types.CompletionItem {

		const result = new types.CompletionItem(suggestion.label);
		result.insertText = suggestion.insertText;
		result.kind = CompletionItemKind.to(suggestion.kind);
		result.tags = suggestion.tags?.map(CompletionItemTag.to);
		result.detail = suggestion.detail;
		result.documentation = htmlContent.isMarkdownString(suggestion.documentation) ? MarkdownString.to(suggestion.documentation) : suggestion.documentation;
		result.sortText = suggestion.sortText;
		result.filterText = suggestion.filterText;
		result.preselect = suggestion.preselect;
		result.commitCharacters = suggestion.commitCharacters;

		// range
		if (editorRange.Range.isIRange(suggestion.range)) {
			result.range = Range.to(suggestion.range);
		} else if (typeof suggestion.range === 'object') {
			result.range = { inserting: Range.to(suggestion.range.insert), replacing: Range.to(suggestion.range.replace) };
		}

		result.keepWhitespace = typeof suggestion.insertTextRules === 'undefined' ? false : Boolean(suggestion.insertTextRules & languages.CompletionItemInsertTextRule.KeepWhitespace);
		// 'insertText'-logic
		if (typeof suggestion.insertTextRules !== 'undefined' && suggestion.insertTextRules & languages.CompletionItemInsertTextRule.InsertAsSnippet) {
			result.insertText = new types.SnippetString(suggestion.insertText);
		} else {
			result.insertText = suggestion.insertText;
			result.textEdit = result.range instanceof types.Range ? new types.TextEdit(result.range, result.insertText) : undefined;
		}
		if (suggestion.additionalTextEdits && suggestion.additionalTextEdits.length > 0) {
			result.additionalTextEdits = suggestion.additionalTextEdits.map(e => TextEdit.to(e as languages.TextEdit));
		}
		result.command = converter && suggestion.command ? converter.fromInternal(suggestion.command) : undefined;

		return result;
	}
}

export namespace ParameterInformation {
	export function from(info: types.ParameterInformation): languages.ParameterInformation {
		return {
			label: info.label,
			documentation: MarkdownString.fromStrict(info.documentation)
		};
	}
	export function to(info: languages.ParameterInformation): types.ParameterInformation {
		return {
			label: info.label,
			documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation
		};
	}
}

export namespace SignatureInformation {

	export function from(info: types.SignatureInformation): languages.SignatureInformation {
		return {
			label: info.label,
			documentation: MarkdownString.fromStrict(info.documentation),
			parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.from) : [],
			activeParameter: info.activeParameter,
		};
	}

	export function to(info: languages.SignatureInformation): types.SignatureInformation {
		return {
			label: info.label,
			documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation,
			parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.to) : [],
			activeParameter: info.activeParameter,
		};
	}
}

export namespace SignatureHelp {

	export function from(help: types.SignatureHelp): languages.SignatureHelp {
		return {
			activeSignature: help.activeSignature,
			activeParameter: help.activeParameter,
			signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.from) : [],
		};
	}

	export function to(help: languages.SignatureHelp): types.SignatureHelp {
		return {
			activeSignature: help.activeSignature,
			activeParameter: help.activeParameter,
			signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.to) : [],
		};
	}
}

export namespace InlayHint {

	export function to(converter: Command.ICommandsConverter, hint: languages.InlayHint): vscode.InlayHint {
		const res = new types.InlayHint(
			Position.to(hint.position),
			typeof hint.label === 'string' ? hint.label : hint.label.map(InlayHintLabelPart.to.bind(undefined, converter)),
			hint.kind && InlayHintKind.to(hint.kind)
		);
		res.textEdits = hint.textEdits && hint.textEdits.map(TextEdit.to);
		res.tooltip = htmlContent.isMarkdownString(hint.tooltip) ? MarkdownString.to(hint.tooltip) : hint.tooltip;
		res.paddingLeft = hint.paddingLeft;
		res.paddingRight = hint.paddingRight;
		return res;
	}
}

export namespace InlayHintLabelPart {

	export function to(converter: Command.ICommandsConverter, part: languages.InlayHintLabelPart): types.InlayHintLabelPart {
		const result = new types.InlayHintLabelPart(part.label);
		result.tooltip = htmlContent.isMarkdownString(part.tooltip)
			? MarkdownString.to(part.tooltip)
			: part.tooltip;
		if (languages.Command.is(part.command)) {
			result.command = converter.fromInternal(part.command);
		}
		if (part.location) {
			result.location = location.to(part.location);
		}
		return result;
	}
}

export namespace InlayHintKind {
	export function from(kind: vscode.InlayHintKind): languages.InlayHintKind {
		return kind;
	}
	export function to(kind: languages.InlayHintKind): vscode.InlayHintKind {
		return kind;
	}
}

export namespace DocumentLink {

	export function from(link: vscode.DocumentLink): languages.ILink {
		return {
			range: Range.from(link.range),
			url: link.target,
			tooltip: link.tooltip
		};
	}

	export function to(link: languages.ILink): vscode.DocumentLink {
		let target: URI | undefined = undefined;
		if (link.url) {
			try {
				target = typeof link.url === 'string' ? URI.parse(link.url, true) : URI.revive(link.url);
			} catch (err) {
				// ignore
			}
		}
		return new types.DocumentLink(Range.to(link.range), target);
	}
}

export namespace ColorPresentation {
	export function to(colorPresentation: languages.IColorPresentation): types.ColorPresentation {
		const cp = new types.ColorPresentation(colorPresentation.label);
		if (colorPresentation.textEdit) {
			cp.textEdit = TextEdit.to(colorPresentation.textEdit);
		}
		if (colorPresentation.additionalTextEdits) {
			cp.additionalTextEdits = colorPresentation.additionalTextEdits.map(value => TextEdit.to(value));
		}
		return cp;
	}

	export function from(colorPresentation: vscode.ColorPresentation): languages.IColorPresentation {
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


export namespace SelectionRange {
	export function from(obj: vscode.SelectionRange): languages.SelectionRange {
		return { range: Range.from(obj.range) };
	}

	export function to(obj: languages.SelectionRange): vscode.SelectionRange {
		return new types.SelectionRange(Range.to(obj.range));
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

export namespace TextEditorLineNumbersStyle {
	export function from(style: vscode.TextEditorLineNumbersStyle): RenderLineNumbersType {
		switch (style) {
			case types.TextEditorLineNumbersStyle.Off:
				return RenderLineNumbersType.Off;
			case types.TextEditorLineNumbersStyle.Relative:
				return RenderLineNumbersType.Relative;
			case types.TextEditorLineNumbersStyle.On:
			default:
				return RenderLineNumbersType.On;
		}
	}
	export function to(style: RenderLineNumbersType): vscode.TextEditorLineNumbersStyle {
		switch (style) {
			case RenderLineNumbersType.Off:
				return types.TextEditorLineNumbersStyle.Off;
			case RenderLineNumbersType.Relative:
				return types.TextEditorLineNumbersStyle.Relative;
			case RenderLineNumbersType.On:
			default:
				return types.TextEditorLineNumbersStyle.On;
		}
	}
}

export namespace EndOfLine {

	export function from(eol: vscode.EndOfLine): EndOfLineSequence | undefined {
		if (eol === types.EndOfLine.CRLF) {
			return EndOfLineSequence.CRLF;
		} else if (eol === types.EndOfLine.LF) {
			return EndOfLineSequence.LF;
		}
		return undefined;
	}

	export function to(eol: EndOfLineSequence): vscode.EndOfLine | undefined {
		if (eol === EndOfLineSequence.CRLF) {
			return types.EndOfLine.CRLF;
		} else if (eol === EndOfLineSequence.LF) {
			return types.EndOfLine.LF;
		}
		return undefined;
	}
}

export namespace ProgressLocation {
	export function from(loc: vscode.ProgressLocation | { viewId: string }): MainProgressLocation | string {
		if (typeof loc === 'object') {
			return loc.viewId;
		}

		switch (loc) {
			case types.ProgressLocation.SourceControl: return MainProgressLocation.Scm;
			case types.ProgressLocation.Window: return MainProgressLocation.Window;
			case types.ProgressLocation.Notification: return MainProgressLocation.Notification;
		}
		throw new Error(`Unknown 'ProgressLocation'`);
	}
}

export namespace FoldingRange {
	export function from(r: vscode.FoldingRange): languages.FoldingRange {
		const range: languages.FoldingRange = { start: r.start + 1, end: r.end + 1 };
		if (r.kind) {
			range.kind = FoldingRangeKind.from(r.kind);
		}
		return range;
	}
}

export namespace FoldingRangeKind {
	export function from(kind: vscode.FoldingRangeKind | undefined): languages.FoldingRangeKind | undefined {
		if (kind) {
			switch (kind) {
				case types.FoldingRangeKind.Comment:
					return languages.FoldingRangeKind.Comment;
				case types.FoldingRangeKind.Imports:
					return languages.FoldingRangeKind.Imports;
				case types.FoldingRangeKind.Region:
					return languages.FoldingRangeKind.Region;
			}
		}
		return undefined;
	}
}

export interface TextEditorOpenOptions extends vscode.TextDocumentShowOptions {
	background?: boolean;
	override?: boolean;
}

export namespace TextEditorOpenOptions {

	export function from(options?: TextEditorOpenOptions): ITextEditorOptions | undefined {
		if (options) {
			return {
				pinned: typeof options.preview === 'boolean' ? !options.preview : undefined,
				inactive: options.background,
				preserveFocus: options.preserveFocus,
				selection: typeof options.selection === 'object' ? Range.from(options.selection) : undefined,
				override: typeof options.override === 'boolean' ? DEFAULT_EDITOR_ASSOCIATION.id : undefined
			};
		}

		return undefined;
	}

}

export namespace GlobPattern {

	export function from(pattern: vscode.GlobPattern): string | extHostProtocol.IRelativePatternDto;
	export function from(pattern: undefined): undefined;
	export function from(pattern: null): null;
	export function from(pattern: vscode.GlobPattern | undefined | null): string | extHostProtocol.IRelativePatternDto | undefined | null;
	export function from(pattern: vscode.GlobPattern | undefined | null): string | extHostProtocol.IRelativePatternDto | undefined | null {
		if (pattern instanceof types.RelativePattern) {
			return pattern.toJSON();
		}

		if (typeof pattern === 'string') {
			return pattern;
		}

		// This is slightly bogus because we declare this method to accept
		// `vscode.GlobPattern` which can be `vscode.RelativePattern` class,
		// but given we cannot enforce classes from our vscode.d.ts, we have
		// to probe for objects too
		// Refs: https://github.com/microsoft/vscode/issues/140771
		if (isRelativePatternShape(pattern) || isLegacyRelativePatternShape(pattern)) {
			return new types.RelativePattern(pattern.baseUri ?? pattern.base, pattern.pattern).toJSON();
		}

		return pattern; // preserve `undefined` and `null`
	}

	function isRelativePatternShape(obj: unknown): obj is { base: string; baseUri: URI; pattern: string } {
		const rp = obj as { base: string; baseUri: URI; pattern: string } | undefined | null;
		if (!rp) {
			return false;
		}

		return URI.isUri(rp.baseUri) && typeof rp.pattern === 'string';
	}

	function isLegacyRelativePatternShape(obj: unknown): obj is { base: string; pattern: string } {

		// Before 1.64.x, `RelativePattern` did not have any `baseUri: Uri`
		// property. To preserve backwards compatibility with older extensions
		// we allow this old format when creating the `vscode.RelativePattern`.

		const rp = obj as { base: string; pattern: string } | undefined | null;
		if (!rp) {
			return false;
		}

		return typeof rp.base === 'string' && typeof rp.pattern === 'string';
	}

	export function to(pattern: string | extHostProtocol.IRelativePatternDto): vscode.GlobPattern {
		if (typeof pattern === 'string') {
			return pattern;
		}

		return new types.RelativePattern(URI.revive(pattern.baseUri), pattern.pattern);
	}
}

export namespace LanguageSelector {

	export function from(selector: undefined): undefined;
	export function from(selector: vscode.DocumentSelector): languageSelector.LanguageSelector;
	export function from(selector: vscode.DocumentSelector | undefined): languageSelector.LanguageSelector | undefined;
	export function from(selector: vscode.DocumentSelector | undefined): languageSelector.LanguageSelector | undefined {
		if (!selector) {
			return undefined;
		} else if (Array.isArray(selector)) {
			return <languageSelector.LanguageSelector>selector.map(from);
		} else if (typeof selector === 'string') {
			return selector;
		} else {
			const filter = selector as vscode.DocumentFilter; // TODO: microsoft/TypeScript#42768
			return <languageSelector.LanguageFilter>{
				language: filter.language,
				scheme: filter.scheme,
				pattern: GlobPattern.from(filter.pattern),
				exclusive: filter.exclusive,
				notebookType: filter.notebookType
			};
		}
	}
}

export namespace NotebookRange {

	export function from(range: vscode.NotebookRange): ICellRange {
		return { start: range.start, end: range.end };
	}

	export function to(range: ICellRange): types.NotebookRange {
		return new types.NotebookRange(range.start, range.end);
	}
}

export namespace NotebookCellExecutionSummary {
	export function to(data: notebooks.NotebookCellInternalMetadata): vscode.NotebookCellExecutionSummary {
		return {
			timing: typeof data.runStartTime === 'number' && typeof data.runEndTime === 'number' ? { startTime: data.runStartTime, endTime: data.runEndTime } : undefined,
			executionOrder: data.executionOrder,
			success: data.lastRunSuccess
		};
	}

	export function from(data: vscode.NotebookCellExecutionSummary): Partial<notebooks.NotebookCellInternalMetadata> {
		return {
			lastRunSuccess: data.success,
			runStartTime: data.timing?.startTime,
			runEndTime: data.timing?.endTime,
			executionOrder: data.executionOrder
		};
	}
}

export namespace NotebookCellExecutionState {
	export function to(state: notebooks.NotebookCellExecutionState): vscode.NotebookCellExecutionState | undefined {
		if (state === notebooks.NotebookCellExecutionState.Unconfirmed) {
			return types.NotebookCellExecutionState.Pending;
		} else if (state === notebooks.NotebookCellExecutionState.Pending) {
			// Since the (proposed) extension API doesn't have the distinction between Unconfirmed and Pending, we don't want to fire an update for Pending twice
			return undefined;
		} else if (state === notebooks.NotebookCellExecutionState.Executing) {
			return types.NotebookCellExecutionState.Executing;
		} else {
			throw new Error(`Unknown state: ${state}`);
		}
	}
}

export namespace NotebookCellKind {
	export function from(data: vscode.NotebookCellKind): notebooks.CellKind {
		switch (data) {
			case types.NotebookCellKind.Markup:
				return notebooks.CellKind.Markup;
			case types.NotebookCellKind.Code:
			default:
				return notebooks.CellKind.Code;
		}
	}

	export function to(data: notebooks.CellKind): vscode.NotebookCellKind {
		switch (data) {
			case notebooks.CellKind.Markup:
				return types.NotebookCellKind.Markup;
			case notebooks.CellKind.Code:
			default:
				return types.NotebookCellKind.Code;
		}
	}
}

export namespace NotebookData {

	export function from(data: vscode.NotebookData): extHostProtocol.NotebookDataDto {
		const res: extHostProtocol.NotebookDataDto = {
			metadata: data.metadata ?? Object.create(null),
			cells: [],
		};
		for (const cell of data.cells) {
			types.NotebookCellData.validate(cell);
			res.cells.push(NotebookCellData.from(cell));
		}
		return res;
	}

	export function to(data: extHostProtocol.NotebookDataDto): vscode.NotebookData {
		const res = new types.NotebookData(
			data.cells.map(NotebookCellData.to),
		);
		if (!isEmptyObject(data.metadata)) {
			res.metadata = data.metadata;
		}
		return res;
	}
}

export namespace NotebookCellData {

	export function from(data: vscode.NotebookCellData): extHostProtocol.NotebookCellDataDto {
		return {
			cellKind: NotebookCellKind.from(data.kind),
			language: data.languageId,
			mime: data.mime,
			source: data.value,
			metadata: data.metadata,
			internalMetadata: NotebookCellExecutionSummary.from(data.executionSummary ?? {}),
			outputs: data.outputs ? data.outputs.map(NotebookCellOutput.from) : []
		};
	}

	export function to(data: extHostProtocol.NotebookCellDataDto): vscode.NotebookCellData {
		return new types.NotebookCellData(
			NotebookCellKind.to(data.cellKind),
			data.source,
			data.language,
			data.mime,
			data.outputs ? data.outputs.map(NotebookCellOutput.to) : undefined,
			data.metadata,
			data.internalMetadata ? NotebookCellExecutionSummary.to(data.internalMetadata) : undefined
		);
	}
}

export namespace NotebookCellOutputItem {
	export function from(item: types.NotebookCellOutputItem): extHostProtocol.NotebookOutputItemDto {
		return {
			mime: item.mime,
			valueBytes: VSBuffer.wrap(item.data),
		};
	}

	export function to(item: extHostProtocol.NotebookOutputItemDto): types.NotebookCellOutputItem {
		return new types.NotebookCellOutputItem(item.valueBytes.buffer, item.mime);
	}
}

export namespace NotebookCellOutput {
	export function from(output: vscode.NotebookCellOutput): extHostProtocol.NotebookOutputDto {
		return {
			outputId: output.id,
			items: output.items.map(NotebookCellOutputItem.from),
			metadata: output.metadata
		};
	}

	export function to(output: extHostProtocol.NotebookOutputDto): vscode.NotebookCellOutput {
		const items = output.items.map(NotebookCellOutputItem.to);
		return new types.NotebookCellOutput(items, output.outputId, output.metadata);
	}
}


export namespace NotebookExclusiveDocumentPattern {
	export function from(pattern: { include: vscode.GlobPattern | undefined; exclude: vscode.GlobPattern | undefined }): { include: string | extHostProtocol.IRelativePatternDto | undefined; exclude: string | extHostProtocol.IRelativePatternDto | undefined };
	export function from(pattern: vscode.GlobPattern): string | extHostProtocol.IRelativePatternDto;
	export function from(pattern: undefined): undefined;
	export function from(pattern: { include: vscode.GlobPattern | undefined | null; exclude: vscode.GlobPattern | undefined } | vscode.GlobPattern | undefined): string | extHostProtocol.IRelativePatternDto | { include: string | extHostProtocol.IRelativePatternDto | undefined; exclude: string | extHostProtocol.IRelativePatternDto | undefined } | undefined;
	export function from(pattern: { include: vscode.GlobPattern | undefined | null; exclude: vscode.GlobPattern | undefined } | vscode.GlobPattern | undefined): string | extHostProtocol.IRelativePatternDto | { include: string | extHostProtocol.IRelativePatternDto | undefined; exclude: string | extHostProtocol.IRelativePatternDto | undefined } | undefined {
		if (isExclusivePattern(pattern)) {
			return {
				include: withNullAsUndefined(GlobPattern.from(pattern.include)),
				exclude: withNullAsUndefined(GlobPattern.from(pattern.exclude))
			};
		}

		return withNullAsUndefined(GlobPattern.from(pattern));
	}

	export function to(pattern: string | extHostProtocol.IRelativePatternDto | { include: string | extHostProtocol.IRelativePatternDto; exclude: string | extHostProtocol.IRelativePatternDto }): { include: vscode.GlobPattern; exclude: vscode.GlobPattern } | vscode.GlobPattern {
		if (isExclusivePattern(pattern)) {
			return {
				include: GlobPattern.to(pattern.include),
				exclude: GlobPattern.to(pattern.exclude)
			};
		}

		return GlobPattern.to(pattern);
	}

	function isExclusivePattern<T>(obj: any): obj is { include?: T; exclude?: T } {
		const ep = obj as { include?: T; exclude?: T } | undefined | null;
		if (!ep) {
			return false;
		}
		return !isUndefinedOrNull(ep.include) && !isUndefinedOrNull(ep.exclude);
	}
}

export namespace NotebookStatusBarItem {
	export function from(item: vscode.NotebookCellStatusBarItem, commandsConverter: Command.ICommandsConverter, disposables: DisposableStore): notebooks.INotebookCellStatusBarItem {
		const command = typeof item.command === 'string' ? { title: '', command: item.command } : item.command;
		return {
			alignment: item.alignment === types.NotebookCellStatusBarAlignment.Left ? notebooks.CellStatusbarAlignment.Left : notebooks.CellStatusbarAlignment.Right,
			command: commandsConverter.toInternal(command, disposables), // TODO@roblou
			text: item.text,
			tooltip: item.tooltip,
			accessibilityInformation: item.accessibilityInformation,
			priority: item.priority
		};
	}
}

export namespace NotebookDocumentContentOptions {
	export function from(options: vscode.NotebookDocumentContentOptions | undefined): notebooks.TransientOptions {
		return {
			transientOutputs: options?.transientOutputs ?? false,
			transientCellMetadata: options?.transientCellMetadata ?? {},
			transientDocumentMetadata: options?.transientDocumentMetadata ?? {}
		};
	}
}

export namespace NotebookRendererScript {
	export function from(preload: vscode.NotebookRendererScript): { uri: UriComponents; provides: readonly string[] } {
		return {
			uri: preload.uri,
			provides: preload.provides
		};
	}

	export function to(preload: { uri: UriComponents; provides: readonly string[] }): vscode.NotebookRendererScript {
		return new types.NotebookRendererScript(URI.revive(preload.uri), preload.provides);
	}
}

export namespace TestMessage {
	export function from(message: vscode.TestMessage): ITestErrorMessage.Serialized {
		return {
			message: MarkdownString.fromStrict(message.message) || '',
			type: TestMessageType.Error,
			expected: message.expectedOutput,
			actual: message.actualOutput,
			location: message.location && ({ range: Range.from(message.location.range), uri: message.location.uri }),
		};
	}

	export function to(item: ITestErrorMessage.Serialized): vscode.TestMessage {
		const message = new types.TestMessage(typeof item.message === 'string' ? item.message : MarkdownString.to(item.message));
		message.actualOutput = item.actual;
		message.expectedOutput = item.expected;
		message.location = item.location ? location.to(item.location) : undefined;
		return message;
	}
}

export namespace TestTag {
	export const namespace = namespaceTestTag;

	export const denamespace = denamespaceTestTag;
}

export namespace TestItem {
	export type Raw = vscode.TestItem;

	export function from(item: vscode.TestItem): ITestItem {
		const ctrlId = getPrivateApiFor(item).controllerId;
		return {
			extId: TestId.fromExtHostTestItem(item, ctrlId).toString(),
			label: item.label,
			uri: URI.revive(item.uri),
			busy: item.busy,
			tags: item.tags.map(t => TestTag.namespace(ctrlId, t.id)),
			range: editorRange.Range.lift(Range.from(item.range)),
			description: item.description || null,
			sortText: item.sortText || null,
			error: item.error ? (MarkdownString.fromStrict(item.error) || null) : null,
		};
	}

	export function toPlain(item: ITestItem.Serialized): vscode.TestItem {
		return {
			parent: undefined,
			error: undefined,
			id: TestId.fromString(item.extId).localId,
			label: item.label,
			uri: URI.revive(item.uri),
			tags: (item.tags || []).map(t => {
				const { tagId } = TestTag.denamespace(t);
				return new types.TestTag(tagId);
			}),
			children: {
				add: () => { },
				delete: () => { },
				forEach: () => { },
				*[Symbol.iterator]() { },
				get: () => undefined,
				replace: () => { },
				size: 0,
			},
			range: Range.to(item.range || undefined),
			canResolveChildren: false,
			busy: item.busy,
			description: item.description || undefined,
			sortText: item.sortText || undefined,
		};
	}
}

export namespace TestTag {
	export function from(tag: vscode.TestTag): ITestTag {
		return { id: tag.id };
	}

	export function to(tag: ITestTag): vscode.TestTag {
		return new types.TestTag(tag.id);
	}
}

export namespace TestResults {
	const convertTestResultItem = (item: TestResultItem.Serialized, byInternalId: Map<string, TestResultItem.Serialized>): vscode.TestResultSnapshot => {
		const children: TestResultItem.Serialized[] = [];
		for (const [id, item] of byInternalId) {
			if (TestId.compare(item.item.extId, id) === TestPosition.IsChild) {
				byInternalId.delete(id);
				children.push(item);
			}
		}

		const snapshot: vscode.TestResultSnapshot = ({
			...TestItem.toPlain(item.item),
			parent: undefined,
			taskStates: item.tasks.map(t => ({
				state: t.state as number as types.TestResultState,
				duration: t.duration,
				messages: t.messages
					.filter((m): m is ITestErrorMessage.Serialized => m.type === TestMessageType.Error)
					.map(TestMessage.to),
			})),
			children: children.map(c => convertTestResultItem(c, byInternalId))
		});

		for (const child of snapshot.children) {
			(child as any).parent = snapshot;
		}

		return snapshot;
	};

	export function to(serialized: ISerializedTestResults): vscode.TestRunResult {
		const roots: TestResultItem.Serialized[] = [];
		const byInternalId = new Map<string, TestResultItem.Serialized>();
		for (const item of serialized.items) {
			byInternalId.set(item.item.extId, item);
			if (serialized.request.targets.some(t => t.controllerId === item.controllerId && t.testIds.includes(item.item.extId))) {
				roots.push(item);
			}
		}

		return {
			completedAt: serialized.completedAt,
			results: roots.map(r => convertTestResultItem(r, byInternalId)),
		};
	}
}

export namespace TestCoverage {
	function fromCoveredCount(count: vscode.CoveredCount): ICoveredCount {
		return { covered: count.covered, total: count.covered };
	}

	function fromLocation(location: vscode.Range | vscode.Position) {
		return 'line' in location ? Position.from(location) : Range.from(location);
	}

	export function fromDetailed(coverage: vscode.DetailedCoverage): CoverageDetails {
		if ('branches' in coverage) {
			return {
				count: coverage.executionCount,
				location: fromLocation(coverage.location),
				type: DetailType.Statement,
				branches: coverage.branches.length
					? coverage.branches.map(b => ({ count: b.executionCount, location: b.location && fromLocation(b.location) }))
					: undefined,
			};
		} else {
			return {
				type: DetailType.Function,
				count: coverage.executionCount,
				location: fromLocation(coverage.location),
			};
		}
	}

	export function fromFile(coverage: vscode.FileCoverage): IFileCoverage {
		return {
			uri: coverage.uri,
			statement: fromCoveredCount(coverage.statementCoverage),
			branch: coverage.branchCoverage && fromCoveredCount(coverage.branchCoverage),
			function: coverage.functionCoverage && fromCoveredCount(coverage.functionCoverage),
			details: coverage.detailedCoverage?.map(fromDetailed),
		};
	}
}

export namespace CodeActionTriggerKind {

	export function to(value: languages.CodeActionTriggerType): types.CodeActionTriggerKind {
		switch (value) {
			case languages.CodeActionTriggerType.Invoke:
				return types.CodeActionTriggerKind.Invoke;

			case languages.CodeActionTriggerType.Auto:
				return types.CodeActionTriggerKind.Automatic;
		}
	}
}

export namespace TypeHierarchyItem {

	export function to(item: extHostProtocol.ITypeHierarchyItemDto): types.TypeHierarchyItem {
		const result = new types.TypeHierarchyItem(
			SymbolKind.to(item.kind),
			item.name,
			item.detail || '',
			URI.revive(item.uri),
			Range.to(item.range),
			Range.to(item.selectionRange)
		);

		result._sessionId = item._sessionId;
		result._itemId = item._itemId;

		return result;
	}

	export function from(item: vscode.TypeHierarchyItem, sessionId?: string, itemId?: string): extHostProtocol.ITypeHierarchyItemDto {

		sessionId = sessionId ?? (<types.TypeHierarchyItem>item)._sessionId;
		itemId = itemId ?? (<types.TypeHierarchyItem>item)._itemId;

		if (sessionId === undefined || itemId === undefined) {
			throw new Error('invalid item');
		}

		return {
			_sessionId: sessionId,
			_itemId: itemId,
			kind: SymbolKind.from(item.kind),
			name: item.name,
			detail: item.detail ?? '',
			uri: item.uri,
			range: Range.from(item.range),
			selectionRange: Range.from(item.selectionRange),
			tags: item.tags?.map(SymbolTag.from)
		};
	}
}

export namespace ViewBadge {
	export function from(badge: vscode.ViewBadge | undefined): IViewBadge | undefined {
		if (!badge) {
			return undefined;
		}

		return {
			value: badge.value,
			tooltip: badge.tooltip
		};
	}
}

export namespace DataTransferItem {
	export function toDataTransferItem(item: extHostProtocol.DataTransferItemDTO, resolveFileData: () => Promise<Uint8Array>): types.DataTransferItem {
		const file = item.fileData;
		if (file) {
			return new class extends types.DataTransferItem {
				override asFile(): vscode.DataTransferFile {
					return {
						name: file.name,
						uri: URI.revive(file.uri),
						data: once(() => resolveFileData()),
					};
				}
			}('');
		} else {
			return new types.DataTransferItem(item.asString);
		}
	}
}

export namespace DataTransfer {
	export function toDataTransfer(value: extHostProtocol.DataTransferDTO, resolveFileData: (dataItemIndex: number) => Promise<Uint8Array>): types.DataTransfer {
		const init = value.items.map(([type, item], index) => {
			return [type, DataTransferItem.toDataTransferItem(item, () => resolveFileData(index))] as const;
		});
		return new types.DataTransfer(init);
	}

	export async function toDataTransferDTO(value: vscode.DataTransfer | VSDataTransfer): Promise<extHostProtocol.DataTransferDTO> {
		const newDTO: extHostProtocol.DataTransferDTO = { items: [] };

		const promises: Promise<any>[] = [];
		value.forEach((value, key) => {
			promises.push((async () => {
				const stringValue = await value.asString();
				const fileValue = value.asFile();
				newDTO.items.push([key, {
					asString: stringValue,
					fileData: fileValue ? { name: fileValue.name, uri: fileValue.uri } : undefined,
				}]);
			})());
		});

		await Promise.all(promises);

		return newDTO;
	}
}
