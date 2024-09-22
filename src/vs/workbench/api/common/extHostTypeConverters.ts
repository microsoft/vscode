/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { asArray, coalesce, isNonEmptyArray } from '../../../base/common/arrays.js';
import { VSBuffer, encodeBase64 } from '../../../base/common/buffer.js';
import { IDataTransferFile, IDataTransferItem, UriList } from '../../../base/common/dataTransfer.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import * as htmlContent from '../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import * as marked from '../../../base/common/marked/marked.js';
import { parse, revive } from '../../../base/common/marshalling.js';
import { Mimes } from '../../../base/common/mime.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { IPrefixTreeNode, WellDefinedPrefixTree } from '../../../base/common/prefixTree.js';
import { basename } from '../../../base/common/resources.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isDefined, isEmptyObject, isNumber, isString, isUndefinedOrNull } from '../../../base/common/types.js';
import { URI, UriComponents, isUriComponents } from '../../../base/common/uri.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';
import { RenderLineNumbersType } from '../../../editor/common/config/editorOptions.js';
import { IPosition } from '../../../editor/common/core/position.js';
import * as editorRange from '../../../editor/common/core/range.js';
import { ISelection } from '../../../editor/common/core/selection.js';
import { IContentDecorationRenderOptions, IDecorationOptions, IDecorationRenderOptions, IThemeDecorationRenderOptions } from '../../../editor/common/editorCommon.js';
import * as encodedTokenAttributes from '../../../editor/common/encodedTokenAttributes.js';
import * as languageSelector from '../../../editor/common/languageSelector.js';
import * as languages from '../../../editor/common/languages.js';
import { EndOfLineSequence, TrackedRangeStickiness } from '../../../editor/common/model.js';
import { ITextEditorOptions } from '../../../platform/editor/common/editor.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { IMarkerData, IRelatedInformation, MarkerSeverity, MarkerTag } from '../../../platform/markers/common/markers.js';
import { ProgressLocation as MainProgressLocation } from '../../../platform/progress/common/progress.js';
import { DEFAULT_EDITOR_ASSOCIATION, SaveReason } from '../../common/editor.js';
import { IViewBadge } from '../../common/views.js';
import { ChatAgentLocation, IChatAgentRequest, IChatAgentResult } from '../../contrib/chat/common/chatAgents.js';
import { IChatRequestVariableEntry } from '../../contrib/chat/common/chatModel.js';
import { IChatAgentDetection, IChatAgentMarkdownContentWithVulnerability, IChatCodeCitation, IChatCommandButton, IChatConfirmation, IChatContentInlineReference, IChatContentReference, IChatFollowup, IChatMarkdownContent, IChatMoveMessage, IChatProgressMessage, IChatResponseCodeblockUriPart, IChatTaskDto, IChatTaskResult, IChatTextEdit, IChatTreeData, IChatUserActionEvent, IChatWarningMessage } from '../../contrib/chat/common/chatService.js';
import { IToolData } from '../../contrib/chat/common/languageModelToolsService.js';
import * as chatProvider from '../../contrib/chat/common/languageModels.js';
import { DebugTreeItemCollapsibleState, IDebugVisualizationTreeItem } from '../../contrib/debug/common/debug.js';
import * as notebooks from '../../contrib/notebook/common/notebookCommon.js';
import { ICellRange } from '../../contrib/notebook/common/notebookRange.js';
import * as search from '../../contrib/search/common/search.js';
import { TestId } from '../../contrib/testing/common/testId.js';
import { CoverageDetails, DetailType, ICoverageCount, IFileCoverage, ISerializedTestResults, ITestErrorMessage, ITestItem, ITestTag, TestMessageType, TestResultItem, denamespaceTestTag, namespaceTestTag } from '../../contrib/testing/common/testTypes.js';
import { EditorGroupColumn } from '../../services/editor/common/editorGroupColumn.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import * as extHostProtocol from './extHost.protocol.js';
import { CommandsConverter } from './extHostCommands.js';
import { getPrivateApiFor } from './extHostTestingPrivateApi.js';
import * as types from './extHostTypes.js';

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

export namespace Location {

	export function from(location: vscode.Location): Dto<languages.Location> {
		return {
			uri: location.uri,
			range: Range.from(location.range)
		};
	}

	export function to(location: Dto<languages.Location>): vscode.Location {
		return new types.Location(URI.revive(location.uri), Range.to(location.range));
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

	export function from(value: vscode.DocumentSelector, uriTransformer?: IURITransformer, extension?: IExtensionDescription): extHostProtocol.IDocumentFilterDto[] {
		return coalesce(asArray(value).map(sel => _doTransformDocumentSelector(sel, uriTransformer, extension)));
	}

	function _doTransformDocumentSelector(selector: string | vscode.DocumentFilter, uriTransformer: IURITransformer | undefined, extension: IExtensionDescription | undefined): extHostProtocol.IDocumentFilterDto | undefined {
		if (typeof selector === 'string') {
			return {
				$serialized: true,
				language: selector,
				isBuiltin: extension?.isBuiltin,
			};
		}

		if (selector) {
			return {
				$serialized: true,
				language: selector.language,
				scheme: _transformScheme(selector.scheme, uriTransformer),
				pattern: GlobPattern.from(selector.pattern) ?? undefined,
				exclusive: selector.exclusive,
				notebookType: selector.notebookType,
				isBuiltin: extension?.isBuiltin
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

		const collectUri = ({ href }: { href: string }): string => {
			try {
				let uri = URI.parse(href, true);
				uri = uri.with({ query: _uriMassage(uri.query, resUris) });
				resUris[href] = uri;
			} catch (e) {
				// ignore
			}
			return '';
		};

		marked.marked.walkTokens(marked.marked.lexer(res.value), token => {
			if (token.type === 'link') {
				collectUri({ href: token.href });
			} else if (token.type === 'image') {
				if (typeof token.href === 'string') {
					collectUri(htmlContent.parseHrefAndDimensions(token.href));
				}
			}
		});

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
		return {
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

	export function from(value: vscode.WorkspaceEdit, versionInfo?: IVersionInformationProvider): extHostProtocol.IWorkspaceEditDto {
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
					let contents: { type: 'base64'; value: string } | { type: 'dataTransferItem'; id: string } | undefined;
					if (entry.options?.contents) {
						if (ArrayBuffer.isView(entry.options.contents)) {
							contents = { type: 'base64', value: encodeBase64(VSBuffer.wrap(entry.options.contents)) };
						} else {
							contents = { type: 'dataTransferItem', id: (entry.options.contents as types.DataTransferFile)._itemId };
						}
					}

					// file operation
					result.edits.push(<extHostProtocol.IWorkspaceFileEditDto>{
						oldResource: entry.from,
						newResource: entry.to,
						options: { ...entry.options, contents },
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
		const edits = new ResourceMap<(types.TextEdit | types.SnippetTextEdit)[]>();
		for (const edit of value.edits) {
			if ((<extHostProtocol.IWorkspaceTextEditDto>edit).textEdit) {

				const item = <extHostProtocol.IWorkspaceTextEditDto>edit;
				const uri = URI.revive(item.resource);
				const range = Range.to(item.textEdit.range);
				const text = item.textEdit.text;
				const isSnippet = item.textEdit.insertAsSnippet;

				let editOrSnippetTest: types.TextEdit | types.SnippetTextEdit;
				if (isSnippet) {
					editOrSnippetTest = types.SnippetTextEdit.replace(range, new types.SnippetString(text));
				} else {
					editOrSnippetTest = types.TextEdit.replace(range, text);
				}

				const array = edits.get(uri);
				if (!array) {
					edits.set(uri, [editOrSnippetTest]);
				} else {
					array.push(editOrSnippetTest);
				}

			} else {
				result.renameFile(
					URI.revive((<extHostProtocol.IWorkspaceFileEditDto>edit).oldResource!),
					URI.revive((<extHostProtocol.IWorkspaceFileEditDto>edit).newResource!),
					(<extHostProtocol.IWorkspaceFileEditDto>edit).options
				);
			}
		}

		for (const [uri, array] of edits) {
			result.set(uri, array);
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
		return {
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
	export function from(hover: vscode.VerboseHover): languages.Hover {
		const convertedHover: languages.Hover = {
			range: Range.from(hover.range),
			contents: MarkdownString.fromMany(hover.contents),
			canIncreaseVerbosity: hover.canIncreaseVerbosity,
			canDecreaseVerbosity: hover.canDecreaseVerbosity,
		};
		return convertedHover;
	}

	export function to(info: languages.Hover): types.VerboseHover {
		const contents = info.contents.map(MarkdownString.to);
		const range = Range.to(info.range);
		const canIncreaseVerbosity = info.canIncreaseVerbosity;
		const canDecreaseVerbosity = info.canDecreaseVerbosity;
		return new types.VerboseHover(contents, range, canIncreaseVerbosity, canDecreaseVerbosity);
	}
}

export namespace EvaluatableExpression {
	export function from(expression: vscode.EvaluatableExpression): languages.EvaluatableExpression {
		return {
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
			return {
				type: 'text',
				range: Range.from(inlineValue.range),
				text: inlineValue.text
			} satisfies languages.InlineValueText;
		} else if (inlineValue instanceof types.InlineValueVariableLookup) {
			return {
				type: 'variable',
				range: Range.from(inlineValue.range),
				variableName: inlineValue.variableName,
				caseSensitiveLookup: inlineValue.caseSensitiveLookup
			} satisfies languages.InlineValueVariableLookup;
		} else if (inlineValue instanceof types.InlineValueEvaluatableExpression) {
			return {
				type: 'expression',
				range: Range.from(inlineValue.range),
				expression: inlineValue.expression
			} satisfies languages.InlineValueExpression;
		} else {
			throw new Error(`Unknown 'InlineValue' type`);
		}
	}

	export function to(inlineValue: languages.InlineValue): vscode.InlineValue {
		switch (inlineValue.type) {
			case 'text':
				return {
					range: Range.to(inlineValue.range),
					text: inlineValue.text
				} satisfies vscode.InlineValueText;
			case 'variable':
				return {
					range: Range.to(inlineValue.range),
					variableName: inlineValue.variableName,
					caseSensitiveLookup: inlineValue.caseSensitiveLookup
				} satisfies vscode.InlineValueVariableLookup;
			case 'expression':
				return {
					range: Range.to(inlineValue.range),
					expression: inlineValue.expression
				} satisfies vscode.InlineValueEvaluatableExpression;
		}
	}
}

export namespace InlineValueContext {
	export function from(inlineValueContext: vscode.InlineValueContext): extHostProtocol.IInlineValueContextDto {
		return {
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

export namespace MultiDocumentHighlight {
	export function from(multiDocumentHighlight: vscode.MultiDocumentHighlight): languages.MultiDocumentHighlight {
		return {
			uri: multiDocumentHighlight.uri,
			highlights: multiDocumentHighlight.highlights.map(DocumentHighlight.from)
		};
	}

	export function to(multiDocumentHighlight: languages.MultiDocumentHighlight): types.MultiDocumentHighlight {
		return new types.MultiDocumentHighlight(URI.revive(multiDocumentHighlight.uri), multiDocumentHighlight.highlights.map(DocumentHighlight.to));
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
		if (typeof info.label !== 'string' && !Array.isArray(info.label)) {
			throw new TypeError('Invalid label');
		}

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
		const result = new types.DocumentLink(Range.to(link.range), target);
		result.tooltip = link.tooltip;
		return result;
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
			case types.TextEditorLineNumbersStyle.Interval:
				return RenderLineNumbersType.Interval;
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
			case RenderLineNumbersType.Interval:
				return types.TextEditorLineNumbersStyle.Interval;
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
	export function to(r: languages.FoldingRange): vscode.FoldingRange {
		const range: vscode.FoldingRange = { start: r.start - 1, end: r.end - 1 };
		if (r.kind) {
			range.kind = FoldingRangeKind.to(r.kind);
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
	export function to(kind: languages.FoldingRangeKind | undefined): vscode.FoldingRangeKind | undefined {
		if (kind) {
			switch (kind.value) {
				case languages.FoldingRangeKind.Comment.value:
					return types.FoldingRangeKind.Comment;
				case languages.FoldingRangeKind.Imports.value:
					return types.FoldingRangeKind.Imports;
				case languages.FoldingRangeKind.Region.value:
					return types.FoldingRangeKind.Region;
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

export namespace MappedEditsContext {

	export function is(v: unknown): v is vscode.MappedEditsContext {
		return (
			!!v && typeof v === 'object' &&
			'documents' in v &&
			Array.isArray(v.documents) &&
			v.documents.every(
				subArr => Array.isArray(subArr) &&
					subArr.every(DocumentContextItem.is))
		);
	}

	export function from(extContext: vscode.MappedEditsContext): languages.MappedEditsContext {
		return {
			documents: extContext.documents.map((subArray) =>
				subArray.map(DocumentContextItem.from)
			),
			conversation: extContext.conversation?.map(item => (
				(item.type === 'request') ?
					{
						type: 'request',
						message: item.message,
					} :
					{
						type: 'response',
						message: item.message,
						references: item.references?.map(DocumentContextItem.from)
					}
			))
		};

	}
}

export namespace DocumentContextItem {

	export function is(item: unknown): item is vscode.DocumentContextItem {
		return (
			typeof item === 'object' &&
			item !== null &&
			'uri' in item && URI.isUri(item.uri) &&
			'version' in item && typeof item.version === 'number' &&
			'ranges' in item && Array.isArray(item.ranges) && item.ranges.every((r: unknown) => r instanceof types.Range)
		);
	}

	export function from(item: vscode.DocumentContextItem): languages.DocumentContextItem {
		return {
			uri: URI.from(item.uri),
			version: item.version,
			ranges: item.ranges.map(r => Range.from(r)),
		};
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
				include: GlobPattern.from(pattern.include) ?? undefined,
				exclude: GlobPattern.from(pattern.exclude) ?? undefined,
			};
		}

		return GlobPattern.from(pattern) ?? undefined;
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

export namespace NotebookKernelSourceAction {
	export function from(item: vscode.NotebookKernelSourceAction, commandsConverter: Command.ICommandsConverter, disposables: DisposableStore): notebooks.INotebookKernelSourceAction {
		const command = typeof item.command === 'string' ? { title: '', command: item.command } : item.command;

		return {
			command: commandsConverter.toInternal(command, disposables),
			label: item.label,
			description: item.description,
			detail: item.detail,
			documentation: item.documentation
		};
	}
}

export namespace NotebookDocumentContentOptions {
	export function from(options: vscode.NotebookDocumentContentOptions | undefined): notebooks.TransientOptions {
		return {
			transientOutputs: options?.transientOutputs ?? false,
			transientCellMetadata: options?.transientCellMetadata ?? {},
			transientDocumentMetadata: options?.transientDocumentMetadata ?? {},
			cellContentMetadata: options?.cellContentMetadata ?? {}
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
			contextValue: message.contextValue,
			location: message.location && ({ range: Range.from(message.location.range), uri: message.location.uri }),
			stackTrace: message.stackTrace?.map(s => ({
				label: s.label,
				position: s.position && Position.from(s.position),
				uri: s.uri && URI.revive(s.uri).toJSON(),
			})),
		};
	}

	export function to(item: ITestErrorMessage.Serialized): vscode.TestMessage {
		const message = new types.TestMessage(typeof item.message === 'string' ? item.message : MarkdownString.to(item.message));
		message.actualOutput = item.actual;
		message.expectedOutput = item.expected;
		message.contextValue = item.contextValue;
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
	const convertTestResultItem = (node: IPrefixTreeNode<TestResultItem.Serialized>, parent?: vscode.TestResultSnapshot): vscode.TestResultSnapshot | undefined => {
		const item = node.value;
		if (!item) {
			return undefined; // should be unreachable
		}

		const snapshot: vscode.TestResultSnapshot = ({
			...TestItem.toPlain(item.item),
			parent,
			taskStates: item.tasks.map(t => ({
				state: t.state as number as types.TestResultState,
				duration: t.duration,
				messages: t.messages
					.filter((m): m is ITestErrorMessage.Serialized => m.type === TestMessageType.Error)
					.map(TestMessage.to),
			})),
			children: [],
		});

		if (node.children) {
			for (const child of node.children.values()) {
				const c = convertTestResultItem(child, snapshot);
				if (c) {
					snapshot.children.push(c);
				}
			}
		}

		return snapshot;
	};

	export function to(serialized: ISerializedTestResults): vscode.TestRunResult {
		const tree = new WellDefinedPrefixTree<TestResultItem.Serialized>();
		for (const item of serialized.items) {
			tree.insert(TestId.fromString(item.item.extId).path, item);
		}

		// Get the first node with a value in each subtree of IDs.
		const queue = [tree.nodes];
		const roots: IPrefixTreeNode<TestResultItem.Serialized>[] = [];
		while (queue.length) {
			for (const node of queue.pop()!) {
				if (node.value) {
					roots.push(node);
				} else if (node.children) {
					queue.push(node.children.values());
				}
			}
		}

		return {
			completedAt: serialized.completedAt,
			results: roots.map(r => convertTestResultItem(r)).filter(isDefined),
		};
	}
}

export namespace TestCoverage {
	function fromCoverageCount(count: vscode.TestCoverageCount): ICoverageCount {
		return { covered: count.covered, total: count.total };
	}

	function fromLocation(location: vscode.Range | vscode.Position) {
		return 'line' in location ? Position.from(location) : Range.from(location);
	}

	function toLocation(location: IPosition | editorRange.IRange): types.Position | types.Range;
	function toLocation(location: IPosition | editorRange.IRange | undefined): types.Position | types.Range | undefined;
	function toLocation(location: IPosition | editorRange.IRange | undefined): types.Position | types.Range | undefined {
		if (!location) { return undefined; }
		return 'endLineNumber' in location ? Range.to(location) : Position.to(location);
	}

	export function to(serialized: CoverageDetails.Serialized): vscode.FileCoverageDetail {
		if (serialized.type === DetailType.Statement) {
			const branches: vscode.BranchCoverage[] = [];
			if (serialized.branches) {
				for (const branch of serialized.branches) {
					branches.push({
						executed: branch.count,
						location: toLocation(branch.location),
						label: branch.label
					});
				}
			}
			return new types.StatementCoverage(
				serialized.count,
				toLocation(serialized.location),
				serialized.branches?.map(b => new types.BranchCoverage(
					b.count,
					toLocation(b.location)!,
					b.label,
				))
			);
		} else {
			return new types.DeclarationCoverage(
				serialized.name,
				serialized.count,
				toLocation(serialized.location),
			);
		}
	}

	export function fromDetails(coverage: vscode.FileCoverageDetail): CoverageDetails.Serialized {
		if (typeof coverage.executed === 'number' && coverage.executed < 0) {
			throw new Error(`Invalid coverage count ${coverage.executed}`);
		}

		if ('branches' in coverage) {
			return {
				count: coverage.executed,
				location: fromLocation(coverage.location),
				type: DetailType.Statement,
				branches: coverage.branches.length
					? coverage.branches.map(b => ({ count: b.executed, location: b.location && fromLocation(b.location), label: b.label }))
					: undefined,
			};
		} else {
			return {
				type: DetailType.Declaration,
				name: coverage.name,
				count: coverage.executed,
				location: fromLocation(coverage.location),
			};
		}
	}

	export function fromFile(controllerId: string, id: string, coverage: vscode.FileCoverage): IFileCoverage.Serialized {
		types.validateTestCoverageCount(coverage.statementCoverage);
		types.validateTestCoverageCount(coverage.branchCoverage);
		types.validateTestCoverageCount(coverage.declarationCoverage);

		return {
			id,
			uri: coverage.uri,
			statement: fromCoverageCount(coverage.statementCoverage),
			branch: coverage.branchCoverage && fromCoverageCount(coverage.branchCoverage),
			declaration: coverage.declarationCoverage && fromCoverageCount(coverage.declarationCoverage),
			testIds: coverage instanceof types.FileCoverage && coverage.fromTests.length ?
				coverage.fromTests.map(t => TestId.fromExtHostTestItem(t, controllerId).toString()) : undefined,
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
	export function to(mime: string, item: extHostProtocol.DataTransferItemDTO, resolveFileData: (id: string) => Promise<Uint8Array>): types.DataTransferItem {
		const file = item.fileData;
		if (file) {
			return new types.InternalFileDataTransferItem(
				new types.DataTransferFile(file.name, URI.revive(file.uri), file.id, createSingleCallFunction(() => resolveFileData(file.id))));
		}

		if (mime === Mimes.uriList && item.uriListData) {
			return new types.InternalDataTransferItem(reviveUriList(item.uriListData));
		}

		return new types.InternalDataTransferItem(item.asString);
	}

	export async function from(mime: string, item: vscode.DataTransferItem | IDataTransferItem): Promise<extHostProtocol.DataTransferItemDTO> {
		const stringValue = await item.asString();

		if (mime === Mimes.uriList) {
			return {
				asString: stringValue,
				fileData: undefined,
				uriListData: serializeUriList(stringValue),
			};
		}

		const fileValue = item.asFile();
		return {
			asString: stringValue,
			fileData: fileValue ? {
				name: fileValue.name,
				uri: fileValue.uri,
				id: (fileValue as types.DataTransferFile)._itemId ?? (fileValue as IDataTransferFile).id,
			} : undefined,
		};
	}

	function serializeUriList(stringValue: string): ReadonlyArray<string | URI> {
		return UriList.split(stringValue).map(part => {
			if (part.startsWith('#')) {
				return part;
			}

			try {
				return URI.parse(part);
			} catch {
				// noop
			}

			return part;
		});
	}

	function reviveUriList(parts: ReadonlyArray<string | UriComponents>): string {
		return UriList.create(parts.map(part => {
			return typeof part === 'string' ? part : URI.revive(part);
		}));
	}
}

export namespace DataTransfer {
	export function toDataTransfer(value: extHostProtocol.DataTransferDTO, resolveFileData: (itemId: string) => Promise<Uint8Array>): types.DataTransfer {
		const init = value.items.map(([type, item]) => {
			return [type, DataTransferItem.to(type, item, resolveFileData)] as const;
		});
		return new types.DataTransfer(init);
	}

	export async function from(dataTransfer: Iterable<readonly [string, vscode.DataTransferItem | IDataTransferItem]>): Promise<extHostProtocol.DataTransferDTO> {
		const newDTO: extHostProtocol.DataTransferDTO = { items: [] };

		const promises: Promise<any>[] = [];
		for (const [mime, value] of dataTransfer) {
			promises.push((async () => {
				newDTO.items.push([mime, await DataTransferItem.from(mime, value)]);
			})());
		}

		await Promise.all(promises);

		return newDTO;
	}
}

export namespace ChatFollowup {
	export function from(followup: vscode.ChatFollowup, request: IChatAgentRequest | undefined): IChatFollowup {
		return {
			kind: 'reply',
			agentId: followup.participant ?? request?.agentId ?? '',
			subCommand: followup.command ?? request?.command,
			message: followup.prompt,
			title: followup.label
		};
	}

	export function to(followup: IChatFollowup): vscode.ChatFollowup {
		return {
			prompt: followup.message,
			label: followup.title,
			participant: followup.agentId,
			command: followup.subCommand,
		};
	}
}

export namespace LanguageModelChatMessageRole {
	export function to(role: chatProvider.ChatMessageRole): vscode.LanguageModelChatMessageRole {
		switch (role) {
			case chatProvider.ChatMessageRole.System: return types.LanguageModelChatMessageRole.System;
			case chatProvider.ChatMessageRole.User: return types.LanguageModelChatMessageRole.User;
			case chatProvider.ChatMessageRole.Assistant: return types.LanguageModelChatMessageRole.Assistant;
		}
	}

	export function from(role: vscode.LanguageModelChatMessageRole): chatProvider.ChatMessageRole {
		switch (role) {
			case types.LanguageModelChatMessageRole.System: return chatProvider.ChatMessageRole.System;
			case types.LanguageModelChatMessageRole.User: return chatProvider.ChatMessageRole.User;
			case types.LanguageModelChatMessageRole.Assistant: return chatProvider.ChatMessageRole.Assistant;
		}
		return chatProvider.ChatMessageRole.User;
	}
}

export namespace LanguageModelChatMessage {

	export function to(message: chatProvider.IChatMessage): vscode.LanguageModelChatMessage {
		const content2 = message.content.map(c => {
			if (c.type === 'text') {
				return c.value;
			} else if (c.type === 'tool_result') {
				return new types.LanguageModelToolResultPart(c.toolCallId, c.value, c.isError);
			} else {
				return new types.LanguageModelToolCallPart(c.name, c.toolCallId, c.parameters);
			}
		});
		const content = content2.find(c => typeof c === 'string') ?? '';
		const role = LanguageModelChatMessageRole.to(message.role);
		const result = new types.LanguageModelChatMessage(role, content, message.name);
		result.content2 = content2;
		return result;
	}

	export function from(message: vscode.LanguageModelChatMessage): chatProvider.IChatMessage {

		const role = LanguageModelChatMessageRole.from(message.role);
		const name = message.name;

		const content = message.content2.map((c): chatProvider.IChatMessagePart => {
			if (c instanceof types.LanguageModelToolResultPart) {
				return {
					type: 'tool_result',
					toolCallId: c.toolCallId,
					value: c.content,
					isError: c.isError
				};
			} else if (c instanceof types.LanguageModelToolCallPart) {
				return {
					type: 'tool_use',
					toolCallId: c.toolCallId,
					name: c.name,
					parameters: c.parameters
				};
			} else {
				if (typeof c !== 'string') {
					throw new Error('Unexpected chat message content type');
				}

				return {
					type: 'text',
					value: c
				};
			}
		});

		return {
			role,
			name,
			content
		};
	}
}

export namespace ChatResponseMarkdownPart {
	export function from(part: vscode.ChatResponseMarkdownPart): Dto<IChatMarkdownContent> {
		return {
			kind: 'markdownContent',
			content: MarkdownString.from(part.value)
		};
	}
	export function to(part: Dto<IChatMarkdownContent>): vscode.ChatResponseMarkdownPart {
		return new types.ChatResponseMarkdownPart(MarkdownString.to(part.content));
	}
}

export namespace ChatResponseCodeblockUriPart {
	export function from(part: vscode.ChatResponseCodeblockUriPart): Dto<IChatResponseCodeblockUriPart> {
		return {
			kind: 'codeblockUri',
			uri: part.value,
		};
	}
	export function to(part: Dto<IChatResponseCodeblockUriPart>): vscode.ChatResponseCodeblockUriPart {
		return new types.ChatResponseCodeblockUriPart(URI.revive(part.uri));
	}
}

export namespace ChatResponseMarkdownWithVulnerabilitiesPart {
	export function from(part: vscode.ChatResponseMarkdownWithVulnerabilitiesPart): Dto<IChatAgentMarkdownContentWithVulnerability> {
		return {
			kind: 'markdownVuln',
			content: MarkdownString.from(part.value),
			vulnerabilities: part.vulnerabilities,
		};
	}
	export function to(part: Dto<IChatAgentMarkdownContentWithVulnerability>): vscode.ChatResponseMarkdownWithVulnerabilitiesPart {
		return new types.ChatResponseMarkdownWithVulnerabilitiesPart(MarkdownString.to(part.content), part.vulnerabilities);
	}
}

export namespace ChatResponseDetectedParticipantPart {
	export function from(part: vscode.ChatResponseDetectedParticipantPart): Dto<IChatAgentDetection> {
		return {
			kind: 'agentDetection',
			agentId: part.participant,
			command: part.command,
		};
	}
	export function to(part: Dto<IChatAgentDetection>): vscode.ChatResponseDetectedParticipantPart {
		return new types.ChatResponseDetectedParticipantPart(part.agentId, part.command);
	}
}

export namespace ChatResponseConfirmationPart {
	export function from(part: vscode.ChatResponseConfirmationPart): Dto<IChatConfirmation> {
		return {
			kind: 'confirmation',
			title: part.title,
			message: part.message,
			data: part.data,
			buttons: part.buttons
		};
	}
}

export namespace ChatResponseFilesPart {
	export function from(part: vscode.ChatResponseFileTreePart): IChatTreeData {
		const { value, baseUri } = part;
		function convert(items: vscode.ChatResponseFileTree[], baseUri: URI): extHostProtocol.IChatResponseProgressFileTreeData[] {
			return items.map(item => {
				const myUri = URI.joinPath(baseUri, item.name);
				return {
					label: item.name,
					uri: myUri,
					children: item.children && convert(item.children, myUri)
				};
			});
		}
		return {
			kind: 'treeData',
			treeData: {
				label: basename(baseUri),
				uri: baseUri,
				children: convert(value, baseUri)
			}
		};
	}
	export function to(part: Dto<IChatTreeData>): vscode.ChatResponseFileTreePart {
		const treeData = revive<extHostProtocol.IChatResponseProgressFileTreeData>(part.treeData);
		function convert(items: extHostProtocol.IChatResponseProgressFileTreeData[]): vscode.ChatResponseFileTree[] {
			return items.map(item => {
				return {
					name: item.label,
					children: item.children && convert(item.children)
				};
			});
		}

		const baseUri = treeData.uri;
		const items = treeData.children ? convert(treeData.children) : [];
		return new types.ChatResponseFileTreePart(items, baseUri);
	}
}

export namespace ChatResponseAnchorPart {
	export function from(part: vscode.ChatResponseAnchorPart): Dto<IChatContentInlineReference> {
		// Work around type-narrowing confusion between vscode.Uri and URI
		const isUri = (thing: unknown): thing is vscode.Uri => URI.isUri(thing);
		const isSymbolInformation = (x: any): x is vscode.SymbolInformation => x instanceof types.SymbolInformation;

		return {
			kind: 'inlineReference',
			name: part.title,
			inlineReference: isUri(part.value)
				? part.value
				: isSymbolInformation(part.value)
					? WorkspaceSymbol.from(part.value)
					: Location.from(part.value)
		};
	}

	export function to(part: Dto<IChatContentInlineReference>): vscode.ChatResponseAnchorPart {
		const value = revive<IChatContentInlineReference>(part);
		return new types.ChatResponseAnchorPart(
			URI.isUri(value.inlineReference)
				? value.inlineReference
				: 'location' in value.inlineReference
					? WorkspaceSymbol.to(value.inlineReference) as vscode.SymbolInformation
					: Location.to(value.inlineReference),
			part.name
		);
	}
}

export namespace ChatResponseProgressPart {
	export function from(part: vscode.ChatResponseProgressPart): Dto<IChatProgressMessage> {
		return {
			kind: 'progressMessage',
			content: MarkdownString.from(part.value)
		};
	}
	export function to(part: Dto<IChatProgressMessage>): vscode.ChatResponseProgressPart {
		return new types.ChatResponseProgressPart(part.content.value);
	}
}

export namespace ChatResponseWarningPart {
	export function from(part: vscode.ChatResponseWarningPart): Dto<IChatWarningMessage> {
		return {
			kind: 'warning',
			content: MarkdownString.from(part.value)
		};
	}
	export function to(part: Dto<IChatWarningMessage>): vscode.ChatResponseWarningPart {
		return new types.ChatResponseWarningPart(part.content.value);
	}
}

export namespace ChatResponseMovePart {
	export function from(part: vscode.ChatResponseMovePart): Dto<IChatMoveMessage> {
		return {
			kind: 'move',
			uri: part.uri,
			range: Range.from(part.range),
		};
	}
	export function to(part: Dto<IChatMoveMessage>): vscode.ChatResponseMovePart {
		return new types.ChatResponseMovePart(URI.revive(part.uri), Range.to(part.range));
	}
}

export namespace ChatTask {
	export function from(part: vscode.ChatResponseProgressPart2): IChatTaskDto {
		return {
			kind: 'progressTask',
			content: MarkdownString.from(part.value),
		};
	}
}

export namespace ChatTaskResult {
	export function from(part: string | void): Dto<IChatTaskResult> {
		return {
			kind: 'progressTaskResult',
			content: typeof part === 'string' ? MarkdownString.from(part) : undefined
		};
	}
}

export namespace ChatResponseCommandButtonPart {
	export function from(part: vscode.ChatResponseCommandButtonPart, commandsConverter: CommandsConverter, commandDisposables: DisposableStore): Dto<IChatCommandButton> {
		// If the command isn't in the converter, then this session may have been restored, and the command args don't exist anymore
		const command = commandsConverter.toInternal(part.value, commandDisposables) ?? { command: part.value.command, title: part.value.title };
		return {
			kind: 'command',
			command
		};
	}
	export function to(part: Dto<IChatCommandButton>, commandsConverter: CommandsConverter): vscode.ChatResponseCommandButtonPart {
		// If the command isn't in the converter, then this session may have been restored, and the command args don't exist anymore
		return new types.ChatResponseCommandButtonPart(commandsConverter.fromInternal(part.command) ?? { command: part.command.id, title: part.command.title });
	}
}

export namespace ChatResponseTextEditPart {
	export function from(part: vscode.ChatResponseTextEditPart): Dto<IChatTextEdit> {
		return {
			kind: 'textEdit',
			uri: part.uri,
			edits: part.edits.map(e => TextEdit.from(e))
		};
	}
	export function to(part: Dto<IChatTextEdit>): vscode.ChatResponseTextEditPart {
		return new types.ChatResponseTextEditPart(URI.revive(part.uri), part.edits.map(e => TextEdit.to(e)));
	}

}

export namespace ChatResponseReferencePart {
	export function from(part: types.ChatResponseReferencePart): Dto<IChatContentReference> {
		const iconPath = ThemeIcon.isThemeIcon(part.iconPath) ? part.iconPath
			: URI.isUri(part.iconPath) ? { light: URI.revive(part.iconPath) }
				: (part.iconPath && 'light' in part.iconPath && 'dark' in part.iconPath && URI.isUri(part.iconPath.light) && URI.isUri(part.iconPath.dark) ? { light: URI.revive(part.iconPath.light), dark: URI.revive(part.iconPath.dark) }
					: undefined);

		if (typeof part.value === 'object' && 'variableName' in part.value) {
			return {
				kind: 'reference',
				reference: {
					variableName: part.value.variableName,
					value: URI.isUri(part.value.value) || !part.value.value ?
						part.value.value :
						Location.from(part.value.value as vscode.Location)
				},
				iconPath,
				options: part.options
			};
		}

		return {
			kind: 'reference',
			reference: URI.isUri(part.value) || typeof part.value === 'string' ?
				part.value :
				Location.from(<vscode.Location>part.value),
			iconPath,
			options: part.options
		};
	}
	export function to(part: Dto<IChatContentReference>): vscode.ChatResponseReferencePart {
		const value = revive<IChatContentReference>(part);

		const mapValue = (value: URI | languages.Location): vscode.Uri | vscode.Location => URI.isUri(value) ?
			value :
			Location.to(value);

		return new types.ChatResponseReferencePart(
			typeof value.reference === 'string' ? value.reference : 'variableName' in value.reference ? {
				variableName: value.reference.variableName,
				value: value.reference.value && mapValue(value.reference.value)
			} :
				mapValue(value.reference)
		) as vscode.ChatResponseReferencePart; // 'value' is extended with variableName
	}
}

export namespace ChatResponseCodeCitationPart {
	export function from(part: vscode.ChatResponseCodeCitationPart): Dto<IChatCodeCitation> {
		return {
			kind: 'codeCitation',
			value: part.value,
			license: part.license,
			snippet: part.snippet
		};
	}
}

export namespace ChatResponsePart {

	export function from(part: vscode.ChatResponsePart | vscode.ChatResponseTextEditPart | vscode.ChatResponseMarkdownWithVulnerabilitiesPart | vscode.ChatResponseDetectedParticipantPart | vscode.ChatResponseWarningPart | vscode.ChatResponseConfirmationPart | vscode.ChatResponseReferencePart2 | vscode.ChatResponseMovePart, commandsConverter: CommandsConverter, commandDisposables: DisposableStore): extHostProtocol.IChatProgressDto {
		if (part instanceof types.ChatResponseMarkdownPart) {
			return ChatResponseMarkdownPart.from(part);
		} else if (part instanceof types.ChatResponseAnchorPart) {
			return ChatResponseAnchorPart.from(part);
		} else if (part instanceof types.ChatResponseReferencePart) {
			return ChatResponseReferencePart.from(part);
		} else if (part instanceof types.ChatResponseProgressPart) {
			return ChatResponseProgressPart.from(part);
		} else if (part instanceof types.ChatResponseFileTreePart) {
			return ChatResponseFilesPart.from(part);
		} else if (part instanceof types.ChatResponseCommandButtonPart) {
			return ChatResponseCommandButtonPart.from(part, commandsConverter, commandDisposables);
		} else if (part instanceof types.ChatResponseTextEditPart) {
			return ChatResponseTextEditPart.from(part);
		} else if (part instanceof types.ChatResponseMarkdownWithVulnerabilitiesPart) {
			return ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
		} else if (part instanceof types.ChatResponseCodeblockUriPart) {
			return ChatResponseCodeblockUriPart.from(part);
		} else if (part instanceof types.ChatResponseDetectedParticipantPart) {
			return ChatResponseDetectedParticipantPart.from(part);
		} else if (part instanceof types.ChatResponseWarningPart) {
			return ChatResponseWarningPart.from(part);
		} else if (part instanceof types.ChatResponseConfirmationPart) {
			return ChatResponseConfirmationPart.from(part);
		} else if (part instanceof types.ChatResponseCodeCitationPart) {
			return ChatResponseCodeCitationPart.from(part);
		} else if (part instanceof types.ChatResponseMovePart) {
			return ChatResponseMovePart.from(part);
		}

		return {
			kind: 'markdownContent',
			content: MarkdownString.from('')
		};
	}

	export function to(part: extHostProtocol.IChatProgressDto, commandsConverter: CommandsConverter): vscode.ChatResponsePart | undefined {
		switch (part.kind) {
			case 'reference': return ChatResponseReferencePart.to(part);
			case 'markdownContent':
			case 'inlineReference':
			case 'progressMessage':
			case 'treeData':
			case 'command':
				return toContent(part, commandsConverter);
		}
		return undefined;
	}

	export function toContent(part: extHostProtocol.IChatContentProgressDto, commandsConverter: CommandsConverter): vscode.ChatResponseMarkdownPart | vscode.ChatResponseFileTreePart | vscode.ChatResponseAnchorPart | vscode.ChatResponseCommandButtonPart | undefined {
		switch (part.kind) {
			case 'markdownContent': return ChatResponseMarkdownPart.to(part);
			case 'inlineReference': return ChatResponseAnchorPart.to(part);
			case 'progressMessage': return undefined;
			case 'treeData': return ChatResponseFilesPart.to(part);
			case 'command': return ChatResponseCommandButtonPart.to(part, commandsConverter);
		}

		return undefined;
	}
}

export namespace ChatAgentRequest {
	export function to(request: IChatAgentRequest, location2: vscode.ChatRequestEditorData | vscode.ChatRequestNotebookData | undefined): vscode.ChatRequest {
		const toolReferences = request.variables.variables.filter(v => v.isTool);
		const variableReferences = request.variables.variables.filter(v => !v.isTool);
		return {
			prompt: request.message,
			command: request.command,
			attempt: request.attempt ?? 0,
			enableCommandDetection: request.enableCommandDetection ?? true,
			isParticipantDetected: request.isParticipantDetected ?? false,
			references: variableReferences.map(ChatPromptReference.to),
			toolReferences: toolReferences.map(ChatLanguageModelToolReference.to),
			location: ChatLocation.to(request.location),
			acceptedConfirmationData: request.acceptedConfirmationData,
			rejectedConfirmationData: request.rejectedConfirmationData,
			location2,
			toolInvocationToken: Object.freeze({ sessionId: request.sessionId })
		};
	}
}

export namespace ChatLocation {
	export function to(loc: ChatAgentLocation): types.ChatLocation {
		switch (loc) {
			case ChatAgentLocation.Notebook: return types.ChatLocation.Notebook;
			case ChatAgentLocation.Terminal: return types.ChatLocation.Terminal;
			case ChatAgentLocation.Panel: return types.ChatLocation.Panel;
			case ChatAgentLocation.Editor: return types.ChatLocation.Editor;
		}
	}

	export function from(loc: types.ChatLocation): ChatAgentLocation {
		switch (loc) {
			case types.ChatLocation.Notebook: return ChatAgentLocation.Notebook;
			case types.ChatLocation.Terminal: return ChatAgentLocation.Terminal;
			case types.ChatLocation.Panel: return ChatAgentLocation.Panel;
			case types.ChatLocation.Editor: return ChatAgentLocation.Editor;
		}
	}
}

export namespace ChatPromptReference {
	export function to(variable: IChatRequestVariableEntry): vscode.ChatPromptReference {
		const value = variable.value;
		if (!value) {
			throw new Error('Invalid value reference');
		}

		return {
			id: variable.id,
			name: variable.name,
			range: variable.range && [variable.range.start, variable.range.endExclusive],
			value: isUriComponents(value) ? URI.revive(value) :
				value && typeof value === 'object' && 'uri' in value && 'range' in value && isUriComponents(value.uri) ?
					Location.to(revive(value)) : value,
			modelDescription: variable.modelDescription
		};
	}
}

export namespace ChatLanguageModelToolReference {
	export function to(variable: IChatRequestVariableEntry): vscode.ChatLanguageModelToolReference {
		const value = variable.value;
		if (value) {
			throw new Error('Invalid tool reference');
		}

		return {
			id: variable.id,
			range: variable.range && [variable.range.start, variable.range.endExclusive],
		};
	}
}

export namespace ChatAgentCompletionItem {
	export function from(item: vscode.ChatCompletionItem, commandsConverter: CommandsConverter, disposables: DisposableStore): extHostProtocol.IChatAgentCompletionItem {
		return {
			id: item.id,
			label: item.label,
			fullName: item.fullName,
			icon: item.icon?.id,
			value: item.values[0].value,
			insertText: item.insertText,
			detail: item.detail,
			documentation: item.documentation,
			command: commandsConverter.toInternal(item.command, disposables),
		};
	}
}

export namespace ChatAgentResult {
	export function to(result: IChatAgentResult): vscode.ChatResult {
		return {
			errorDetails: result.errorDetails,
			metadata: result.metadata,
			nextQuestion: result.nextQuestion,
		};
	}
}

export namespace ChatAgentUserActionEvent {
	export function to(result: IChatAgentResult, event: IChatUserActionEvent, commandsConverter: CommandsConverter): vscode.ChatUserActionEvent | undefined {
		if (event.action.kind === 'vote') {
			// Is the "feedback" type
			return;
		}

		const ehResult = ChatAgentResult.to(result);
		if (event.action.kind === 'command') {
			const command = event.action.commandButton.command;
			const commandButton = {
				command: commandsConverter.fromInternal(command) ?? { command: command.id, title: command.title },
			};
			const commandAction: vscode.ChatCommandAction = { kind: 'command', commandButton };
			return { action: commandAction, result: ehResult };
		} else if (event.action.kind === 'followUp') {
			const followupAction: vscode.ChatFollowupAction = { kind: 'followUp', followup: ChatFollowup.to(event.action.followup) };
			return { action: followupAction, result: ehResult };
		} else if (event.action.kind === 'inlineChat') {
			return { action: { kind: 'editor', accepted: event.action.action === 'accepted' }, result: ehResult };
		} else {
			return { action: event.action, result: ehResult };
		}
	}
}

export namespace TerminalQuickFix {
	export function from(quickFix: vscode.TerminalQuickFixTerminalCommand | vscode.TerminalQuickFixOpener | vscode.Command, converter: Command.ICommandsConverter, disposables: DisposableStore): extHostProtocol.ITerminalQuickFixTerminalCommandDto | extHostProtocol.ITerminalQuickFixOpenerDto | extHostProtocol.ICommandDto | undefined {
		if ('terminalCommand' in quickFix) {
			return { terminalCommand: quickFix.terminalCommand, shouldExecute: quickFix.shouldExecute };
		}
		if ('uri' in quickFix) {
			return { uri: quickFix.uri };
		}
		return converter.toInternal(quickFix, disposables);
	}
}

export namespace PartialAcceptInfo {
	export function to(info: languages.PartialAcceptInfo): types.PartialAcceptInfo {
		return {
			kind: PartialAcceptTriggerKind.to(info.kind),
		};
	}
}

export namespace PartialAcceptTriggerKind {
	export function to(kind: languages.PartialAcceptTriggerKind): types.PartialAcceptTriggerKind {
		switch (kind) {
			case languages.PartialAcceptTriggerKind.Word:
				return types.PartialAcceptTriggerKind.Word;
			case languages.PartialAcceptTriggerKind.Line:
				return types.PartialAcceptTriggerKind.Line;
			case languages.PartialAcceptTriggerKind.Suggest:
				return types.PartialAcceptTriggerKind.Suggest;
			default:
				return types.PartialAcceptTriggerKind.Unknown;
		}
	}
}

export namespace DebugTreeItem {
	export function from(item: vscode.DebugTreeItem, id: number): IDebugVisualizationTreeItem {
		return {
			id,
			label: item.label,
			description: item.description,
			canEdit: item.canEdit,
			collapsibleState: (item.collapsibleState || DebugTreeItemCollapsibleState.None) as DebugTreeItemCollapsibleState,
			contextValue: item.contextValue,
		};
	}
}

export namespace LanguageModelToolDescription {
	export function to(item: IToolData): vscode.LanguageModelToolDescription {
		return {
			id: item.id,
			modelDescription: item.modelDescription,
			parametersSchema: item.parametersSchema,
			displayName: item.displayName,
			supportedContentTypes: item.supportedContentTypes,
		};
	}
}
