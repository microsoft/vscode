/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asArray, coalesce, isNonEmptyArray } from '../../../base/common/arrays.js';
import { VSBuffer, decodeBase64, encodeBase64 } from '../../../base/common/buffer.js';
import { UriList } from '../../../base/common/dataTransfer.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import * as htmlContent from '../../../base/common/htmlContent.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import * as marked from '../../../base/common/marked/marked.js';
import { parse, revive } from '../../../base/common/marshalling.js';
import { Mimes } from '../../../base/common/mime.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { OS } from '../../../base/common/platform.js';
import { WellDefinedPrefixTree } from '../../../base/common/prefixTree.js';
import { basename } from '../../../base/common/resources.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isDefined, isEmptyObject, isNumber, isString, isUndefinedOrNull } from '../../../base/common/types.js';
import { URI, isUriComponents } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as editorRange from '../../../editor/common/core/range.js';
import * as languages from '../../../editor/common/languages.js';
import { MarkerSeverity } from '../../../platform/markers/common/markers.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../common/editor.js';
import { LocalChatSessionUri } from '../../contrib/chat/common/model/chatUri.js';
import { isImageVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { resolveEffectiveCommand } from '../../contrib/chat/common/promptSyntax/hookSchema.js';
import { ToolDataSource, ToolInvocationPresentation } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { McpServerLaunch } from '../../contrib/mcp/common/mcpTypes.js';
import * as notebooks from '../../contrib/notebook/common/notebookCommon.js';
import { TestId } from '../../contrib/testing/common/testId.js';
import { denamespaceTestTag, namespaceTestTag } from '../../contrib/testing/common/testTypes.js';
import { AiSettingsSearchResultKind } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { getPrivateApiFor } from './extHostTestingPrivateApi.js';
import * as types from './extHostTypes.js';
import { LanguageModelTextPart } from './extHostTypes.js';
export var Selection;
(function (Selection) {
    function to(selection) {
        const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = selection;
        const start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
        const end = new types.Position(positionLineNumber - 1, positionColumn - 1);
        return new types.Selection(start, end);
    }
    Selection.to = to;
    function from(selection) {
        const { anchor, active } = selection;
        return {
            selectionStartLineNumber: anchor.line + 1,
            selectionStartColumn: anchor.character + 1,
            positionLineNumber: active.line + 1,
            positionColumn: active.character + 1
        };
    }
    Selection.from = from;
})(Selection || (Selection = {}));
export var Range;
(function (Range) {
    function from(range) {
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
    Range.from = from;
    function to(range) {
        if (!range) {
            return undefined;
        }
        const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
        return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
    }
    Range.to = to;
})(Range || (Range = {}));
export var Location;
(function (Location) {
    function from(location) {
        return {
            uri: location.uri,
            range: Range.from(location.range)
        };
    }
    Location.from = from;
    function to(location) {
        return new types.Location(URI.revive(location.uri), Range.to(location.range));
    }
    Location.to = to;
})(Location || (Location = {}));
export var TokenType;
(function (TokenType) {
    function to(type) {
        switch (type) {
            case 1 /* encodedTokenAttributes.StandardTokenType.Comment */: return types.StandardTokenType.Comment;
            case 0 /* encodedTokenAttributes.StandardTokenType.Other */: return types.StandardTokenType.Other;
            case 3 /* encodedTokenAttributes.StandardTokenType.RegEx */: return types.StandardTokenType.RegEx;
            case 2 /* encodedTokenAttributes.StandardTokenType.String */: return types.StandardTokenType.String;
        }
    }
    TokenType.to = to;
})(TokenType || (TokenType = {}));
export var Position;
(function (Position) {
    function to(position) {
        return new types.Position(position.lineNumber - 1, position.column - 1);
    }
    Position.to = to;
    function from(position) {
        return { lineNumber: position.line + 1, column: position.character + 1 };
    }
    Position.from = from;
})(Position || (Position = {}));
export var DocumentSelector;
(function (DocumentSelector) {
    function from(value, uriTransformer, extension) {
        return coalesce(asArray(value).map(sel => _doTransformDocumentSelector(sel, uriTransformer, extension)));
    }
    DocumentSelector.from = from;
    function _doTransformDocumentSelector(selector, uriTransformer, extension) {
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
    function _transformScheme(scheme, uriTransformer) {
        if (uriTransformer && typeof scheme === 'string') {
            return uriTransformer.transformOutgoingScheme(scheme);
        }
        return scheme;
    }
})(DocumentSelector || (DocumentSelector = {}));
export var DiagnosticTag;
(function (DiagnosticTag) {
    function from(value) {
        switch (value) {
            case types.DiagnosticTag.Unnecessary:
                return 1 /* MarkerTag.Unnecessary */;
            case types.DiagnosticTag.Deprecated:
                return 2 /* MarkerTag.Deprecated */;
        }
        return undefined;
    }
    DiagnosticTag.from = from;
    function to(value) {
        switch (value) {
            case 1 /* MarkerTag.Unnecessary */:
                return types.DiagnosticTag.Unnecessary;
            case 2 /* MarkerTag.Deprecated */:
                return types.DiagnosticTag.Deprecated;
            default:
                return undefined;
        }
    }
    DiagnosticTag.to = to;
})(DiagnosticTag || (DiagnosticTag = {}));
export var Diagnostic;
(function (Diagnostic) {
    function from(value) {
        let code;
        if (value.code) {
            if (isString(value.code) || isNumber(value.code)) {
                code = String(value.code);
            }
            else {
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
    Diagnostic.from = from;
    function to(value) {
        const res = new types.Diagnostic(Range.to(value), value.message, DiagnosticSeverity.to(value.severity));
        res.source = value.source;
        res.code = isString(value.code) ? value.code : value.code?.value;
        res.relatedInformation = value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.to);
        res.tags = value.tags && coalesce(value.tags.map(DiagnosticTag.to));
        return res;
    }
    Diagnostic.to = to;
})(Diagnostic || (Diagnostic = {}));
export var DiagnosticRelatedInformation;
(function (DiagnosticRelatedInformation) {
    function from(value) {
        return {
            ...Range.from(value.location.range),
            message: value.message,
            resource: value.location.uri
        };
    }
    DiagnosticRelatedInformation.from = from;
    function to(value) {
        return new types.DiagnosticRelatedInformation(new types.Location(value.resource, Range.to(value)), value.message);
    }
    DiagnosticRelatedInformation.to = to;
})(DiagnosticRelatedInformation || (DiagnosticRelatedInformation = {}));
export var DiagnosticSeverity;
(function (DiagnosticSeverity) {
    function from(value) {
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
    DiagnosticSeverity.from = from;
    function to(value) {
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
    DiagnosticSeverity.to = to;
})(DiagnosticSeverity || (DiagnosticSeverity = {}));
export var ViewColumn;
(function (ViewColumn) {
    function from(column) {
        if (typeof column === 'number' && column >= types.ViewColumn.One) {
            return column - 1; // adjust zero index (ViewColumn.ONE => 0)
        }
        if (column === types.ViewColumn.Beside) {
            return SIDE_GROUP;
        }
        return ACTIVE_GROUP; // default is always the active group
    }
    ViewColumn.from = from;
    function to(position) {
        if (typeof position === 'number' && position >= 0) {
            return position + 1; // adjust to index (ViewColumn.ONE => 1)
        }
        throw new Error(`invalid 'EditorGroupColumn'`);
    }
    ViewColumn.to = to;
})(ViewColumn || (ViewColumn = {}));
function isDecorationOptions(something) {
    return (typeof something.range !== 'undefined');
}
export function isDecorationOptionsArr(something) {
    if (something.length === 0) {
        return true;
    }
    return isDecorationOptions(something[0]) ? true : false;
}
export var MarkdownString;
(function (MarkdownString) {
    function fromMany(markup) {
        return markup.map(MarkdownString.from);
    }
    MarkdownString.fromMany = fromMany;
    function isCodeblock(thing) {
        return thing && typeof thing === 'object'
            && typeof thing.language === 'string'
            && typeof thing.value === 'string';
    }
    function from(markup) {
        let res;
        if (isCodeblock(markup)) {
            const { language, value } = markup;
            res = { value: '```' + language + '\n' + value + '\n```\n' };
        }
        else if (types.MarkdownString.isMarkdownString(markup)) {
            res = { value: markup.value, isTrusted: markup.isTrusted, supportThemeIcons: markup.supportThemeIcons, supportHtml: markup.supportHtml, supportAlertSyntax: markup.supportAlertSyntax, baseUri: markup.baseUri };
        }
        else if (typeof markup === 'string') {
            res = { value: markup };
        }
        else {
            res = { value: '' };
        }
        // extract uris into a separate object
        const resUris = Object.create(null);
        res.uris = resUris;
        const collectUri = ({ href }) => {
            try {
                let uri = URI.parse(href, true);
                uri = uri.with({ query: _uriMassage(uri.query, resUris) });
                resUris[href] = uri;
            }
            catch (e) {
                // ignore
            }
            return '';
        };
        marked.marked.walkTokens(marked.marked.lexer(res.value), token => {
            if (token.type === 'link') {
                collectUri({ href: token.href });
            }
            else if (token.type === 'image') {
                if (typeof token.href === 'string') {
                    collectUri(htmlContent.parseHrefAndDimensions(token.href));
                }
            }
        });
        return res;
    }
    MarkdownString.from = from;
    function _uriMassage(part, bucket) {
        if (!part) {
            return part;
        }
        let data;
        try {
            data = parse(part);
        }
        catch (e) {
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
            }
            else {
                return undefined;
            }
        });
        if (!changed) {
            return part;
        }
        return JSON.stringify(data);
    }
    function to(value) {
        const result = new types.MarkdownString(value.value, value.supportThemeIcons);
        result.isTrusted = value.isTrusted;
        result.supportHtml = value.supportHtml;
        result.supportAlertSyntax = value.supportAlertSyntax;
        result.baseUri = value.baseUri ? URI.from(value.baseUri) : undefined;
        return result;
    }
    MarkdownString.to = to;
    function fromStrict(value) {
        if (!value) {
            return undefined;
        }
        return typeof value === 'string' ? value : MarkdownString.from(value);
    }
    MarkdownString.fromStrict = fromStrict;
})(MarkdownString || (MarkdownString = {}));
export function fromRangeOrRangeWithMessage(ranges) {
    if (isDecorationOptionsArr(ranges)) {
        return ranges.map((r) => {
            return {
                range: Range.from(r.range),
                hoverMessage: Array.isArray(r.hoverMessage)
                    ? MarkdownString.fromMany(r.hoverMessage)
                    : (r.hoverMessage ? MarkdownString.from(r.hoverMessage) : undefined),
                // eslint-disable-next-line local/code-no-any-casts
                renderOptions: /* URI vs Uri */ r.renderOptions
            };
        });
    }
    else {
        return ranges.map((r) => {
            return {
                range: Range.from(r)
            };
        });
    }
}
export function pathOrURIToURI(value) {
    if (typeof value === 'undefined') {
        return value;
    }
    if (typeof value === 'string') {
        return URI.file(value);
    }
    else {
        return value;
    }
}
export var ThemableDecorationAttachmentRenderOptions;
(function (ThemableDecorationAttachmentRenderOptions) {
    function from(options) {
        if (typeof options === 'undefined') {
            return options;
        }
        return {
            contentText: options.contentText,
            contentIconPath: options.contentIconPath ? pathOrURIToURI(options.contentIconPath) : undefined,
            border: options.border,
            borderColor: options.borderColor,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            textDecoration: options.textDecoration,
            color: options.color,
            backgroundColor: options.backgroundColor,
            margin: options.margin,
            width: options.width,
            height: options.height,
        };
    }
    ThemableDecorationAttachmentRenderOptions.from = from;
})(ThemableDecorationAttachmentRenderOptions || (ThemableDecorationAttachmentRenderOptions = {}));
export var ThemableDecorationRenderOptions;
(function (ThemableDecorationRenderOptions) {
    function from(options) {
        if (typeof options === 'undefined') {
            return options;
        }
        return {
            backgroundColor: options.backgroundColor,
            outline: options.outline,
            outlineColor: options.outlineColor,
            outlineStyle: options.outlineStyle,
            outlineWidth: options.outlineWidth,
            border: options.border,
            borderColor: options.borderColor,
            borderRadius: options.borderRadius,
            borderSpacing: options.borderSpacing,
            borderStyle: options.borderStyle,
            borderWidth: options.borderWidth,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            textDecoration: options.textDecoration,
            cursor: options.cursor,
            color: options.color,
            opacity: options.opacity,
            letterSpacing: options.letterSpacing,
            gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : undefined,
            gutterIconSize: options.gutterIconSize,
            overviewRulerColor: options.overviewRulerColor,
            before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : undefined,
            after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : undefined,
        };
    }
    ThemableDecorationRenderOptions.from = from;
})(ThemableDecorationRenderOptions || (ThemableDecorationRenderOptions = {}));
export var DecorationRangeBehavior;
(function (DecorationRangeBehavior) {
    function from(value) {
        if (typeof value === 'undefined') {
            return value;
        }
        switch (value) {
            case types.DecorationRangeBehavior.OpenOpen:
                return 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */;
            case types.DecorationRangeBehavior.ClosedClosed:
                return 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */;
            case types.DecorationRangeBehavior.OpenClosed:
                return 2 /* TrackedRangeStickiness.GrowsOnlyWhenTypingBefore */;
            case types.DecorationRangeBehavior.ClosedOpen:
                return 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */;
        }
    }
    DecorationRangeBehavior.from = from;
})(DecorationRangeBehavior || (DecorationRangeBehavior = {}));
export var DecorationRenderOptions;
(function (DecorationRenderOptions) {
    function from(options) {
        return {
            isWholeLine: options.isWholeLine,
            rangeBehavior: options.rangeBehavior ? DecorationRangeBehavior.from(options.rangeBehavior) : undefined,
            overviewRulerLane: options.overviewRulerLane,
            light: options.light ? ThemableDecorationRenderOptions.from(options.light) : undefined,
            dark: options.dark ? ThemableDecorationRenderOptions.from(options.dark) : undefined,
            backgroundColor: options.backgroundColor,
            outline: options.outline,
            outlineColor: options.outlineColor,
            outlineStyle: options.outlineStyle,
            outlineWidth: options.outlineWidth,
            border: options.border,
            borderColor: options.borderColor,
            borderRadius: options.borderRadius,
            borderSpacing: options.borderSpacing,
            borderStyle: options.borderStyle,
            borderWidth: options.borderWidth,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            textDecoration: options.textDecoration,
            cursor: options.cursor,
            color: options.color,
            opacity: options.opacity,
            letterSpacing: options.letterSpacing,
            gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : undefined,
            gutterIconSize: options.gutterIconSize,
            overviewRulerColor: options.overviewRulerColor,
            before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : undefined,
            after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : undefined,
        };
    }
    DecorationRenderOptions.from = from;
})(DecorationRenderOptions || (DecorationRenderOptions = {}));
export var TextEdit;
(function (TextEdit) {
    function from(edit) {
        return {
            text: edit.newText,
            eol: edit.newEol && EndOfLine.from(edit.newEol),
            range: Range.from(edit.range)
        };
    }
    TextEdit.from = from;
    function to(edit) {
        const result = new types.TextEdit(Range.to(edit.range), edit.text);
        result.newEol = (typeof edit.eol === 'undefined' ? undefined : EndOfLine.to(edit.eol));
        return result;
    }
    TextEdit.to = to;
})(TextEdit || (TextEdit = {}));
export var WorkspaceEdit;
(function (WorkspaceEdit) {
    function from(value, versionInfo) {
        const result = {
            edits: []
        };
        if (value instanceof types.WorkspaceEdit) {
            // collect all files that are to be created so that their version
            // information (in case they exist as text model already) can be ignored
            const toCreate = new ResourceSet();
            for (const entry of value._allEntries()) {
                if (entry._type === 1 /* types.FileEditType.File */ && URI.isUri(entry.to) && entry.from === undefined) {
                    toCreate.add(entry.to);
                }
            }
            for (const entry of value._allEntries()) {
                if (entry._type === 1 /* types.FileEditType.File */) {
                    let contents;
                    if (entry.options?.contents) {
                        if (ArrayBuffer.isView(entry.options.contents)) {
                            contents = { type: 'base64', value: encodeBase64(VSBuffer.wrap(entry.options.contents)) };
                        }
                        else {
                            contents = { type: 'dataTransferItem', id: entry.options.contents._itemId };
                        }
                    }
                    // file operation
                    result.edits.push({
                        oldResource: entry.from,
                        newResource: entry.to,
                        options: { ...entry.options, contents },
                        metadata: entry.metadata
                    });
                }
                else if (entry._type === 2 /* types.FileEditType.Text */) {
                    // text edits
                    result.edits.push({
                        resource: entry.uri,
                        textEdit: TextEdit.from(entry.edit),
                        versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : undefined,
                        metadata: entry.metadata
                    });
                }
                else if (entry._type === 6 /* types.FileEditType.Snippet */) {
                    result.edits.push({
                        resource: entry.uri,
                        textEdit: {
                            range: Range.from(entry.range),
                            text: entry.edit.value,
                            insertAsSnippet: true,
                            keepWhitespace: entry.keepWhitespace
                        },
                        versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : undefined,
                        metadata: entry.metadata
                    });
                }
                else if (entry._type === 3 /* types.FileEditType.Cell */) {
                    // cell edit
                    result.edits.push({
                        metadata: entry.metadata,
                        resource: entry.uri,
                        cellEdit: entry.edit,
                        notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri)
                    });
                }
                else if (entry._type === 5 /* types.FileEditType.CellReplace */) {
                    // cell replace
                    result.edits.push({
                        metadata: entry.metadata,
                        resource: entry.uri,
                        notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri),
                        cellEdit: {
                            editType: 1 /* notebooks.CellEditType.Replace */,
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
    WorkspaceEdit.from = from;
    function to(value) {
        const result = new types.WorkspaceEdit();
        const edits = new ResourceMap();
        for (const edit of value.edits) {
            if (edit.textEdit) {
                const item = edit;
                const uri = URI.revive(item.resource);
                const range = Range.to(item.textEdit.range);
                const text = item.textEdit.text;
                const isSnippet = item.textEdit.insertAsSnippet;
                let editOrSnippetTest;
                if (isSnippet) {
                    editOrSnippetTest = types.SnippetTextEdit.replace(range, new types.SnippetString(text));
                }
                else {
                    editOrSnippetTest = types.TextEdit.replace(range, text);
                }
                const array = edits.get(uri);
                if (!array) {
                    edits.set(uri, [editOrSnippetTest]);
                }
                else {
                    array.push(editOrSnippetTest);
                }
            }
            else {
                result.renameFile(URI.revive(edit.oldResource), URI.revive(edit.newResource), edit.options);
            }
        }
        for (const [uri, array] of edits) {
            result.set(uri, array);
        }
        return result;
    }
    WorkspaceEdit.to = to;
})(WorkspaceEdit || (WorkspaceEdit = {}));
export var SymbolKind;
(function (SymbolKind) {
    const _fromMapping = Object.create(null);
    _fromMapping[types.SymbolKind.File] = 0 /* languages.SymbolKind.File */;
    _fromMapping[types.SymbolKind.Module] = 1 /* languages.SymbolKind.Module */;
    _fromMapping[types.SymbolKind.Namespace] = 2 /* languages.SymbolKind.Namespace */;
    _fromMapping[types.SymbolKind.Package] = 3 /* languages.SymbolKind.Package */;
    _fromMapping[types.SymbolKind.Class] = 4 /* languages.SymbolKind.Class */;
    _fromMapping[types.SymbolKind.Method] = 5 /* languages.SymbolKind.Method */;
    _fromMapping[types.SymbolKind.Property] = 6 /* languages.SymbolKind.Property */;
    _fromMapping[types.SymbolKind.Field] = 7 /* languages.SymbolKind.Field */;
    _fromMapping[types.SymbolKind.Constructor] = 8 /* languages.SymbolKind.Constructor */;
    _fromMapping[types.SymbolKind.Enum] = 9 /* languages.SymbolKind.Enum */;
    _fromMapping[types.SymbolKind.Interface] = 10 /* languages.SymbolKind.Interface */;
    _fromMapping[types.SymbolKind.Function] = 11 /* languages.SymbolKind.Function */;
    _fromMapping[types.SymbolKind.Variable] = 12 /* languages.SymbolKind.Variable */;
    _fromMapping[types.SymbolKind.Constant] = 13 /* languages.SymbolKind.Constant */;
    _fromMapping[types.SymbolKind.String] = 14 /* languages.SymbolKind.String */;
    _fromMapping[types.SymbolKind.Number] = 15 /* languages.SymbolKind.Number */;
    _fromMapping[types.SymbolKind.Boolean] = 16 /* languages.SymbolKind.Boolean */;
    _fromMapping[types.SymbolKind.Array] = 17 /* languages.SymbolKind.Array */;
    _fromMapping[types.SymbolKind.Object] = 18 /* languages.SymbolKind.Object */;
    _fromMapping[types.SymbolKind.Key] = 19 /* languages.SymbolKind.Key */;
    _fromMapping[types.SymbolKind.Null] = 20 /* languages.SymbolKind.Null */;
    _fromMapping[types.SymbolKind.EnumMember] = 21 /* languages.SymbolKind.EnumMember */;
    _fromMapping[types.SymbolKind.Struct] = 22 /* languages.SymbolKind.Struct */;
    _fromMapping[types.SymbolKind.Event] = 23 /* languages.SymbolKind.Event */;
    _fromMapping[types.SymbolKind.Operator] = 24 /* languages.SymbolKind.Operator */;
    _fromMapping[types.SymbolKind.TypeParameter] = 25 /* languages.SymbolKind.TypeParameter */;
    function from(kind) {
        return typeof _fromMapping[kind] === 'number' ? _fromMapping[kind] : 6 /* languages.SymbolKind.Property */;
    }
    SymbolKind.from = from;
    function to(kind) {
        for (const k in _fromMapping) {
            if (_fromMapping[k] === kind) {
                return Number(k);
            }
        }
        return types.SymbolKind.Property;
    }
    SymbolKind.to = to;
})(SymbolKind || (SymbolKind = {}));
export var SymbolTag;
(function (SymbolTag) {
    function from(kind) {
        switch (kind) {
            case types.SymbolTag.Deprecated: return 1 /* languages.SymbolTag.Deprecated */;
        }
    }
    SymbolTag.from = from;
    function to(kind) {
        switch (kind) {
            case 1 /* languages.SymbolTag.Deprecated */: return types.SymbolTag.Deprecated;
        }
    }
    SymbolTag.to = to;
})(SymbolTag || (SymbolTag = {}));
export var WorkspaceSymbol;
(function (WorkspaceSymbol) {
    function from(info) {
        return {
            name: info.name,
            kind: SymbolKind.from(info.kind),
            tags: info.tags && info.tags.map(SymbolTag.from),
            containerName: info.containerName,
            location: location.from(info.location)
        };
    }
    WorkspaceSymbol.from = from;
    function to(info) {
        const result = new types.SymbolInformation(info.name, SymbolKind.to(info.kind), info.containerName, location.to(info.location));
        result.tags = info.tags && info.tags.map(SymbolTag.to);
        return result;
    }
    WorkspaceSymbol.to = to;
})(WorkspaceSymbol || (WorkspaceSymbol = {}));
export var DocumentSymbol;
(function (DocumentSymbol) {
    function from(info) {
        const result = {
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
    DocumentSymbol.from = from;
    function to(info) {
        const result = new types.DocumentSymbol(info.name, info.detail, SymbolKind.to(info.kind), Range.to(info.range), Range.to(info.selectionRange));
        if (isNonEmptyArray(info.tags)) {
            result.tags = info.tags.map(SymbolTag.to);
        }
        if (info.children) {
            // eslint-disable-next-line local/code-no-any-casts
            result.children = info.children.map(to);
        }
        return result;
    }
    DocumentSymbol.to = to;
})(DocumentSymbol || (DocumentSymbol = {}));
export var CallHierarchyItem;
(function (CallHierarchyItem) {
    function to(item) {
        const result = new types.CallHierarchyItem(SymbolKind.to(item.kind), item.name, item.detail || '', URI.revive(item.uri), Range.to(item.range), Range.to(item.selectionRange));
        result._sessionId = item._sessionId;
        result._itemId = item._itemId;
        return result;
    }
    CallHierarchyItem.to = to;
    function from(item, sessionId, itemId) {
        sessionId = sessionId ?? item._sessionId;
        itemId = itemId ?? item._itemId;
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
    CallHierarchyItem.from = from;
})(CallHierarchyItem || (CallHierarchyItem = {}));
export var CallHierarchyIncomingCall;
(function (CallHierarchyIncomingCall) {
    function to(item) {
        return new types.CallHierarchyIncomingCall(CallHierarchyItem.to(item.from), item.fromRanges.map(r => Range.to(r)));
    }
    CallHierarchyIncomingCall.to = to;
})(CallHierarchyIncomingCall || (CallHierarchyIncomingCall = {}));
export var CallHierarchyOutgoingCall;
(function (CallHierarchyOutgoingCall) {
    function to(item) {
        return new types.CallHierarchyOutgoingCall(CallHierarchyItem.to(item.to), item.fromRanges.map(r => Range.to(r)));
    }
    CallHierarchyOutgoingCall.to = to;
})(CallHierarchyOutgoingCall || (CallHierarchyOutgoingCall = {}));
export var location;
(function (location) {
    function from(value) {
        return {
            range: value.range && Range.from(value.range),
            uri: value.uri
        };
    }
    location.from = from;
    function to(value) {
        return new types.Location(URI.revive(value.uri), Range.to(value.range));
    }
    location.to = to;
})(location || (location = {}));
export var DefinitionLink;
(function (DefinitionLink) {
    function from(value) {
        const definitionLink = value;
        const location = value;
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
    DefinitionLink.from = from;
    function to(value) {
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
    DefinitionLink.to = to;
})(DefinitionLink || (DefinitionLink = {}));
export var Hover;
(function (Hover) {
    function from(hover) {
        const convertedHover = {
            range: Range.from(hover.range),
            contents: MarkdownString.fromMany(hover.contents),
            canIncreaseVerbosity: hover.canIncreaseVerbosity,
            canDecreaseVerbosity: hover.canDecreaseVerbosity,
        };
        return convertedHover;
    }
    Hover.from = from;
    function to(info) {
        const contents = info.contents.map(MarkdownString.to);
        const range = Range.to(info.range);
        const canIncreaseVerbosity = info.canIncreaseVerbosity;
        const canDecreaseVerbosity = info.canDecreaseVerbosity;
        return new types.VerboseHover(contents, range, canIncreaseVerbosity, canDecreaseVerbosity);
    }
    Hover.to = to;
})(Hover || (Hover = {}));
export var EvaluatableExpression;
(function (EvaluatableExpression) {
    function from(expression) {
        return {
            range: Range.from(expression.range),
            expression: expression.expression
        };
    }
    EvaluatableExpression.from = from;
    function to(info) {
        return new types.EvaluatableExpression(Range.to(info.range), info.expression);
    }
    EvaluatableExpression.to = to;
})(EvaluatableExpression || (EvaluatableExpression = {}));
export var InlineValue;
(function (InlineValue) {
    function from(inlineValue) {
        if (inlineValue instanceof types.InlineValueText) {
            return {
                type: 'text',
                range: Range.from(inlineValue.range),
                text: inlineValue.text
            };
        }
        else if (inlineValue instanceof types.InlineValueVariableLookup) {
            return {
                type: 'variable',
                range: Range.from(inlineValue.range),
                variableName: inlineValue.variableName,
                caseSensitiveLookup: inlineValue.caseSensitiveLookup
            };
        }
        else if (inlineValue instanceof types.InlineValueEvaluatableExpression) {
            return {
                type: 'expression',
                range: Range.from(inlineValue.range),
                expression: inlineValue.expression
            };
        }
        else {
            throw new Error(`Unknown 'InlineValue' type`);
        }
    }
    InlineValue.from = from;
    function to(inlineValue) {
        switch (inlineValue.type) {
            case 'text':
                return {
                    range: Range.to(inlineValue.range),
                    text: inlineValue.text
                };
            case 'variable':
                return {
                    range: Range.to(inlineValue.range),
                    variableName: inlineValue.variableName,
                    caseSensitiveLookup: inlineValue.caseSensitiveLookup
                };
            case 'expression':
                return {
                    range: Range.to(inlineValue.range),
                    expression: inlineValue.expression
                };
        }
    }
    InlineValue.to = to;
})(InlineValue || (InlineValue = {}));
export var InlineValueContext;
(function (InlineValueContext) {
    function from(inlineValueContext) {
        return {
            frameId: inlineValueContext.frameId,
            stoppedLocation: Range.from(inlineValueContext.stoppedLocation)
        };
    }
    InlineValueContext.from = from;
    function to(inlineValueContext) {
        return new types.InlineValueContext(inlineValueContext.frameId, Range.to(inlineValueContext.stoppedLocation));
    }
    InlineValueContext.to = to;
})(InlineValueContext || (InlineValueContext = {}));
export var DocumentHighlight;
(function (DocumentHighlight) {
    function from(documentHighlight) {
        return {
            range: Range.from(documentHighlight.range),
            kind: documentHighlight.kind
        };
    }
    DocumentHighlight.from = from;
    function to(occurrence) {
        return new types.DocumentHighlight(Range.to(occurrence.range), occurrence.kind);
    }
    DocumentHighlight.to = to;
})(DocumentHighlight || (DocumentHighlight = {}));
export var MultiDocumentHighlight;
(function (MultiDocumentHighlight) {
    function from(multiDocumentHighlight) {
        return {
            uri: multiDocumentHighlight.uri,
            highlights: multiDocumentHighlight.highlights.map(DocumentHighlight.from)
        };
    }
    MultiDocumentHighlight.from = from;
    function to(multiDocumentHighlight) {
        return new types.MultiDocumentHighlight(URI.revive(multiDocumentHighlight.uri), multiDocumentHighlight.highlights.map(DocumentHighlight.to));
    }
    MultiDocumentHighlight.to = to;
})(MultiDocumentHighlight || (MultiDocumentHighlight = {}));
export var CompletionTriggerKind;
(function (CompletionTriggerKind) {
    function to(kind) {
        switch (kind) {
            case 1 /* languages.CompletionTriggerKind.TriggerCharacter */:
                return types.CompletionTriggerKind.TriggerCharacter;
            case 2 /* languages.CompletionTriggerKind.TriggerForIncompleteCompletions */:
                return types.CompletionTriggerKind.TriggerForIncompleteCompletions;
            case 0 /* languages.CompletionTriggerKind.Invoke */:
            default:
                return types.CompletionTriggerKind.Invoke;
        }
    }
    CompletionTriggerKind.to = to;
})(CompletionTriggerKind || (CompletionTriggerKind = {}));
export var CompletionContext;
(function (CompletionContext) {
    function to(context) {
        return {
            triggerKind: CompletionTriggerKind.to(context.triggerKind),
            triggerCharacter: context.triggerCharacter
        };
    }
    CompletionContext.to = to;
})(CompletionContext || (CompletionContext = {}));
export var CompletionItemTag;
(function (CompletionItemTag) {
    function from(kind) {
        switch (kind) {
            case types.CompletionItemTag.Deprecated: return 1 /* languages.CompletionItemTag.Deprecated */;
        }
    }
    CompletionItemTag.from = from;
    function to(kind) {
        switch (kind) {
            case 1 /* languages.CompletionItemTag.Deprecated */: return types.CompletionItemTag.Deprecated;
        }
    }
    CompletionItemTag.to = to;
})(CompletionItemTag || (CompletionItemTag = {}));
export var CompletionCommand;
(function (CompletionCommand) {
    function from(c, converter, disposables) {
        if ('icon' in c && 'command' in c) {
            return {
                command: converter.toInternal(c.command, disposables),
                icon: IconPath.fromThemeIcon(c.icon)
            };
        }
        return { command: converter.toInternal(c, disposables) };
    }
    CompletionCommand.from = from;
})(CompletionCommand || (CompletionCommand = {}));
export var CompletionItemKind;
(function (CompletionItemKind) {
    const _from = new Map([
        [types.CompletionItemKind.Method, 0 /* languages.CompletionItemKind.Method */],
        [types.CompletionItemKind.Function, 1 /* languages.CompletionItemKind.Function */],
        [types.CompletionItemKind.Constructor, 2 /* languages.CompletionItemKind.Constructor */],
        [types.CompletionItemKind.Field, 3 /* languages.CompletionItemKind.Field */],
        [types.CompletionItemKind.Variable, 4 /* languages.CompletionItemKind.Variable */],
        [types.CompletionItemKind.Class, 5 /* languages.CompletionItemKind.Class */],
        [types.CompletionItemKind.Interface, 7 /* languages.CompletionItemKind.Interface */],
        [types.CompletionItemKind.Struct, 6 /* languages.CompletionItemKind.Struct */],
        [types.CompletionItemKind.Module, 8 /* languages.CompletionItemKind.Module */],
        [types.CompletionItemKind.Property, 9 /* languages.CompletionItemKind.Property */],
        [types.CompletionItemKind.Unit, 12 /* languages.CompletionItemKind.Unit */],
        [types.CompletionItemKind.Value, 13 /* languages.CompletionItemKind.Value */],
        [types.CompletionItemKind.Constant, 14 /* languages.CompletionItemKind.Constant */],
        [types.CompletionItemKind.Enum, 15 /* languages.CompletionItemKind.Enum */],
        [types.CompletionItemKind.EnumMember, 16 /* languages.CompletionItemKind.EnumMember */],
        [types.CompletionItemKind.Keyword, 17 /* languages.CompletionItemKind.Keyword */],
        [types.CompletionItemKind.Snippet, 28 /* languages.CompletionItemKind.Snippet */],
        [types.CompletionItemKind.Text, 18 /* languages.CompletionItemKind.Text */],
        [types.CompletionItemKind.Color, 19 /* languages.CompletionItemKind.Color */],
        [types.CompletionItemKind.File, 20 /* languages.CompletionItemKind.File */],
        [types.CompletionItemKind.Reference, 21 /* languages.CompletionItemKind.Reference */],
        [types.CompletionItemKind.Folder, 23 /* languages.CompletionItemKind.Folder */],
        [types.CompletionItemKind.Event, 10 /* languages.CompletionItemKind.Event */],
        [types.CompletionItemKind.Operator, 11 /* languages.CompletionItemKind.Operator */],
        [types.CompletionItemKind.TypeParameter, 24 /* languages.CompletionItemKind.TypeParameter */],
        [types.CompletionItemKind.Issue, 26 /* languages.CompletionItemKind.Issue */],
        [types.CompletionItemKind.User, 25 /* languages.CompletionItemKind.User */],
    ]);
    function from(kind) {
        return _from.get(kind) ?? 9 /* languages.CompletionItemKind.Property */;
    }
    CompletionItemKind.from = from;
    const _to = new Map([
        [0 /* languages.CompletionItemKind.Method */, types.CompletionItemKind.Method],
        [1 /* languages.CompletionItemKind.Function */, types.CompletionItemKind.Function],
        [2 /* languages.CompletionItemKind.Constructor */, types.CompletionItemKind.Constructor],
        [3 /* languages.CompletionItemKind.Field */, types.CompletionItemKind.Field],
        [4 /* languages.CompletionItemKind.Variable */, types.CompletionItemKind.Variable],
        [5 /* languages.CompletionItemKind.Class */, types.CompletionItemKind.Class],
        [7 /* languages.CompletionItemKind.Interface */, types.CompletionItemKind.Interface],
        [6 /* languages.CompletionItemKind.Struct */, types.CompletionItemKind.Struct],
        [8 /* languages.CompletionItemKind.Module */, types.CompletionItemKind.Module],
        [9 /* languages.CompletionItemKind.Property */, types.CompletionItemKind.Property],
        [12 /* languages.CompletionItemKind.Unit */, types.CompletionItemKind.Unit],
        [13 /* languages.CompletionItemKind.Value */, types.CompletionItemKind.Value],
        [14 /* languages.CompletionItemKind.Constant */, types.CompletionItemKind.Constant],
        [15 /* languages.CompletionItemKind.Enum */, types.CompletionItemKind.Enum],
        [16 /* languages.CompletionItemKind.EnumMember */, types.CompletionItemKind.EnumMember],
        [17 /* languages.CompletionItemKind.Keyword */, types.CompletionItemKind.Keyword],
        [28 /* languages.CompletionItemKind.Snippet */, types.CompletionItemKind.Snippet],
        [18 /* languages.CompletionItemKind.Text */, types.CompletionItemKind.Text],
        [19 /* languages.CompletionItemKind.Color */, types.CompletionItemKind.Color],
        [20 /* languages.CompletionItemKind.File */, types.CompletionItemKind.File],
        [21 /* languages.CompletionItemKind.Reference */, types.CompletionItemKind.Reference],
        [23 /* languages.CompletionItemKind.Folder */, types.CompletionItemKind.Folder],
        [10 /* languages.CompletionItemKind.Event */, types.CompletionItemKind.Event],
        [11 /* languages.CompletionItemKind.Operator */, types.CompletionItemKind.Operator],
        [24 /* languages.CompletionItemKind.TypeParameter */, types.CompletionItemKind.TypeParameter],
        [25 /* languages.CompletionItemKind.User */, types.CompletionItemKind.User],
        [26 /* languages.CompletionItemKind.Issue */, types.CompletionItemKind.Issue],
    ]);
    function to(kind) {
        return _to.get(kind) ?? types.CompletionItemKind.Property;
    }
    CompletionItemKind.to = to;
})(CompletionItemKind || (CompletionItemKind = {}));
export var CompletionItem;
(function (CompletionItem) {
    function to(suggestion, converter) {
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
        }
        else if (typeof suggestion.range === 'object') {
            result.range = { inserting: Range.to(suggestion.range.insert), replacing: Range.to(suggestion.range.replace) };
        }
        result.keepWhitespace = typeof suggestion.insertTextRules === 'undefined' ? false : Boolean(suggestion.insertTextRules & 1 /* languages.CompletionItemInsertTextRule.KeepWhitespace */);
        // 'insertText'-logic
        if (typeof suggestion.insertTextRules !== 'undefined' && suggestion.insertTextRules & 4 /* languages.CompletionItemInsertTextRule.InsertAsSnippet */) {
            result.insertText = new types.SnippetString(suggestion.insertText);
        }
        else {
            result.insertText = suggestion.insertText;
            result.textEdit = result.range instanceof types.Range ? new types.TextEdit(result.range, result.insertText) : undefined;
        }
        if (suggestion.additionalTextEdits && suggestion.additionalTextEdits.length > 0) {
            result.additionalTextEdits = suggestion.additionalTextEdits.map(e => TextEdit.to(e));
        }
        result.command = converter && suggestion.command ? converter.fromInternal(suggestion.command) : undefined;
        return result;
    }
    CompletionItem.to = to;
})(CompletionItem || (CompletionItem = {}));
export var ParameterInformation;
(function (ParameterInformation) {
    function from(info) {
        if (typeof info.label !== 'string' && !Array.isArray(info.label)) {
            throw new TypeError('Invalid label');
        }
        return {
            label: info.label,
            documentation: MarkdownString.fromStrict(info.documentation)
        };
    }
    ParameterInformation.from = from;
    function to(info) {
        return {
            label: info.label,
            documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation
        };
    }
    ParameterInformation.to = to;
})(ParameterInformation || (ParameterInformation = {}));
export var SignatureInformation;
(function (SignatureInformation) {
    function from(info) {
        return {
            label: info.label,
            documentation: MarkdownString.fromStrict(info.documentation),
            parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.from) : [],
            activeParameter: info.activeParameter,
        };
    }
    SignatureInformation.from = from;
    function to(info) {
        return {
            label: info.label,
            documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation,
            parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.to) : [],
            activeParameter: info.activeParameter,
        };
    }
    SignatureInformation.to = to;
})(SignatureInformation || (SignatureInformation = {}));
export var SignatureHelp;
(function (SignatureHelp) {
    function from(help) {
        return {
            activeSignature: help.activeSignature,
            activeParameter: help.activeParameter,
            signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.from) : [],
        };
    }
    SignatureHelp.from = from;
    function to(help) {
        return {
            activeSignature: help.activeSignature,
            activeParameter: help.activeParameter,
            signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.to) : [],
        };
    }
    SignatureHelp.to = to;
})(SignatureHelp || (SignatureHelp = {}));
export var InlayHint;
(function (InlayHint) {
    function to(converter, hint) {
        const res = new types.InlayHint(Position.to(hint.position), typeof hint.label === 'string' ? hint.label : hint.label.map(InlayHintLabelPart.to.bind(undefined, converter)), hint.kind && InlayHintKind.to(hint.kind));
        res.textEdits = hint.textEdits && hint.textEdits.map(TextEdit.to);
        res.tooltip = htmlContent.isMarkdownString(hint.tooltip) ? MarkdownString.to(hint.tooltip) : hint.tooltip;
        res.paddingLeft = hint.paddingLeft;
        res.paddingRight = hint.paddingRight;
        return res;
    }
    InlayHint.to = to;
})(InlayHint || (InlayHint = {}));
export var InlayHintLabelPart;
(function (InlayHintLabelPart) {
    function to(converter, part) {
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
    InlayHintLabelPart.to = to;
})(InlayHintLabelPart || (InlayHintLabelPart = {}));
export var InlayHintKind;
(function (InlayHintKind) {
    function from(kind) {
        return kind;
    }
    InlayHintKind.from = from;
    function to(kind) {
        return kind;
    }
    InlayHintKind.to = to;
})(InlayHintKind || (InlayHintKind = {}));
export var DocumentLink;
(function (DocumentLink) {
    function from(link) {
        return {
            range: Range.from(link.range),
            url: link.target,
            tooltip: link.tooltip
        };
    }
    DocumentLink.from = from;
    function to(link) {
        let target = undefined;
        if (link.url) {
            try {
                target = typeof link.url === 'string' ? URI.parse(link.url, true) : URI.revive(link.url);
            }
            catch (err) {
                // ignore
            }
        }
        const result = new types.DocumentLink(Range.to(link.range), target);
        result.tooltip = link.tooltip;
        return result;
    }
    DocumentLink.to = to;
})(DocumentLink || (DocumentLink = {}));
export var ColorPresentation;
(function (ColorPresentation) {
    function to(colorPresentation) {
        const cp = new types.ColorPresentation(colorPresentation.label);
        if (colorPresentation.textEdit) {
            cp.textEdit = TextEdit.to(colorPresentation.textEdit);
        }
        if (colorPresentation.additionalTextEdits) {
            cp.additionalTextEdits = colorPresentation.additionalTextEdits.map(value => TextEdit.to(value));
        }
        return cp;
    }
    ColorPresentation.to = to;
    function from(colorPresentation) {
        return {
            label: colorPresentation.label,
            textEdit: colorPresentation.textEdit ? TextEdit.from(colorPresentation.textEdit) : undefined,
            additionalTextEdits: colorPresentation.additionalTextEdits ? colorPresentation.additionalTextEdits.map(value => TextEdit.from(value)) : undefined
        };
    }
    ColorPresentation.from = from;
})(ColorPresentation || (ColorPresentation = {}));
export var Color;
(function (Color) {
    function to(c) {
        return new types.Color(c[0], c[1], c[2], c[3]);
    }
    Color.to = to;
    function from(color) {
        return [color.red, color.green, color.blue, color.alpha];
    }
    Color.from = from;
})(Color || (Color = {}));
export var SelectionRange;
(function (SelectionRange) {
    function from(obj) {
        return { range: Range.from(obj.range) };
    }
    SelectionRange.from = from;
    function to(obj) {
        return new types.SelectionRange(Range.to(obj.range));
    }
    SelectionRange.to = to;
})(SelectionRange || (SelectionRange = {}));
export var TextDocumentSaveReason;
(function (TextDocumentSaveReason) {
    function to(reason) {
        switch (reason) {
            case 2 /* SaveReason.AUTO */:
                return types.TextDocumentSaveReason.AfterDelay;
            case 1 /* SaveReason.EXPLICIT */:
                return types.TextDocumentSaveReason.Manual;
            case 3 /* SaveReason.FOCUS_CHANGE */:
            case 4 /* SaveReason.WINDOW_CHANGE */:
                return types.TextDocumentSaveReason.FocusOut;
        }
    }
    TextDocumentSaveReason.to = to;
})(TextDocumentSaveReason || (TextDocumentSaveReason = {}));
export var TextEditorLineNumbersStyle;
(function (TextEditorLineNumbersStyle) {
    function from(style) {
        switch (style) {
            case types.TextEditorLineNumbersStyle.Off:
                return 0 /* RenderLineNumbersType.Off */;
            case types.TextEditorLineNumbersStyle.Relative:
                return 2 /* RenderLineNumbersType.Relative */;
            case types.TextEditorLineNumbersStyle.Interval:
                return 3 /* RenderLineNumbersType.Interval */;
            case types.TextEditorLineNumbersStyle.On:
            default:
                return 1 /* RenderLineNumbersType.On */;
        }
    }
    TextEditorLineNumbersStyle.from = from;
    function to(style) {
        switch (style) {
            case 0 /* RenderLineNumbersType.Off */:
                return types.TextEditorLineNumbersStyle.Off;
            case 2 /* RenderLineNumbersType.Relative */:
                return types.TextEditorLineNumbersStyle.Relative;
            case 3 /* RenderLineNumbersType.Interval */:
                return types.TextEditorLineNumbersStyle.Interval;
            case 1 /* RenderLineNumbersType.On */:
            default:
                return types.TextEditorLineNumbersStyle.On;
        }
    }
    TextEditorLineNumbersStyle.to = to;
})(TextEditorLineNumbersStyle || (TextEditorLineNumbersStyle = {}));
export var EndOfLine;
(function (EndOfLine) {
    function from(eol) {
        if (eol === types.EndOfLine.CRLF) {
            return 1 /* EndOfLineSequence.CRLF */;
        }
        else if (eol === types.EndOfLine.LF) {
            return 0 /* EndOfLineSequence.LF */;
        }
        return undefined;
    }
    EndOfLine.from = from;
    function to(eol) {
        if (eol === 1 /* EndOfLineSequence.CRLF */) {
            return types.EndOfLine.CRLF;
        }
        else if (eol === 0 /* EndOfLineSequence.LF */) {
            return types.EndOfLine.LF;
        }
        return undefined;
    }
    EndOfLine.to = to;
})(EndOfLine || (EndOfLine = {}));
export var ProgressLocation;
(function (ProgressLocation) {
    function from(loc) {
        if (typeof loc === 'object') {
            return loc.viewId;
        }
        switch (loc) {
            case types.ProgressLocation.SourceControl: return 3 /* MainProgressLocation.Scm */;
            case types.ProgressLocation.Window: return 10 /* MainProgressLocation.Window */;
            case types.ProgressLocation.Notification: return 15 /* MainProgressLocation.Notification */;
        }
        throw new Error(`Unknown 'ProgressLocation'`);
    }
    ProgressLocation.from = from;
})(ProgressLocation || (ProgressLocation = {}));
export var FoldingRange;
(function (FoldingRange) {
    function from(r) {
        const range = { start: r.start + 1, end: r.end + 1 };
        if (r.kind) {
            range.kind = FoldingRangeKind.from(r.kind);
        }
        return range;
    }
    FoldingRange.from = from;
    function to(r) {
        const range = { start: r.start - 1, end: r.end - 1 };
        if (r.kind) {
            range.kind = FoldingRangeKind.to(r.kind);
        }
        return range;
    }
    FoldingRange.to = to;
})(FoldingRange || (FoldingRange = {}));
export var FoldingRangeKind;
(function (FoldingRangeKind) {
    function from(kind) {
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
    FoldingRangeKind.from = from;
    function to(kind) {
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
    FoldingRangeKind.to = to;
})(FoldingRangeKind || (FoldingRangeKind = {}));
export var TextEditorOpenOptions;
(function (TextEditorOpenOptions) {
    function from(options) {
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
    TextEditorOpenOptions.from = from;
})(TextEditorOpenOptions || (TextEditorOpenOptions = {}));
export var GlobPattern;
(function (GlobPattern) {
    function from(pattern) {
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
    GlobPattern.from = from;
    function isRelativePatternShape(obj) {
        const rp = obj;
        if (!rp) {
            return false;
        }
        return URI.isUri(rp.baseUri) && typeof rp.pattern === 'string';
    }
    function isLegacyRelativePatternShape(obj) {
        // Before 1.64.x, `RelativePattern` did not have any `baseUri: Uri`
        // property. To preserve backwards compatibility with older extensions
        // we allow this old format when creating the `vscode.RelativePattern`.
        const rp = obj;
        if (!rp) {
            return false;
        }
        return typeof rp.base === 'string' && typeof rp.pattern === 'string';
    }
    function to(pattern) {
        if (typeof pattern === 'string') {
            return pattern;
        }
        return new types.RelativePattern(URI.revive(pattern.baseUri), pattern.pattern);
    }
    GlobPattern.to = to;
})(GlobPattern || (GlobPattern = {}));
export var LanguageSelector;
(function (LanguageSelector) {
    function from(selector) {
        if (!selector) {
            return undefined;
        }
        else if (Array.isArray(selector)) {
            return selector.map(from);
        }
        else if (typeof selector === 'string') {
            return selector;
        }
        else {
            const filter = selector; // TODO: microsoft/TypeScript#42768
            return {
                language: filter.language,
                scheme: filter.scheme,
                pattern: GlobPattern.from(filter.pattern) ?? undefined,
                exclusive: filter.exclusive,
                notebookType: filter.notebookType
            };
        }
    }
    LanguageSelector.from = from;
})(LanguageSelector || (LanguageSelector = {}));
export var NotebookRange;
(function (NotebookRange) {
    function from(range) {
        return { start: range.start, end: range.end };
    }
    NotebookRange.from = from;
    function to(range) {
        return new types.NotebookRange(range.start, range.end);
    }
    NotebookRange.to = to;
})(NotebookRange || (NotebookRange = {}));
export var NotebookCellExecutionSummary;
(function (NotebookCellExecutionSummary) {
    function to(data) {
        return {
            timing: typeof data.runStartTime === 'number' && typeof data.runEndTime === 'number' ? { startTime: data.runStartTime, endTime: data.runEndTime } : undefined,
            executionOrder: data.executionOrder,
            success: data.lastRunSuccess
        };
    }
    NotebookCellExecutionSummary.to = to;
    function from(data) {
        return {
            lastRunSuccess: data.success,
            runStartTime: data.timing?.startTime,
            runEndTime: data.timing?.endTime,
            executionOrder: data.executionOrder
        };
    }
    NotebookCellExecutionSummary.from = from;
})(NotebookCellExecutionSummary || (NotebookCellExecutionSummary = {}));
export var NotebookCellKind;
(function (NotebookCellKind) {
    function from(data) {
        switch (data) {
            case types.NotebookCellKind.Markup:
                return notebooks.CellKind.Markup;
            case types.NotebookCellKind.Code:
            default:
                return notebooks.CellKind.Code;
        }
    }
    NotebookCellKind.from = from;
    function to(data) {
        switch (data) {
            case notebooks.CellKind.Markup:
                return types.NotebookCellKind.Markup;
            case notebooks.CellKind.Code:
            default:
                return types.NotebookCellKind.Code;
        }
    }
    NotebookCellKind.to = to;
})(NotebookCellKind || (NotebookCellKind = {}));
export var NotebookData;
(function (NotebookData) {
    function from(data) {
        const res = {
            metadata: data.metadata ?? Object.create(null),
            cells: [],
        };
        for (const cell of data.cells) {
            types.NotebookCellData.validate(cell);
            res.cells.push(NotebookCellData.from(cell));
        }
        return res;
    }
    NotebookData.from = from;
    function to(data) {
        const res = new types.NotebookData(data.cells.map(NotebookCellData.to));
        if (!isEmptyObject(data.metadata)) {
            res.metadata = data.metadata;
        }
        return res;
    }
    NotebookData.to = to;
})(NotebookData || (NotebookData = {}));
export var NotebookCellData;
(function (NotebookCellData) {
    function from(data) {
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
    NotebookCellData.from = from;
    function to(data) {
        return new types.NotebookCellData(NotebookCellKind.to(data.cellKind), data.source, data.language, data.mime, data.outputs ? data.outputs.map(NotebookCellOutput.to) : undefined, data.metadata, data.internalMetadata ? NotebookCellExecutionSummary.to(data.internalMetadata) : undefined);
    }
    NotebookCellData.to = to;
})(NotebookCellData || (NotebookCellData = {}));
export var NotebookCellOutputItem;
(function (NotebookCellOutputItem) {
    function from(item) {
        return {
            mime: item.mime,
            valueBytes: VSBuffer.wrap(item.data),
        };
    }
    NotebookCellOutputItem.from = from;
    function to(item) {
        return new types.NotebookCellOutputItem(item.valueBytes.buffer, item.mime);
    }
    NotebookCellOutputItem.to = to;
})(NotebookCellOutputItem || (NotebookCellOutputItem = {}));
export var NotebookCellOutput;
(function (NotebookCellOutput) {
    function from(output) {
        return {
            outputId: output.id,
            items: output.items.map(NotebookCellOutputItem.from),
            metadata: output.metadata
        };
    }
    NotebookCellOutput.from = from;
    function to(output) {
        const items = output.items.map(NotebookCellOutputItem.to);
        return new types.NotebookCellOutput(items, output.outputId, output.metadata);
    }
    NotebookCellOutput.to = to;
})(NotebookCellOutput || (NotebookCellOutput = {}));
export var NotebookExclusiveDocumentPattern;
(function (NotebookExclusiveDocumentPattern) {
    function from(pattern) {
        if (isExclusivePattern(pattern)) {
            return {
                include: GlobPattern.from(pattern.include) ?? undefined,
                exclude: GlobPattern.from(pattern.exclude) ?? undefined,
            };
        }
        return GlobPattern.from(pattern) ?? undefined;
    }
    NotebookExclusiveDocumentPattern.from = from;
    function to(pattern) {
        if (isExclusivePattern(pattern)) {
            return {
                include: GlobPattern.to(pattern.include),
                exclude: GlobPattern.to(pattern.exclude)
            };
        }
        return GlobPattern.to(pattern);
    }
    NotebookExclusiveDocumentPattern.to = to;
    function isExclusivePattern(obj) {
        const ep = obj;
        if (!ep) {
            return false;
        }
        return !isUndefinedOrNull(ep.include) && !isUndefinedOrNull(ep.exclude);
    }
})(NotebookExclusiveDocumentPattern || (NotebookExclusiveDocumentPattern = {}));
export var NotebookStatusBarItem;
(function (NotebookStatusBarItem) {
    function from(item, commandsConverter, disposables) {
        const command = typeof item.command === 'string' ? { title: '', command: item.command } : item.command;
        return {
            alignment: item.alignment === types.NotebookCellStatusBarAlignment.Left ? 1 /* notebooks.CellStatusbarAlignment.Left */ : 2 /* notebooks.CellStatusbarAlignment.Right */,
            command: commandsConverter.toInternal(command, disposables), // TODO@roblou
            text: item.text,
            tooltip: item.tooltip,
            accessibilityInformation: item.accessibilityInformation,
            priority: item.priority
        };
    }
    NotebookStatusBarItem.from = from;
})(NotebookStatusBarItem || (NotebookStatusBarItem = {}));
export var NotebookKernelSourceAction;
(function (NotebookKernelSourceAction) {
    function from(item, commandsConverter, disposables) {
        const command = typeof item.command === 'string' ? { title: '', command: item.command } : item.command;
        return {
            command: commandsConverter.toInternal(command, disposables),
            label: item.label,
            description: item.description,
            detail: item.detail,
            documentation: item.documentation
        };
    }
    NotebookKernelSourceAction.from = from;
})(NotebookKernelSourceAction || (NotebookKernelSourceAction = {}));
export var NotebookDocumentContentOptions;
(function (NotebookDocumentContentOptions) {
    function from(options) {
        return {
            transientOutputs: options?.transientOutputs ?? false,
            transientCellMetadata: options?.transientCellMetadata ?? {},
            transientDocumentMetadata: options?.transientDocumentMetadata ?? {},
            cellContentMetadata: options?.cellContentMetadata ?? {}
        };
    }
    NotebookDocumentContentOptions.from = from;
})(NotebookDocumentContentOptions || (NotebookDocumentContentOptions = {}));
export var NotebookRendererScript;
(function (NotebookRendererScript) {
    function from(preload) {
        return {
            uri: preload.uri,
            provides: preload.provides
        };
    }
    NotebookRendererScript.from = from;
    function to(preload) {
        return new types.NotebookRendererScript(URI.revive(preload.uri), preload.provides);
    }
    NotebookRendererScript.to = to;
})(NotebookRendererScript || (NotebookRendererScript = {}));
export var TestMessage;
(function (TestMessage) {
    function from(message) {
        return {
            message: MarkdownString.fromStrict(message.message) || '',
            type: 0 /* TestMessageType.Error */,
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
    TestMessage.from = from;
    function to(item) {
        const message = new types.TestMessage(typeof item.message === 'string' ? item.message : MarkdownString.to(item.message));
        message.actualOutput = item.actual;
        message.expectedOutput = item.expected;
        message.contextValue = item.contextValue;
        message.location = item.location ? location.to(item.location) : undefined;
        return message;
    }
    TestMessage.to = to;
})(TestMessage || (TestMessage = {}));
export var TestTag;
(function (TestTag) {
    TestTag.namespace = namespaceTestTag;
    TestTag.denamespace = denamespaceTestTag;
})(TestTag || (TestTag = {}));
export var TestRunProfile;
(function (TestRunProfile) {
    function from(item) {
        return {
            controllerId: item.controllerId,
            profileId: item.profileId,
            group: TestRunProfileKind.from(item.kind),
        };
    }
    TestRunProfile.from = from;
})(TestRunProfile || (TestRunProfile = {}));
export var TestRunProfileKind;
(function (TestRunProfileKind) {
    const profileGroupToBitset = {
        [types.TestRunProfileKind.Coverage]: 8 /* TestRunProfileBitset.Coverage */,
        [types.TestRunProfileKind.Debug]: 4 /* TestRunProfileBitset.Debug */,
        [types.TestRunProfileKind.Run]: 2 /* TestRunProfileBitset.Run */,
    };
    function from(kind) {
        return profileGroupToBitset.hasOwnProperty(kind) ? profileGroupToBitset[kind] : 2 /* TestRunProfileBitset.Run */;
    }
    TestRunProfileKind.from = from;
})(TestRunProfileKind || (TestRunProfileKind = {}));
export var TestItem;
(function (TestItem) {
    function from(item) {
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
    TestItem.from = from;
    function toPlain(item) {
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
    TestItem.toPlain = toPlain;
})(TestItem || (TestItem = {}));
(function (TestTag) {
    function from(tag) {
        return { id: tag.id };
    }
    TestTag.from = from;
    function to(tag) {
        return new types.TestTag(tag.id);
    }
    TestTag.to = to;
})(TestTag || (TestTag = {}));
export var TestResults;
(function (TestResults) {
    const convertTestResultItem = (node, parent) => {
        const item = node.value;
        if (!item) {
            return undefined; // should be unreachable
        }
        const snapshot = ({
            ...TestItem.toPlain(item.item),
            parent,
            taskStates: item.tasks.map(t => ({
                state: t.state,
                duration: t.duration,
                messages: t.messages
                    .filter((m) => m.type === 0 /* TestMessageType.Error */)
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
    function to(serialized) {
        const tree = new WellDefinedPrefixTree();
        for (const item of serialized.items) {
            tree.insert(TestId.fromString(item.item.extId).path, item);
        }
        // Get the first node with a value in each subtree of IDs.
        const queue = [tree.nodes];
        const roots = [];
        while (queue.length) {
            for (const node of queue.pop()) {
                if (node.value) {
                    roots.push(node);
                }
                else if (node.children) {
                    queue.push(node.children.values());
                }
            }
        }
        return {
            completedAt: serialized.completedAt,
            results: roots.map(r => convertTestResultItem(r)).filter(isDefined),
        };
    }
    TestResults.to = to;
})(TestResults || (TestResults = {}));
export var TestCoverage;
(function (TestCoverage) {
    function fromCoverageCount(count) {
        return { covered: count.covered, total: count.total };
    }
    function fromLocation(location) {
        return 'line' in location ? Position.from(location) : Range.from(location);
    }
    function toLocation(location) {
        if (!location) {
            return undefined;
        }
        return 'endLineNumber' in location ? Range.to(location) : Position.to(location);
    }
    function to(serialized) {
        if (serialized.type === 1 /* DetailType.Statement */) {
            const branches = [];
            if (serialized.branches) {
                for (const branch of serialized.branches) {
                    branches.push({
                        executed: branch.count,
                        location: toLocation(branch.location),
                        label: branch.label
                    });
                }
            }
            return new types.StatementCoverage(serialized.count, toLocation(serialized.location), serialized.branches?.map(b => new types.BranchCoverage(b.count, toLocation(b.location), b.label)));
        }
        else {
            return new types.DeclarationCoverage(serialized.name, serialized.count, toLocation(serialized.location));
        }
    }
    TestCoverage.to = to;
    function fromDetails(coverage) {
        if (typeof coverage.executed === 'number' && coverage.executed < 0) {
            throw new Error(`Invalid coverage count ${coverage.executed}`);
        }
        if ('branches' in coverage) {
            return {
                count: coverage.executed,
                location: fromLocation(coverage.location),
                type: 1 /* DetailType.Statement */,
                branches: coverage.branches.length
                    ? coverage.branches.map(b => ({ count: b.executed, location: b.location && fromLocation(b.location), label: b.label }))
                    : undefined,
            };
        }
        else {
            return {
                type: 0 /* DetailType.Declaration */,
                name: coverage.name,
                count: coverage.executed,
                location: fromLocation(coverage.location),
            };
        }
    }
    TestCoverage.fromDetails = fromDetails;
    function fromFile(controllerId, id, coverage) {
        types.validateTestCoverageCount(coverage.statementCoverage);
        types.validateTestCoverageCount(coverage.branchCoverage);
        types.validateTestCoverageCount(coverage.declarationCoverage);
        return {
            id,
            uri: coverage.uri,
            statement: fromCoverageCount(coverage.statementCoverage),
            branch: coverage.branchCoverage && fromCoverageCount(coverage.branchCoverage),
            declaration: coverage.declarationCoverage && fromCoverageCount(coverage.declarationCoverage),
            testIds: coverage instanceof types.FileCoverage && coverage.includesTests.length ?
                coverage.includesTests.map(t => TestId.fromExtHostTestItem(t, controllerId).toString()) : undefined,
        };
    }
    TestCoverage.fromFile = fromFile;
})(TestCoverage || (TestCoverage = {}));
export var CodeActionTriggerKind;
(function (CodeActionTriggerKind) {
    function to(value) {
        switch (value) {
            case 1 /* languages.CodeActionTriggerType.Invoke */:
                return types.CodeActionTriggerKind.Invoke;
            case 2 /* languages.CodeActionTriggerType.Auto */:
                return types.CodeActionTriggerKind.Automatic;
        }
    }
    CodeActionTriggerKind.to = to;
})(CodeActionTriggerKind || (CodeActionTriggerKind = {}));
export var TypeHierarchyItem;
(function (TypeHierarchyItem) {
    function to(item) {
        const result = new types.TypeHierarchyItem(SymbolKind.to(item.kind), item.name, item.detail || '', URI.revive(item.uri), Range.to(item.range), Range.to(item.selectionRange));
        result._sessionId = item._sessionId;
        result._itemId = item._itemId;
        return result;
    }
    TypeHierarchyItem.to = to;
    function from(item, sessionId, itemId) {
        sessionId = sessionId ?? item._sessionId;
        itemId = itemId ?? item._itemId;
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
    TypeHierarchyItem.from = from;
})(TypeHierarchyItem || (TypeHierarchyItem = {}));
export var ViewBadge;
(function (ViewBadge) {
    function from(badge) {
        if (!badge) {
            return undefined;
        }
        return {
            value: badge.value,
            tooltip: badge.tooltip
        };
    }
    ViewBadge.from = from;
})(ViewBadge || (ViewBadge = {}));
export var DataTransferItem;
(function (DataTransferItem) {
    function to(mime, item, resolveFileData) {
        const file = item.fileData;
        if (file) {
            return new types.InternalFileDataTransferItem(new types.DataTransferFile(file.name, URI.revive(file.uri), file.id, createSingleCallFunction(() => resolveFileData(file.id))));
        }
        if (mime === Mimes.uriList && item.uriListData) {
            return new types.InternalDataTransferItem(reviveUriList(item.uriListData));
        }
        return new types.InternalDataTransferItem(item.asString);
    }
    DataTransferItem.to = to;
    async function from(mime, item, id = generateUuid()) {
        const stringValue = await item.asString();
        if (mime === Mimes.uriList) {
            return {
                id,
                asString: stringValue,
                fileData: undefined,
                uriListData: serializeUriList(stringValue),
            };
        }
        const fileValue = item.asFile();
        return {
            id,
            asString: stringValue,
            fileData: fileValue ? {
                name: fileValue.name,
                uri: fileValue.uri,
                id: fileValue._itemId ?? fileValue.id,
            } : undefined,
        };
    }
    DataTransferItem.from = from;
    function serializeUriList(stringValue) {
        return UriList.split(stringValue).map(part => {
            if (part.startsWith('#')) {
                return part;
            }
            try {
                return URI.parse(part);
            }
            catch {
                // noop
            }
            return part;
        });
    }
    function reviveUriList(parts) {
        return UriList.create(parts.map(part => {
            return typeof part === 'string' ? part : URI.revive(part);
        }));
    }
})(DataTransferItem || (DataTransferItem = {}));
export var DataTransfer;
(function (DataTransfer) {
    function toDataTransfer(value, resolveFileData) {
        const init = value.items.map(([type, item]) => {
            return [type, DataTransferItem.to(type, item, resolveFileData)];
        });
        return new types.DataTransfer(init);
    }
    DataTransfer.toDataTransfer = toDataTransfer;
    async function from(dataTransfer) {
        const items = await Promise.all(Array.from(dataTransfer, async ([mime, value]) => {
            return [mime, await DataTransferItem.from(mime, value)];
        }));
        return { items };
    }
    DataTransfer.from = from;
    async function fromList(dataTransfer) {
        const items = await Promise.all(Array.from(dataTransfer, async ([mime, value]) => {
            return [mime, await DataTransferItem.from(mime, value, value.id)];
        }));
        return { items };
    }
    DataTransfer.fromList = fromList;
})(DataTransfer || (DataTransfer = {}));
export var ChatFollowup;
(function (ChatFollowup) {
    function from(followup, request) {
        return {
            kind: 'reply',
            agentId: followup.participant ?? request?.agentId ?? '',
            subCommand: followup.command ?? request?.command,
            message: followup.prompt,
            title: followup.label
        };
    }
    ChatFollowup.from = from;
    function to(followup) {
        return {
            prompt: followup.message,
            label: followup.title,
            participant: followup.agentId,
            command: followup.subCommand,
        };
    }
    ChatFollowup.to = to;
})(ChatFollowup || (ChatFollowup = {}));
export var LanguageModelChatMessageRole;
(function (LanguageModelChatMessageRole) {
    function to(role) {
        switch (role) {
            case 0 /* chatProvider.ChatMessageRole.System */: return types.LanguageModelChatMessageRole.System;
            case 1 /* chatProvider.ChatMessageRole.User */: return types.LanguageModelChatMessageRole.User;
            case 2 /* chatProvider.ChatMessageRole.Assistant */: return types.LanguageModelChatMessageRole.Assistant;
        }
    }
    LanguageModelChatMessageRole.to = to;
    function from(role) {
        switch (role) {
            case types.LanguageModelChatMessageRole.System: return 0 /* chatProvider.ChatMessageRole.System */;
            case types.LanguageModelChatMessageRole.User: return 1 /* chatProvider.ChatMessageRole.User */;
            case types.LanguageModelChatMessageRole.Assistant: return 2 /* chatProvider.ChatMessageRole.Assistant */;
        }
        return 1 /* chatProvider.ChatMessageRole.User */;
    }
    LanguageModelChatMessageRole.from = from;
})(LanguageModelChatMessageRole || (LanguageModelChatMessageRole = {}));
export var LanguageModelChatMessage;
(function (LanguageModelChatMessage) {
    function to(message) {
        const content = message.content.map(c => {
            if (c.type === 'text') {
                return new LanguageModelTextPart(c.value, c.audience);
            }
            else if (c.type === 'tool_result') {
                const content = coalesce(c.value.map(part => {
                    if (part.type === 'text') {
                        return new types.LanguageModelTextPart(part.value, part.audience);
                    }
                    else if (part.type === 'data') {
                        return new types.LanguageModelDataPart(part.data.buffer, part.mimeType);
                    }
                    else if (part.type === 'prompt_tsx') {
                        return new types.LanguageModelPromptTsxPart(part.value);
                    }
                    else {
                        return undefined; // Strip unknown parts
                    }
                }));
                return new types.LanguageModelToolResultPart(c.toolCallId, content, c.isError);
            }
            else if (c.type === 'image_url') {
                return new types.LanguageModelDataPart(c.value.data.buffer, c.value.mimeType);
            }
            else if (c.type === 'data') {
                return new types.LanguageModelDataPart(c.data.buffer, c.mimeType);
            }
            else if (c.type === 'tool_use') {
                return new types.LanguageModelToolCallPart(c.toolCallId, c.name, c.parameters);
            }
            return undefined;
        }).filter(c => c !== undefined);
        const role = LanguageModelChatMessageRole.to(message.role);
        const result = new types.LanguageModelChatMessage(role, content, message.name);
        return result;
    }
    LanguageModelChatMessage.to = to;
    function from(message) {
        const role = LanguageModelChatMessageRole.from(message.role);
        const name = message.name;
        let messageContent = message.content;
        if (typeof messageContent === 'string') {
            messageContent = [new types.LanguageModelTextPart(messageContent)];
        }
        const content = messageContent.map((c) => {
            if (c instanceof types.LanguageModelToolResultPart) {
                return {
                    type: 'tool_result',
                    toolCallId: c.callId,
                    value: coalesce(c.content.map(part => {
                        if (part instanceof types.LanguageModelTextPart) {
                            return {
                                type: 'text',
                                value: part.value,
                                audience: part.audience,
                            };
                        }
                        else if (part instanceof types.LanguageModelPromptTsxPart) {
                            return {
                                type: 'prompt_tsx',
                                value: part.value,
                            };
                        }
                        else if (part instanceof types.LanguageModelDataPart) {
                            return {
                                type: 'data',
                                mimeType: part.mimeType,
                                data: VSBuffer.wrap(part.data),
                                audience: part.audience
                            };
                        }
                        else {
                            // Strip unknown parts
                            return undefined;
                        }
                    })),
                    isError: c.isError
                };
            }
            else if (c instanceof types.LanguageModelDataPart) {
                if (isImageDataPart(c)) {
                    const value = {
                        mimeType: c.mimeType,
                        data: VSBuffer.wrap(c.data),
                    };
                    return {
                        type: 'image_url',
                        value: value
                    };
                }
                else {
                    return {
                        type: 'data',
                        mimeType: c.mimeType,
                        data: VSBuffer.wrap(c.data),
                        audience: c.audience
                    };
                }
            }
            else if (c instanceof types.LanguageModelToolCallPart) {
                return {
                    type: 'tool_use',
                    toolCallId: c.callId,
                    name: c.name,
                    parameters: c.input
                };
            }
            else if (c instanceof types.LanguageModelTextPart) {
                return {
                    type: 'text',
                    value: c.value
                };
            }
            else {
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
    LanguageModelChatMessage.from = from;
})(LanguageModelChatMessage || (LanguageModelChatMessage = {}));
export var LanguageModelChatMessage2;
(function (LanguageModelChatMessage2) {
    function to(message) {
        const content = message.content.map(c => {
            if (c.type === 'text') {
                return new LanguageModelTextPart(c.value, c.audience);
            }
            else if (c.type === 'tool_result') {
                const content = c.value.map(part => {
                    if (part.type === 'text') {
                        return new types.LanguageModelTextPart(part.value, part.audience);
                    }
                    else if (part.type === 'data') {
                        return new types.LanguageModelDataPart(part.data.buffer, part.mimeType);
                    }
                    else {
                        return new types.LanguageModelPromptTsxPart(part.value);
                    }
                });
                return new types.LanguageModelToolResultPart(c.toolCallId, content, c.isError);
            }
            else if (c.type === 'image_url') {
                return new types.LanguageModelDataPart(c.value.data.buffer, c.value.mimeType);
            }
            else if (c.type === 'data') {
                return new types.LanguageModelDataPart(c.data.buffer, c.mimeType);
            }
            else if (c.type === 'thinking') {
                return new types.LanguageModelThinkingPart(c.value, c.id, c.metadata);
            }
            else {
                return new types.LanguageModelToolCallPart(c.toolCallId, c.name, c.parameters);
            }
        });
        const role = LanguageModelChatMessageRole.to(message.role);
        const result = new types.LanguageModelChatMessage2(role, content, message.name);
        return result;
    }
    LanguageModelChatMessage2.to = to;
    function from(message) {
        const role = LanguageModelChatMessageRole.from(message.role);
        const name = message.name;
        let messageContent = message.content;
        if (typeof messageContent === 'string') {
            messageContent = [new types.LanguageModelTextPart(messageContent)];
        }
        const content = messageContent.map((c) => {
            if (c instanceof types.LanguageModelToolResultPart) {
                return {
                    type: 'tool_result',
                    toolCallId: c.callId,
                    value: coalesce(c.content.map(part => {
                        if (part instanceof types.LanguageModelTextPart) {
                            return {
                                type: 'text',
                                value: part.value,
                                audience: part.audience,
                            };
                        }
                        else if (part instanceof types.LanguageModelPromptTsxPart) {
                            return {
                                type: 'prompt_tsx',
                                value: part.value,
                            };
                        }
                        else if (part instanceof types.LanguageModelDataPart) {
                            return {
                                type: 'data',
                                mimeType: part.mimeType,
                                data: VSBuffer.wrap(part.data),
                                audience: part.audience
                            };
                        }
                        else {
                            // Strip unknown parts
                            return undefined;
                        }
                    })),
                    isError: c.isError
                };
            }
            else if (c instanceof types.LanguageModelDataPart) {
                if (isImageDataPart(c)) {
                    const value = {
                        mimeType: c.mimeType,
                        data: VSBuffer.wrap(c.data),
                    };
                    return {
                        type: 'image_url',
                        value: value
                    };
                }
                else {
                    return {
                        type: 'data',
                        mimeType: c.mimeType,
                        data: VSBuffer.wrap(c.data),
                        audience: c.audience
                    };
                }
            }
            else if (c instanceof types.LanguageModelToolCallPart) {
                return {
                    type: 'tool_use',
                    toolCallId: c.callId,
                    name: c.name,
                    parameters: c.input
                };
            }
            else if (c instanceof types.LanguageModelTextPart) {
                return {
                    type: 'text',
                    value: c.value
                };
            }
            else if (c instanceof types.LanguageModelThinkingPart) {
                return {
                    type: 'thinking',
                    value: c.value,
                    id: c.id,
                    metadata: c.metadata
                };
            }
            else {
                if (typeof c !== 'string') {
                    throw new Error('Unexpected chat message content type llm 2');
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
    LanguageModelChatMessage2.from = from;
})(LanguageModelChatMessage2 || (LanguageModelChatMessage2 = {}));
function isImageDataPart(part) {
    const mime = typeof part.mimeType === 'string' ? part.mimeType.toLowerCase() : '';
    switch (mime) {
        case 'image/png':
        case 'image/jpeg':
        case 'image/jpg':
        case 'image/gif':
        case 'image/webp':
        case 'image/bmp':
            return true;
        default:
            return false;
    }
}
export var ChatResponseMarkdownPart;
(function (ChatResponseMarkdownPart) {
    function from(part) {
        return {
            kind: 'markdownContent',
            content: MarkdownString.from(part.value)
        };
    }
    ChatResponseMarkdownPart.from = from;
    function to(part) {
        return new types.ChatResponseMarkdownPart(MarkdownString.to(part.content));
    }
    ChatResponseMarkdownPart.to = to;
})(ChatResponseMarkdownPart || (ChatResponseMarkdownPart = {}));
export var ChatResponseCodeblockUriPart;
(function (ChatResponseCodeblockUriPart) {
    function from(part) {
        return {
            kind: 'codeblockUri',
            uri: part.value,
            isEdit: part.isEdit,
            undoStopId: part.undoStopId
        };
    }
    ChatResponseCodeblockUriPart.from = from;
    function to(part) {
        return new types.ChatResponseCodeblockUriPart(URI.revive(part.uri), part.isEdit, part.undoStopId);
    }
    ChatResponseCodeblockUriPart.to = to;
})(ChatResponseCodeblockUriPart || (ChatResponseCodeblockUriPart = {}));
export var ChatResponseMarkdownWithVulnerabilitiesPart;
(function (ChatResponseMarkdownWithVulnerabilitiesPart) {
    function from(part) {
        return {
            kind: 'markdownVuln',
            content: MarkdownString.from(part.value),
            vulnerabilities: part.vulnerabilities,
        };
    }
    ChatResponseMarkdownWithVulnerabilitiesPart.from = from;
    function to(part) {
        return new types.ChatResponseMarkdownWithVulnerabilitiesPart(MarkdownString.to(part.content), part.vulnerabilities);
    }
    ChatResponseMarkdownWithVulnerabilitiesPart.to = to;
})(ChatResponseMarkdownWithVulnerabilitiesPart || (ChatResponseMarkdownWithVulnerabilitiesPart = {}));
export var ChatResponseConfirmationPart;
(function (ChatResponseConfirmationPart) {
    function from(part) {
        return {
            kind: 'confirmation',
            title: part.title,
            message: MarkdownString.from(part.message),
            data: part.data,
            buttons: part.buttons
        };
    }
    ChatResponseConfirmationPart.from = from;
})(ChatResponseConfirmationPart || (ChatResponseConfirmationPart = {}));
export var ChatResponseQuestionCarouselPart;
(function (ChatResponseQuestionCarouselPart) {
    function questionTypeToString(type) {
        switch (type) {
            case types.ChatQuestionType.Text: return 'text';
            case types.ChatQuestionType.SingleSelect: return 'singleSelect';
            case types.ChatQuestionType.MultiSelect: return 'multiSelect';
            default: return 'text';
        }
    }
    function stringToQuestionType(type) {
        switch (type) {
            case 'text': return types.ChatQuestionType.Text;
            case 'singleSelect': return types.ChatQuestionType.SingleSelect;
            case 'multiSelect': return types.ChatQuestionType.MultiSelect;
            default: return types.ChatQuestionType.Text;
        }
    }
    function from(part) {
        return {
            kind: 'questionCarousel',
            questions: part.questions.map(q => ({
                id: q.id,
                type: questionTypeToString(q.type),
                title: q.title,
                message: q.message ? MarkdownString.from(q.message) : undefined,
                options: q.options?.map(opt => ({ id: opt.id, label: opt.label, value: String(opt.value) })),
                defaultValue: q.defaultValue,
                allowFreeformInput: q.allowFreeformInput
            })),
            allowSkip: part.allowSkip
        };
    }
    ChatResponseQuestionCarouselPart.from = from;
    function to(part) {
        const questions = part.questions.map(q => new types.ChatQuestion(q.id, stringToQuestionType(q.type), q.title, {
            message: q.message ? (typeof q.message === 'string' ? new types.MarkdownString(q.message) : MarkdownString.to(q.message)) : undefined,
            options: q.options?.map(opt => ({
                id: opt.id,
                label: opt.label,
                value: opt.value
            })),
            defaultValue: q.defaultValue,
            allowFreeformInput: q.allowFreeformInput
        }));
        return new types.ChatResponseQuestionCarouselPart(questions, part.allowSkip);
    }
    ChatResponseQuestionCarouselPart.to = to;
})(ChatResponseQuestionCarouselPart || (ChatResponseQuestionCarouselPart = {}));
export var ChatResponseFilesPart;
(function (ChatResponseFilesPart) {
    function from(part) {
        const { value, baseUri } = part;
        function convert(items, baseUri) {
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
    ChatResponseFilesPart.from = from;
    function to(part) {
        const treeData = revive(part.treeData);
        function convert(items) {
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
    ChatResponseFilesPart.to = to;
})(ChatResponseFilesPart || (ChatResponseFilesPart = {}));
export var ChatResponseMultiDiffPart;
(function (ChatResponseMultiDiffPart) {
    function from(part) {
        return {
            kind: 'multiDiffData',
            multiDiffData: {
                title: part.title,
                resources: part.value.map(entry => ({
                    originalUri: entry.originalUri,
                    modifiedUri: entry.modifiedUri,
                    goToFileUri: entry.goToFileUri,
                    added: entry.added,
                    removed: entry.removed,
                }))
            },
            readOnly: part.readOnly
        };
    }
    ChatResponseMultiDiffPart.from = from;
    function to(part) {
        const resources = part.multiDiffData.resources.map(resource => ({
            originalUri: resource.originalUri ? URI.revive(resource.originalUri) : undefined,
            modifiedUri: resource.modifiedUri ? URI.revive(resource.modifiedUri) : undefined,
            goToFileUri: resource.goToFileUri ? URI.revive(resource.goToFileUri) : undefined,
            added: resource.added,
            removed: resource.removed,
        }));
        return new types.ChatResponseMultiDiffPart(resources, part.multiDiffData.title, part.readOnly);
    }
    ChatResponseMultiDiffPart.to = to;
})(ChatResponseMultiDiffPart || (ChatResponseMultiDiffPart = {}));
export var ChatResponseAnchorPart;
(function (ChatResponseAnchorPart) {
    function from(part) {
        // Work around type-narrowing confusion between vscode.Uri and URI
        const isUri = (thing) => URI.isUri(thing);
        const isSymbolInformation = (thing) => 'name' in thing;
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
    ChatResponseAnchorPart.from = from;
    function to(part) {
        const value = revive(part);
        return new types.ChatResponseAnchorPart(URI.isUri(value.inlineReference)
            ? value.inlineReference
            : 'location' in value.inlineReference
                ? WorkspaceSymbol.to(value.inlineReference)
                : Location.to(value.inlineReference), part.name);
    }
    ChatResponseAnchorPart.to = to;
})(ChatResponseAnchorPart || (ChatResponseAnchorPart = {}));
export var ChatResponseProgressPart;
(function (ChatResponseProgressPart) {
    function from(part) {
        return {
            kind: 'progressMessage',
            content: MarkdownString.from(part.value)
        };
    }
    ChatResponseProgressPart.from = from;
    function to(part) {
        return new types.ChatResponseProgressPart(part.content.value);
    }
    ChatResponseProgressPart.to = to;
})(ChatResponseProgressPart || (ChatResponseProgressPart = {}));
export var ChatResponseThinkingProgressPart;
(function (ChatResponseThinkingProgressPart) {
    function from(part) {
        return {
            kind: 'thinking',
            value: part.value,
            id: part.id,
            metadata: part.metadata
        };
    }
    ChatResponseThinkingProgressPart.from = from;
    function to(part) {
        return new types.ChatResponseThinkingProgressPart(part.value ?? '', part.id, part.metadata);
    }
    ChatResponseThinkingProgressPart.to = to;
})(ChatResponseThinkingProgressPart || (ChatResponseThinkingProgressPart = {}));
export var ChatResponseHookPart;
(function (ChatResponseHookPart) {
    function from(part) {
        return {
            kind: 'hook',
            hookType: part.hookType,
            stopReason: part.stopReason,
            systemMessage: part.systemMessage,
            metadata: part.metadata
        };
    }
    ChatResponseHookPart.from = from;
    function to(part) {
        return new types.ChatResponseHookPart(part.hookType, part.stopReason, part.systemMessage, part.metadata);
    }
    ChatResponseHookPart.to = to;
})(ChatResponseHookPart || (ChatResponseHookPart = {}));
export var ChatResponseWarningPart;
(function (ChatResponseWarningPart) {
    function from(part) {
        return {
            kind: 'warning',
            content: MarkdownString.from(part.value)
        };
    }
    ChatResponseWarningPart.from = from;
    function to(part) {
        return new types.ChatResponseWarningPart(part.content.value);
    }
    ChatResponseWarningPart.to = to;
})(ChatResponseWarningPart || (ChatResponseWarningPart = {}));
export var ChatResponseExtensionsPart;
(function (ChatResponseExtensionsPart) {
    function from(part) {
        return {
            kind: 'extensions',
            extensions: part.extensions
        };
    }
    ChatResponseExtensionsPart.from = from;
})(ChatResponseExtensionsPart || (ChatResponseExtensionsPart = {}));
export var ChatResponsePullRequestPart;
(function (ChatResponsePullRequestPart) {
    function from(part, commandsConverter, commandDisposables) {
        // If the command isn't in the converter, then this session may have been restored, and the command args don't exist anymore
        let command;
        if (!part.command) {
            if (!part.uri) {
                throw new Error('Pull request part must have a command if URI is provided');
            }
            command = {
                title: 'Open Pull Request',
                id: 'vscode.open',
                arguments: [part.uri]
            };
        }
        else {
            command = commandsConverter.toInternal(part.command, commandDisposables);
        }
        return {
            kind: 'pullRequest',
            author: part.author,
            title: part.title,
            description: part.description,
            uri: part.uri,
            linkTag: part.linkTag,
            command
        };
    }
    ChatResponsePullRequestPart.from = from;
})(ChatResponsePullRequestPart || (ChatResponsePullRequestPart = {}));
export var ChatResponseMovePart;
(function (ChatResponseMovePart) {
    function from(part) {
        return {
            kind: 'move',
            uri: part.uri,
            range: Range.from(part.range),
        };
    }
    ChatResponseMovePart.from = from;
    function to(part) {
        return new types.ChatResponseMovePart(URI.revive(part.uri), Range.to(part.range));
    }
    ChatResponseMovePart.to = to;
})(ChatResponseMovePart || (ChatResponseMovePart = {}));
export var ChatToolInvocationPart;
(function (ChatToolInvocationPart) {
    function from(part) {
        // Check if toolSpecificData is ChatMcpToolInvocationData (has input and output)
        // If so, convert to resultDetails for rendering via ChatInputOutputMarkdownProgressPart
        let resultDetails;
        let toolSpecificData;
        if (part.toolSpecificData && isChatMcpToolInvocationData(part.toolSpecificData)) {
            // Convert ChatMcpToolInvocationData to IToolResultInputOutputDetails
            resultDetails = convertMcpToResultDetails(part.toolSpecificData, part.isError);
            toolSpecificData = undefined; // MCP data goes to resultDetails, not toolSpecificData
        }
        else {
            toolSpecificData = part.toolSpecificData ? convertToolSpecificData(part.toolSpecificData) : undefined;
        }
        const presentation = part.presentation === 'hidden'
            ? ToolInvocationPresentation.Hidden
            : part.presentation === 'hiddenAfterComplete'
                ? ToolInvocationPresentation.HiddenAfterComplete
                : undefined;
        // When isComplete is explicitly set (not undefined), use the update DTO to enable
        // live tool invocation updates. Extensions can push with isComplete: false to start
        // an in-progress invocation, then push again with isComplete: true to complete it.
        if (part.enablePartialUpdate) {
            return {
                kind: 'externalToolInvocationUpdate',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                isComplete: !!part.isComplete,
                invocationMessage: part.invocationMessage ? MarkdownString.from(part.invocationMessage) : undefined,
                pastTenseMessage: part.pastTenseMessage ? MarkdownString.from(part.pastTenseMessage) : undefined,
                toolSpecificData,
                subagentInvocationId: part.subAgentInvocationId,
                resultDetails
            };
        }
        // Convert extension API ChatToolInvocationPart to internal serialized format (legacy path)
        return {
            kind: 'toolInvocationSerialized',
            toolCallId: part.toolCallId,
            toolId: part.toolName,
            invocationMessage: part.invocationMessage ? MarkdownString.from(part.invocationMessage) : part.toolName,
            originMessage: part.originMessage ? MarkdownString.from(part.originMessage) : undefined,
            pastTenseMessage: part.pastTenseMessage ? MarkdownString.from(part.pastTenseMessage) : undefined,
            isConfirmed: part.isConfirmed,
            isComplete: true,
            source: ToolDataSource.External,
            // isError: part.isError ?? false,
            toolSpecificData,
            resultDetails,
            presentation,
            subAgentInvocationId: part.subAgentInvocationId
        };
    }
    ChatToolInvocationPart.from = from;
    function isChatMcpToolInvocationData(data) {
        return data !== null && typeof data === 'object' &&
            'input' in data && typeof data.input === 'string' &&
            'output' in data && Array.isArray(data.output);
    }
    function convertMcpToResultDetails(data, isError) {
        return {
            input: data.input,
            output: data.output.map((o) => {
                const isText = o.mimeType.startsWith('text/');
                return {
                    type: 'embed',
                    mimeType: o.mimeType,
                    value: isText ? VSBuffer.wrap(o.data).toString() : encodeBase64(VSBuffer.wrap(o.data)),
                    isText: isText,
                };
            }),
            isError: isError ?? false,
        };
    }
    function convertToolSpecificData(data) {
        // Convert extension API terminal tool data to internal format
        if ('command' in data && 'language' in data) {
            return {
                kind: 'terminal',
                command: data.command,
                language: data.language
            };
        }
        else if ('commandLine' in data && 'language' in data) {
            const presentationOverrides = data.presentationOverrides && typeof data.presentationOverrides.commandLine === 'string' ? {
                commandLine: data.presentationOverrides.commandLine,
                language: data.presentationOverrides.language
            } : undefined;
            const result = {
                kind: 'terminal',
                presentationOverrides,
                commandLine: data.commandLine,
                language: data.language,
                terminalCommandOutput: typeof data.output?.text === 'string' ? {
                    text: data.output.text,
                } : undefined,
                terminalCommandState: data.state ? {
                    exitCode: data.state.exitCode,
                    duration: data.state.duration,
                } : undefined,
            };
            return result;
        }
        else if ('todoList' in data && Array.isArray(data.todoList)) {
            // Convert extension API todo tool data to internal format
            return {
                kind: 'todoList',
                todoList: data.todoList.map((todo) => ({
                    id: String(todo.id),
                    title: todo.title,
                    status: todoStatusEnumToString(todo.status)
                }))
            };
        }
        else if ('input' in data && 'output' in data && !Array.isArray(data.output)) {
            // Convert extension API simple tool invocation data to internal format
            return {
                kind: 'simpleToolInvocation',
                input: typeof data.input === 'string' ? data.input : '',
                output: typeof data.output === 'string' ? data.output : ''
            };
        }
        else if (data && 'values' in data && Array.isArray(data.values)) {
            // Convert extension API resources tool data to internal format
            return {
                kind: 'resources',
                values: data.values.map((v) => {
                    if (v instanceof types.Location) {
                        return Location.from(v);
                    }
                    else {
                        return URI.revive(v);
                    }
                })
            };
        }
        else if (data instanceof types.ChatSubagentToolInvocationData) {
            // Convert extension API subagent tool data to internal format
            return {
                kind: 'subagent',
                description: data.description,
                agentName: data.agentName,
                prompt: data.prompt,
                result: data.result,
            };
        }
        return data;
    }
    function todoStatusEnumToString(status) {
        // Handle enum values
        switch (status) {
            case types.ChatTodoStatus.NotStarted:
                return 'not-started';
            case types.ChatTodoStatus.InProgress:
                return 'in-progress';
            case types.ChatTodoStatus.Completed:
                return 'completed';
            default:
                return 'not-started';
        }
    }
    function todoStatusStringToEnum(status) {
        switch (status) {
            case 'not-started':
                return types.ChatTodoStatus.NotStarted;
            case 'in-progress':
                return types.ChatTodoStatus.InProgress;
            case 'completed':
                return types.ChatTodoStatus.Completed;
            default:
                return types.ChatTodoStatus.NotStarted;
        }
    }
    function to(part) {
        const toolInvocation = new types.ChatToolInvocationPart(part.toolId || part.toolName, part.toolCallId, part.errorMessage);
        if (part.invocationMessage) {
            toolInvocation.invocationMessage = part.invocationMessage;
        }
        if (part.originMessage) {
            toolInvocation.originMessage = part.originMessage;
        }
        if (part.pastTenseMessage) {
            toolInvocation.pastTenseMessage = part.pastTenseMessage;
        }
        if (part.isConfirmed !== undefined) {
            toolInvocation.isConfirmed = part.isConfirmed;
        }
        if (part.isComplete !== undefined) {
            toolInvocation.isComplete = part.isComplete;
        }
        if (part.toolSpecificData) {
            toolInvocation.toolSpecificData = convertFromInternalToolSpecificData(part.toolSpecificData);
        }
        toolInvocation.subAgentInvocationId = part.subAgentInvocationId;
        toolInvocation.subAgentName = part.subAgentName;
        return toolInvocation;
    }
    ChatToolInvocationPart.to = to;
    function convertFromInternalToolSpecificData(data) {
        // Convert internal terminal tool data to extension API format
        if (data.kind === 'terminal') {
            if (data.commandLine) {
                // New format with commandLine
                const result = {
                    commandLine: data.commandLine,
                    language: data.language
                };
                // Map internal 'terminalCommandOutput' -> extension 'output'
                if (data.terminalCommandOutput) {
                    result.output = {
                        text: data.terminalCommandOutput.text,
                        truncated: data.terminalCommandOutput.truncated,
                        lineCount: data.terminalCommandOutput.lineCount
                    };
                }
                // Map internal 'terminalCommandState' -> extension 'state'
                if (data.terminalCommandState) {
                    result.state = {
                        exitCode: data.terminalCommandState.exitCode,
                        duration: data.terminalCommandState.duration
                    };
                }
                return result;
            }
            else {
                // Legacy format with command
                return {
                    command: data.command,
                    language: data.language
                };
            }
        }
        else if (data.kind === 'terminal2') {
            return {
                commandLine: data.commandLine,
                language: data.language
            };
        }
        else if (data.kind === 'todoList') {
            // Convert internal todo tool data to extension API format
            return {
                todoList: data.todoList.map((todo, index) => {
                    const parsed = Number(todo.id);
                    const id = Number.isFinite(parsed) ? parsed : index;
                    return {
                        id,
                        title: todo.title,
                        status: todoStatusStringToEnum(todo.status)
                    };
                })
            };
        }
        return data;
    }
})(ChatToolInvocationPart || (ChatToolInvocationPart = {}));
export var ChatTask;
(function (ChatTask) {
    function from(part) {
        return {
            kind: 'progressTask',
            content: MarkdownString.from(part.value),
        };
    }
    ChatTask.from = from;
})(ChatTask || (ChatTask = {}));
export var ChatTaskResult;
(function (ChatTaskResult) {
    function from(part) {
        return {
            kind: 'progressTaskResult',
            content: typeof part === 'string' ? MarkdownString.from(part) : undefined
        };
    }
    ChatTaskResult.from = from;
})(ChatTaskResult || (ChatTaskResult = {}));
export var ChatResponseCommandButtonPart;
(function (ChatResponseCommandButtonPart) {
    function from(part, commandsConverter, commandDisposables) {
        // If the command isn't in the converter, then this session may have been restored, and the command args don't exist anymore
        const command = commandsConverter.toInternal(part.value, commandDisposables) ?? { command: part.value.command, title: part.value.title };
        return {
            kind: 'command',
            command
        };
    }
    ChatResponseCommandButtonPart.from = from;
    function to(part, commandsConverter) {
        // If the command isn't in the converter, then this session may have been restored, and the command args don't exist anymore
        return new types.ChatResponseCommandButtonPart(commandsConverter.fromInternal(part.command) ?? { command: part.command.id, title: part.command.title });
    }
    ChatResponseCommandButtonPart.to = to;
})(ChatResponseCommandButtonPart || (ChatResponseCommandButtonPart = {}));
export var ChatResponseTextEditPart;
(function (ChatResponseTextEditPart) {
    function from(part) {
        return {
            kind: 'textEdit',
            uri: part.uri,
            edits: part.edits.map(e => TextEdit.from(e)),
            done: part.isDone
        };
    }
    ChatResponseTextEditPart.from = from;
    function to(part) {
        const result = new types.ChatResponseTextEditPart(URI.revive(part.uri), part.edits.map(e => TextEdit.to(e)));
        result.isDone = part.done;
        return result;
    }
    ChatResponseTextEditPart.to = to;
})(ChatResponseTextEditPart || (ChatResponseTextEditPart = {}));
export var NotebookEdit;
(function (NotebookEdit) {
    function from(edit) {
        if (edit.newCellMetadata) {
            return {
                editType: 3 /* CellEditType.Metadata */,
                index: edit.range.start,
                metadata: edit.newCellMetadata
            };
        }
        else if (edit.newNotebookMetadata) {
            return {
                editType: 5 /* CellEditType.DocumentMetadata */,
                metadata: edit.newNotebookMetadata
            };
        }
        else {
            return {
                editType: 1 /* CellEditType.Replace */,
                index: edit.range.start,
                count: edit.range.end - edit.range.start,
                cells: edit.newCells.map(NotebookCellData.from)
            };
        }
    }
    NotebookEdit.from = from;
})(NotebookEdit || (NotebookEdit = {}));
export var ChatResponseNotebookEditPart;
(function (ChatResponseNotebookEditPart) {
    function from(part) {
        return {
            kind: 'notebookEdit',
            uri: part.uri,
            edits: part.edits.map(NotebookEdit.from),
            done: part.isDone
        };
    }
    ChatResponseNotebookEditPart.from = from;
})(ChatResponseNotebookEditPart || (ChatResponseNotebookEditPart = {}));
export var ChatResponseWorkspaceEditPart;
(function (ChatResponseWorkspaceEditPart) {
    function from(part) {
        return {
            kind: 'workspaceEdit',
            edits: part.edits.map(e => ({
                oldResource: e.oldResource,
                newResource: e.newResource,
            })),
        };
    }
    ChatResponseWorkspaceEditPart.from = from;
})(ChatResponseWorkspaceEditPart || (ChatResponseWorkspaceEditPart = {}));
export var ChatResponseReferencePart;
(function (ChatResponseReferencePart) {
    function from(part) {
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
                        Location.from(part.value.value)
                },
                iconPath,
                options: part.options
            };
        }
        return {
            kind: 'reference',
            reference: URI.isUri(part.value) || typeof part.value === 'string' ?
                part.value :
                Location.from(part.value),
            iconPath,
            options: part.options
        };
    }
    ChatResponseReferencePart.from = from;
    function to(part) {
        const value = revive(part);
        const mapValue = (value) => URI.isUri(value) ?
            value :
            Location.to(value);
        return new types.ChatResponseReferencePart(typeof value.reference === 'string' ? value.reference : 'variableName' in value.reference ? {
            variableName: value.reference.variableName,
            value: value.reference.value && mapValue(value.reference.value)
        } :
            mapValue(value.reference)); // 'value' is extended with variableName
    }
    ChatResponseReferencePart.to = to;
})(ChatResponseReferencePart || (ChatResponseReferencePart = {}));
export var ChatResponseCodeCitationPart;
(function (ChatResponseCodeCitationPart) {
    function from(part) {
        return {
            kind: 'codeCitation',
            value: part.value,
            license: part.license,
            snippet: part.snippet
        };
    }
    ChatResponseCodeCitationPart.from = from;
})(ChatResponseCodeCitationPart || (ChatResponseCodeCitationPart = {}));
export var ChatResponsePart;
(function (ChatResponsePart) {
    function from(part, commandsConverter, commandDisposables) {
        if (part instanceof types.ChatResponseMarkdownPart) {
            return ChatResponseMarkdownPart.from(part);
        }
        else if (part instanceof types.ChatResponseAnchorPart) {
            return ChatResponseAnchorPart.from(part);
        }
        else if (part instanceof types.ChatResponseReferencePart) {
            return ChatResponseReferencePart.from(part);
        }
        else if (part instanceof types.ChatResponseProgressPart) {
            return ChatResponseProgressPart.from(part);
        }
        else if (part instanceof types.ChatResponseThinkingProgressPart) {
            return ChatResponseThinkingProgressPart.from(part);
        }
        else if (part instanceof types.ChatResponseHookPart) {
            return ChatResponseHookPart.from(part);
        }
        else if (part instanceof types.ChatResponseFileTreePart) {
            return ChatResponseFilesPart.from(part);
        }
        else if (part instanceof types.ChatResponseMultiDiffPart) {
            return ChatResponseMultiDiffPart.from(part);
        }
        else if (part instanceof types.ChatResponseCommandButtonPart) {
            return ChatResponseCommandButtonPart.from(part, commandsConverter, commandDisposables);
        }
        else if (part instanceof types.ChatResponseTextEditPart) {
            return ChatResponseTextEditPart.from(part);
        }
        else if (part instanceof types.ChatResponseNotebookEditPart) {
            return ChatResponseNotebookEditPart.from(part);
        }
        else if (part instanceof types.ChatResponseMarkdownWithVulnerabilitiesPart) {
            return ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
        }
        else if (part instanceof types.ChatResponseCodeblockUriPart) {
            return ChatResponseCodeblockUriPart.from(part);
        }
        else if (part instanceof types.ChatResponseWarningPart) {
            return ChatResponseWarningPart.from(part);
        }
        else if (part instanceof types.ChatResponseConfirmationPart) {
            return ChatResponseConfirmationPart.from(part);
        }
        else if (part instanceof types.ChatResponseQuestionCarouselPart) {
            return ChatResponseQuestionCarouselPart.from(part);
        }
        else if (part instanceof types.ChatResponseCodeCitationPart) {
            return ChatResponseCodeCitationPart.from(part);
        }
        else if (part instanceof types.ChatResponseMovePart) {
            return ChatResponseMovePart.from(part);
        }
        else if (part instanceof types.ChatResponseExtensionsPart) {
            return ChatResponseExtensionsPart.from(part);
        }
        else if (part instanceof types.ChatResponsePullRequestPart) {
            return ChatResponsePullRequestPart.from(part, commandsConverter, commandDisposables);
        }
        else if (part instanceof types.ChatToolInvocationPart) {
            return ChatToolInvocationPart.from(part);
        }
        else if (part instanceof types.ChatResponseWorkspaceEditPart) {
            return ChatResponseWorkspaceEditPart.from(part);
        }
        return {
            kind: 'markdownContent',
            content: MarkdownString.from('')
        };
    }
    ChatResponsePart.from = from;
    function to(part, commandsConverter) {
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
    ChatResponsePart.to = to;
    function toContent(part, commandsConverter) {
        switch (part.kind) {
            case 'markdownContent': return ChatResponseMarkdownPart.to(part);
            case 'inlineReference': return ChatResponseAnchorPart.to(part);
            case 'progressMessage': return undefined;
            case 'treeData': return ChatResponseFilesPart.to(part);
            case 'command': return ChatResponseCommandButtonPart.to(part, commandsConverter);
        }
        return undefined;
    }
    ChatResponsePart.toContent = toContent;
})(ChatResponsePart || (ChatResponsePart = {}));
export var ChatAgentRequest;
(function (ChatAgentRequest) {
    function to(request, location2, model, modelConfiguration, diagnostics, tools, extension, logService) {
        const toolReferences = [];
        const variableReferences = [];
        for (const v of request.variables.variables) {
            if (v.kind === 'tool') {
                toolReferences.push(v);
            }
            else if (v.kind === 'toolset') {
                toolReferences.push(...v.value);
            }
            else {
                variableReferences.push(v);
            }
        }
        const sessionId = LocalChatSessionUri.parseLocalSessionId(request.sessionResource) ?? request.sessionResource.toString();
        const requestWithAllProps = {
            id: request.requestId,
            prompt: request.message,
            command: request.command,
            attempt: request.attempt ?? 0,
            enableCommandDetection: request.enableCommandDetection ?? true,
            isParticipantDetected: request.isParticipantDetected ?? false,
            sessionId,
            sessionResource: request.sessionResource,
            references: variableReferences
                .map(v => ChatPromptReference.to(v, diagnostics, logService))
                .filter(isDefined),
            toolReferences: toolReferences.map(ChatLanguageModelToolReference.to),
            location: ChatLocation.to(request.location),
            acceptedConfirmationData: request.acceptedConfirmationData,
            rejectedConfirmationData: request.rejectedConfirmationData,
            location2,
            toolInvocationToken: Object.freeze({ sessionResource: request.sessionResource }),
            tools,
            model,
            modelConfiguration,
            editedFileEvents: request.editedFileEvents,
            modeInstructions: request.modeInstructions?.content,
            modeInstructions2: ChatRequestModeInstructions.to(request.modeInstructions),
            permissionLevel: request.permissionLevel,
            subAgentInvocationId: request.subAgentInvocationId,
            subAgentName: request.subAgentName,
            parentRequestId: request.parentRequestId,
            hasHooksEnabled: request.hasHooksEnabled ?? false,
            hooks: request.hooks ? ChatRequestHooksConverter.to(request.hooks) : undefined,
            isSystemInitiated: request.isSystemInitiated,
        };
        if (!isProposedApiEnabled(extension, 'chatParticipantPrivate')) {
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.id;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.attempt;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.enableCommandDetection;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.isParticipantDetected;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.location;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.location2;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.editedFileEvents;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.sessionId;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.subAgentInvocationId;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.subAgentName;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.parentRequestId;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.hasHooksEnabled;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.hooks;
        }
        if (!isProposedApiEnabled(extension, 'chatParticipantAdditions')) {
            delete requestWithAllProps.acceptedConfirmationData;
            delete requestWithAllProps.rejectedConfirmationData;
            // eslint-disable-next-line local/code-no-any-casts
            delete requestWithAllProps.tools;
        }
        return requestWithAllProps;
    }
    ChatAgentRequest.to = to;
})(ChatAgentRequest || (ChatAgentRequest = {}));
export var ChatLocation;
(function (ChatLocation) {
    function to(loc) {
        switch (loc) {
            case ChatAgentLocation.Notebook: return types.ChatLocation.Notebook;
            case ChatAgentLocation.Terminal: return types.ChatLocation.Terminal;
            case ChatAgentLocation.Chat: return types.ChatLocation.Panel;
            case ChatAgentLocation.EditorInline: return types.ChatLocation.Editor;
        }
    }
    ChatLocation.to = to;
    function from(loc) {
        switch (loc) {
            case types.ChatLocation.Notebook: return ChatAgentLocation.Notebook;
            case types.ChatLocation.Terminal: return ChatAgentLocation.Terminal;
            case types.ChatLocation.Panel: return ChatAgentLocation.Chat;
            case types.ChatLocation.Editor: return ChatAgentLocation.EditorInline;
        }
    }
    ChatLocation.from = from;
})(ChatLocation || (ChatLocation = {}));
export var ChatSessionCustomizationType;
(function (ChatSessionCustomizationType) {
    function from(type) {
        return type.id;
    }
    ChatSessionCustomizationType.from = from;
})(ChatSessionCustomizationType || (ChatSessionCustomizationType = {}));
export var ChatPromptReference;
(function (ChatPromptReference) {
    function to(variable, diagnostics, logService) {
        let value = variable.value;
        if (!value) {
            let varStr;
            try {
                varStr = JSON.stringify(variable);
            }
            catch {
                varStr = `kind=${variable.kind}, id=${variable.id}, name=${variable.name}`;
            }
            logService.error(`[ChatPromptReference] Ignoring invalid reference in variable: ${varStr}`);
            return undefined;
        }
        if (isUriComponents(value)) {
            value = URI.revive(value);
        }
        else if (value && typeof value === 'object' && 'uri' in value && 'range' in value && isUriComponents(value.uri)) {
            value = Location.to(revive(value));
        }
        else if (isImageVariableEntry(variable)) {
            const ref = variable.references?.[0]?.reference;
            value = new types.ChatReferenceBinaryData(variable.mimeType ?? 'image/png', () => Promise.resolve(new Uint8Array(Object.values(variable.value))), ref && URI.isUri(ref) ? ref : undefined);
        }
        else if (variable.kind === 'diagnostic') {
            const filterSeverity = variable.filterSeverity && DiagnosticSeverity.to(variable.filterSeverity);
            const filterUri = variable.filterUri && URI.revive(variable.filterUri).toString();
            value = new types.ChatReferenceDiagnostic(diagnostics.map(([uri, d]) => {
                if (variable.filterUri && uri.toString() !== filterUri) {
                    return [uri, []];
                }
                return [uri, d.filter(d => {
                        if (filterSeverity && d.severity > filterSeverity) {
                            return false;
                        }
                        if (variable.filterRange && !editorRange.Range.areIntersectingOrTouching(variable.filterRange, Range.from(d.range))) {
                            return false;
                        }
                        return true;
                    })];
            }).filter(([, d]) => d.length > 0));
        }
        let toolReferences;
        if (isPromptFileVariableEntry(variable) || isPromptTextVariableEntry(variable)) {
            if (variable.toolReferences) {
                toolReferences = ChatLanguageModelToolReferences.to(variable.toolReferences);
            }
        }
        return {
            id: variable.id,
            name: variable.name,
            range: variable.range && [variable.range.start, variable.range.endExclusive],
            toolReferences,
            value,
            modelDescription: variable.modelDescription,
        };
    }
    ChatPromptReference.to = to;
})(ChatPromptReference || (ChatPromptReference = {}));
export var ChatLanguageModelToolReference;
(function (ChatLanguageModelToolReference) {
    function to(variable) {
        const value = variable.value;
        if (value) {
            throw new Error('Invalid tool reference');
        }
        return {
            name: variable.id,
            range: variable.range && [variable.range.start, variable.range.endExclusive],
        };
    }
    ChatLanguageModelToolReference.to = to;
})(ChatLanguageModelToolReference || (ChatLanguageModelToolReference = {}));
var ChatLanguageModelToolReferences;
(function (ChatLanguageModelToolReferences) {
    function to(variables) {
        const toolReferences = [];
        for (const v of variables) {
            if (v.kind === 'tool') {
                toolReferences.push(ChatLanguageModelToolReference.to(v));
            }
            else if (v.kind === 'toolset') {
                toolReferences.push(...v.value.map(ChatLanguageModelToolReference.to));
            }
            else {
                throw new Error('Invalid tool reference in prompt variables');
            }
        }
        return toolReferences;
    }
    ChatLanguageModelToolReferences.to = to;
})(ChatLanguageModelToolReferences || (ChatLanguageModelToolReferences = {}));
export var ChatRequestModeInstructions;
(function (ChatRequestModeInstructions) {
    function to(mode) {
        if (mode) {
            return {
                uri: URI.revive(mode.uri),
                name: mode.name,
                content: mode.content,
                toolReferences: ChatLanguageModelToolReferences.to(revive(mode.toolReferences)),
                metadata: mode.metadata,
                isBuiltin: mode.isBuiltin,
            };
        }
        return undefined;
    }
    ChatRequestModeInstructions.to = to;
    function from(mode) {
        if (mode) {
            return {
                uri: mode.uri,
                name: mode.name,
                content: mode.content,
                toolReferences: mode.toolReferences?.map(ref => ({
                    kind: 'tool',
                    id: ref.name,
                    name: ref.name,
                    value: undefined,
                    range: ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : undefined,
                })) ?? [],
                metadata: mode.metadata,
                isBuiltin: mode.isBuiltin,
            };
        }
        return undefined;
    }
    ChatRequestModeInstructions.from = from;
})(ChatRequestModeInstructions || (ChatRequestModeInstructions = {}));
export var ChatAgentCompletionItem;
(function (ChatAgentCompletionItem) {
    function from(item, commandsConverter, disposables) {
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
    ChatAgentCompletionItem.from = from;
})(ChatAgentCompletionItem || (ChatAgentCompletionItem = {}));
export var ChatAgentResult;
(function (ChatAgentResult) {
    function to(result) {
        return {
            errorDetails: result.errorDetails,
            metadata: reviveMetadata(result.metadata),
            nextQuestion: result.nextQuestion,
            details: result.details,
        };
    }
    ChatAgentResult.to = to;
    function from(result) {
        return {
            errorDetails: result.errorDetails,
            metadata: result.metadata,
            nextQuestion: result.nextQuestion,
            details: result.details,
        };
    }
    ChatAgentResult.from = from;
    function reviveMetadata(metadata) {
        return cloneAndChange(metadata, value => {
            if (value.$mid === 20 /* MarshalledId.LanguageModelToolResult */) {
                return new types.LanguageModelToolResult(cloneAndChange(value.content, reviveMetadata));
            }
            else if (value.$mid === 21 /* MarshalledId.LanguageModelTextPart */) {
                return new types.LanguageModelTextPart(value.value);
            }
            else if (value.$mid === 22 /* MarshalledId.LanguageModelThinkingPart */) {
                return new types.LanguageModelThinkingPart(value.value, value.id, value.metadata);
            }
            else if (value.$mid === 23 /* MarshalledId.LanguageModelPromptTsxPart */) {
                return new types.LanguageModelPromptTsxPart(value.value);
            }
            else if (value.$mid === 24 /* MarshalledId.LanguageModelDataPart */) {
                let buffer;
                // correction for old data serialized pre-303151
                if (value.data && typeof value.data === 'object' && value.data.type === 'Buffer' && Array.isArray(value.data.data)) {
                    buffer = new Uint8Array(value.data.data);
                }
                else if (typeof value.data === 'string') {
                    try {
                        buffer = decodeBase64(value.data).buffer;
                    }
                    catch {
                        buffer = new Uint8Array(0);
                    }
                }
                else {
                    buffer = new Uint8Array(0);
                }
                return new types.LanguageModelDataPart(buffer, value.mimeType, value.audience);
            }
            return undefined;
        });
    }
})(ChatAgentResult || (ChatAgentResult = {}));
export var ChatAgentUserActionEvent;
(function (ChatAgentUserActionEvent) {
    function to(result, event, commandsConverter) {
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
            const commandAction = { kind: 'command', commandButton };
            return { action: commandAction, result: ehResult };
        }
        else if (event.action.kind === 'followUp') {
            const followupAction = { kind: 'followUp', followup: ChatFollowup.to(event.action.followup) };
            return { action: followupAction, result: ehResult };
        }
        else if (event.action.kind === 'inlineChat') {
            return { action: { kind: 'editor', accepted: event.action.action === 'accepted' }, result: ehResult };
        }
        else if (event.action.kind === 'chatEditingSessionAction') {
            const outcomes = new Map([
                ['accepted', types.ChatEditingSessionActionOutcome.Accepted],
                ['rejected', types.ChatEditingSessionActionOutcome.Rejected],
                ['saved', types.ChatEditingSessionActionOutcome.Saved],
            ]);
            return {
                action: {
                    kind: 'chatEditingSessionAction',
                    outcome: outcomes.get(event.action.outcome) ?? types.ChatEditingSessionActionOutcome.Rejected,
                    uri: URI.revive(event.action.uri),
                    hasRemainingEdits: event.action.hasRemainingEdits
                }, result: ehResult
            };
        }
        else if (event.action.kind === 'chatEditingHunkAction') {
            const outcomes = new Map([
                ['accepted', types.ChatEditingSessionActionOutcome.Accepted],
                ['rejected', types.ChatEditingSessionActionOutcome.Rejected],
            ]);
            return {
                action: {
                    kind: 'chatEditingHunkAction',
                    outcome: outcomes.get(event.action.outcome) ?? types.ChatEditingSessionActionOutcome.Rejected,
                    uri: URI.revive(event.action.uri),
                    hasRemainingEdits: event.action.hasRemainingEdits,
                    lineCount: event.action.lineCount,
                    linesAdded: event.action.linesAdded,
                    linesRemoved: event.action.linesRemoved
                }, result: ehResult
            };
        }
        else {
            return { action: event.action, result: ehResult };
        }
    }
    ChatAgentUserActionEvent.to = to;
})(ChatAgentUserActionEvent || (ChatAgentUserActionEvent = {}));
export var TerminalQuickFix;
(function (TerminalQuickFix) {
    function from(quickFix, converter, disposables) {
        if ('terminalCommand' in quickFix) {
            return { terminalCommand: quickFix.terminalCommand, shouldExecute: quickFix.shouldExecute };
        }
        if ('uri' in quickFix) {
            return { uri: quickFix.uri };
        }
        return converter.toInternal(quickFix, disposables);
    }
    TerminalQuickFix.from = from;
})(TerminalQuickFix || (TerminalQuickFix = {}));
export var TerminalCompletionItemDto;
(function (TerminalCompletionItemDto) {
    function from(item) {
        return {
            ...item,
            documentation: MarkdownString.fromStrict(item.documentation),
        };
    }
    TerminalCompletionItemDto.from = from;
})(TerminalCompletionItemDto || (TerminalCompletionItemDto = {}));
export var TerminalCompletionList;
(function (TerminalCompletionList) {
    function from(completions, pathSeparator) {
        if (Array.isArray(completions)) {
            return {
                items: completions.map(i => TerminalCompletionItemDto.from(i)),
            };
        }
        return {
            items: completions.items.map(i => TerminalCompletionItemDto.from(i)),
            resourceOptions: completions.resourceOptions ? TerminalCompletionResourceOptions.from(completions.resourceOptions, pathSeparator) : undefined,
        };
    }
    TerminalCompletionList.from = from;
})(TerminalCompletionList || (TerminalCompletionList = {}));
export var TerminalCompletionResourceOptions;
(function (TerminalCompletionResourceOptions) {
    function from(resourceOptions, pathSeparator) {
        return {
            ...resourceOptions,
            pathSeparator,
            cwd: resourceOptions.cwd,
            globPattern: GlobPattern.from(resourceOptions.globPattern) ?? undefined
        };
    }
    TerminalCompletionResourceOptions.from = from;
})(TerminalCompletionResourceOptions || (TerminalCompletionResourceOptions = {}));
export var PartialAcceptInfo;
(function (PartialAcceptInfo) {
    function to(info) {
        return {
            kind: PartialAcceptTriggerKind.to(info.kind),
            acceptedLength: info.acceptedLength,
        };
    }
    PartialAcceptInfo.to = to;
})(PartialAcceptInfo || (PartialAcceptInfo = {}));
export var PartialAcceptTriggerKind;
(function (PartialAcceptTriggerKind) {
    function to(kind) {
        switch (kind) {
            case 0 /* languages.PartialAcceptTriggerKind.Word */:
                return types.PartialAcceptTriggerKind.Word;
            case 1 /* languages.PartialAcceptTriggerKind.Line */:
                return types.PartialAcceptTriggerKind.Line;
            case 2 /* languages.PartialAcceptTriggerKind.Suggest */:
                return types.PartialAcceptTriggerKind.Suggest;
            default:
                return types.PartialAcceptTriggerKind.Unknown;
        }
    }
    PartialAcceptTriggerKind.to = to;
})(PartialAcceptTriggerKind || (PartialAcceptTriggerKind = {}));
export var InlineCompletionEndOfLifeReason;
(function (InlineCompletionEndOfLifeReason) {
    function to(reason, convertFn) {
        if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Ignored) {
            const supersededBy = reason.supersededBy ? convertFn(reason.supersededBy) : undefined;
            return {
                kind: types.InlineCompletionEndOfLifeReasonKind.Ignored,
                supersededBy: supersededBy,
                userTypingDisagreed: reason.userTypingDisagreed,
            };
        }
        else if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Accepted) {
            return {
                kind: types.InlineCompletionEndOfLifeReasonKind.Accepted,
            };
        }
        return {
            kind: types.InlineCompletionEndOfLifeReasonKind.Rejected,
        };
    }
    InlineCompletionEndOfLifeReason.to = to;
})(InlineCompletionEndOfLifeReason || (InlineCompletionEndOfLifeReason = {}));
export var InlineCompletionHintStyle;
(function (InlineCompletionHintStyle) {
    function from(value) {
        if (value === types.InlineCompletionDisplayLocationKind.Label) {
            return languages.InlineCompletionHintStyle.Label;
        }
        else {
            return languages.InlineCompletionHintStyle.Code;
        }
    }
    InlineCompletionHintStyle.from = from;
    function to(kind) {
        switch (kind) {
            case languages.InlineCompletionHintStyle.Label:
                return types.InlineCompletionDisplayLocationKind.Label;
            default:
                return types.InlineCompletionDisplayLocationKind.Code;
        }
    }
    InlineCompletionHintStyle.to = to;
})(InlineCompletionHintStyle || (InlineCompletionHintStyle = {}));
export var DebugTreeItem;
(function (DebugTreeItem) {
    function from(item, id) {
        return {
            id,
            label: item.label,
            description: item.description,
            canEdit: item.canEdit,
            collapsibleState: (item.collapsibleState || 0 /* DebugTreeItemCollapsibleState.None */),
            contextValue: item.contextValue,
        };
    }
    DebugTreeItem.from = from;
})(DebugTreeItem || (DebugTreeItem = {}));
export var LanguageModelToolSource;
(function (LanguageModelToolSource) {
    function to(source) {
        if (source.type === 'mcp') {
            return new types.LanguageModelToolMCPSource(source.label, source.serverLabel || source.label, source.instructions);
        }
        else if (source.type === 'extension') {
            return new types.LanguageModelToolExtensionSource(source.extensionId.value, source.label);
        }
        else {
            return undefined;
        }
    }
    LanguageModelToolSource.to = to;
})(LanguageModelToolSource || (LanguageModelToolSource = {}));
export var LanguageModelToolResult;
(function (LanguageModelToolResult) {
    function to(result) {
        const toolResult = new types.LanguageModelToolResult(result.content.map(item => {
            if (item.kind === 'text') {
                return new types.LanguageModelTextPart(item.value, item.audience);
            }
            else if (item.kind === 'data') {
                return new types.LanguageModelDataPart(item.value.data.buffer, item.value.mimeType, item.audience);
            }
            else {
                return new types.LanguageModelPromptTsxPart(item.value);
            }
        }));
        if (result.toolMetadata !== undefined) {
            toolResult.toolMetadata = result.toolMetadata;
        }
        if (result.toolResultError) {
            toolResult.hasError = !!result.toolResultError;
        }
        return toolResult;
    }
    LanguageModelToolResult.to = to;
    function from(result, extension) {
        if (result.toolResultMessage) {
            checkProposedApiEnabled(extension, 'chatParticipantPrivate');
        }
        const checkAudienceApi = (item) => {
            if (item.audience) {
                checkProposedApiEnabled(extension, 'languageModelToolResultAudience');
            }
        };
        let hasBuffers = false;
        let detailsDto = undefined;
        if (Array.isArray(result.toolResultDetails)) {
            detailsDto = result.toolResultDetails?.map(detail => {
                return URI.isUri(detail) ? detail : Location.from(detail);
            });
        }
        else {
            if (result.toolResultDetails2) {
                detailsDto = {
                    output: {
                        type: 'data',
                        mimeType: result.toolResultDetails2.mime,
                        value: VSBuffer.wrap(result.toolResultDetails2.value),
                    }
                };
                hasBuffers = true;
            }
        }
        const dto = {
            content: result.content.map(item => {
                if (item instanceof types.LanguageModelTextPart) {
                    checkAudienceApi(item);
                    return {
                        kind: 'text',
                        value: item.value,
                        audience: item.audience
                    };
                }
                else if (item instanceof types.LanguageModelPromptTsxPart) {
                    return {
                        kind: 'promptTsx',
                        value: item.value,
                    };
                }
                else if (item instanceof types.LanguageModelDataPart) {
                    checkAudienceApi(item);
                    hasBuffers = true;
                    return {
                        kind: 'data',
                        value: {
                            mimeType: item.mimeType,
                            data: VSBuffer.wrap(item.data)
                        },
                        audience: item.audience
                    };
                }
                else {
                    throw new Error('Unknown LanguageModelToolResult part type');
                }
            }),
            toolResultMessage: MarkdownString.fromStrict(result.toolResultMessage),
            toolResultDetails: detailsDto,
            toolMetadata: result.toolMetadata,
            toolResultError: result.hasError,
        };
        return hasBuffers ? new SerializableObjectWithBuffers(dto) : dto;
    }
    LanguageModelToolResult.from = from;
})(LanguageModelToolResult || (LanguageModelToolResult = {}));
export var IconPath;
(function (IconPath) {
    function fromThemeIcon(iconPath) {
        return iconPath;
    }
    IconPath.fromThemeIcon = fromThemeIcon;
    function from(value) {
        if (!value) {
            return undefined;
        }
        else if (ThemeIcon.isThemeIcon(value)) {
            return value;
        }
        else if (URI.isUri(value)) {
            return value;
        }
        else if (typeof value === 'string') {
            return URI.file(value);
        }
        else if (typeof value === 'object' && value !== null && 'dark' in value) {
            const dark = typeof value.dark === 'string' ? URI.file(value.dark) : value.dark;
            const light = typeof value.light === 'string' ? URI.file(value.light) : value.light;
            return !dark ? undefined : { dark, light: light ?? dark };
        }
        else {
            return undefined;
        }
    }
    IconPath.from = from;
    function to(value) {
        if (!value) {
            return undefined;
        }
        else if (ThemeIcon.isThemeIcon(value)) {
            return value;
        }
        else if (isUriComponents(value)) {
            return URI.revive(value);
        }
        else {
            const icon = value;
            return {
                light: URI.revive(icon.light),
                dark: URI.revive(icon.dark)
            };
        }
    }
    IconPath.to = to;
})(IconPath || (IconPath = {}));
export var AiSettingsSearch;
(function (AiSettingsSearch) {
    function fromSettingsSearchResult(result) {
        return {
            query: result.query,
            kind: fromSettingsSearchResultKind(result.kind),
            settings: result.settings
        };
    }
    AiSettingsSearch.fromSettingsSearchResult = fromSettingsSearchResult;
    function fromSettingsSearchResultKind(kind) {
        switch (kind) {
            case AiSettingsSearchResultKind.EMBEDDED:
                return AiSettingsSearchResultKind.EMBEDDED;
            case AiSettingsSearchResultKind.LLM_RANKED:
                return AiSettingsSearchResultKind.LLM_RANKED;
            case AiSettingsSearchResultKind.CANCELED:
                return AiSettingsSearchResultKind.CANCELED;
            default:
                throw new Error('Unknown AiSettingsSearchResultKind');
        }
    }
})(AiSettingsSearch || (AiSettingsSearch = {}));
export var McpServerDefinition;
(function (McpServerDefinition) {
    function isHttpConfig(candidate) {
        return !!candidate.uri;
    }
    function from(item) {
        return McpServerLaunch.toSerialized(isHttpConfig(item)
            ? {
                type: 2 /* McpServerTransportType.HTTP */,
                uri: item.uri,
                headers: Object.entries(item.headers),
                authentication: item.authentication ? {
                    providerId: item.authentication.providerId,
                    scopes: item.authentication.scopes
                } : undefined,
            }
            : {
                type: 1 /* McpServerTransportType.Stdio */,
                cwd: item.cwd?.fsPath,
                args: item.args,
                command: item.command,
                env: item.env,
                envFile: undefined,
                sandbox: undefined
            });
    }
    McpServerDefinition.from = from;
    /** Converts from the IPC DTO to the API type. */
    function to(dto) {
        const launch = McpServerLaunch.fromSerialized(dto.launch);
        if (launch.type === 2 /* McpServerTransportType.HTTP */) {
            return new types.McpHttpServerDefinition(dto.label, launch.uri, Object.fromEntries(launch.headers), dto.cacheNonce === '$$NONE' ? undefined : dto.cacheNonce);
        }
        else {
            const result = new types.McpStdioServerDefinition(dto.label, launch.command, [...launch.args], Object.fromEntries(Object.entries(launch.env).map(([key, value]) => [key, value === null ? null : String(value)])), dto.cacheNonce === '$$NONE' ? undefined : dto.cacheNonce);
            if (launch.cwd) {
                result.cwd = URI.file(launch.cwd);
            }
            return result;
        }
    }
    McpServerDefinition.to = to;
})(McpServerDefinition || (McpServerDefinition = {}));
export var SourceControlInputBoxValidationType;
(function (SourceControlInputBoxValidationType) {
    function from(type) {
        switch (type) {
            case types.SourceControlInputBoxValidationType.Error:
                return 0 /* InputValidationType.Error */;
            case types.SourceControlInputBoxValidationType.Warning:
                return 1 /* InputValidationType.Warning */;
            case types.SourceControlInputBoxValidationType.Information:
                return 2 /* InputValidationType.Information */;
            default:
                throw new Error('Unknown SourceControlInputBoxValidationType');
        }
    }
    SourceControlInputBoxValidationType.from = from;
})(SourceControlInputBoxValidationType || (SourceControlInputBoxValidationType = {}));
export var ChatRequestHooksConverter;
(function (ChatRequestHooksConverter) {
    function to(hooks) {
        const result = {};
        for (const [hookType, commands] of Object.entries(hooks)) {
            if (!commands || commands.length === 0) {
                continue;
            }
            const converted = [];
            for (const cmd of commands) {
                const resolved = ChatHookCommand.to(cmd);
                if (resolved) {
                    converted.push(resolved);
                }
            }
            if (converted.length > 0) {
                result[hookType] = converted;
            }
        }
        return result;
    }
    ChatRequestHooksConverter.to = to;
})(ChatRequestHooksConverter || (ChatRequestHooksConverter = {}));
export var ChatHookCommand;
(function (ChatHookCommand) {
    function to(hook) {
        const command = resolveEffectiveCommand(hook, OS);
        if (!command) {
            return undefined;
        }
        return {
            command,
            cwd: hook.cwd,
            env: hook.env,
            timeout: hook.timeout,
        };
    }
    ChatHookCommand.to = to;
})(ChatHookCommand || (ChatHookCommand = {}));
export var ChatSessionItem;
(function (ChatSessionItem) {
    function convertStatus(status) {
        if (status === undefined) {
            return undefined;
        }
        switch (status) {
            case 0: // vscode.ChatSessionStatus.Failed
                return 0 /* ChatSessionStatus.Failed */;
            case 1: // vscode.ChatSessionStatus.Completed
                return 1 /* ChatSessionStatus.Completed */;
            case 2: // vscode.ChatSessionStatus.InProgress
                return 2 /* ChatSessionStatus.InProgress */;
            case 3: // vscode.ChatSessionStatus.NeedsInput
                return 3 /* ChatSessionStatus.NeedsInput */;
            default:
                return undefined;
        }
    }
    function from(sessionContent) {
        // Support both new (created, lastRequestStarted, lastRequestEnded) and old (startTime, endTime) timing properties
        const timing = sessionContent.timing;
        const created = timing?.created ?? timing?.startTime ?? 0;
        const lastRequestStarted = timing?.lastRequestStarted ?? timing?.startTime;
        const lastRequestEnded = timing?.lastRequestEnded ?? timing?.endTime;
        return {
            resource: sessionContent.resource,
            label: sessionContent.label,
            description: sessionContent.description ? MarkdownString.from(sessionContent.description) : undefined,
            badge: sessionContent.badge ? MarkdownString.from(sessionContent.badge) : undefined,
            status: convertStatus(sessionContent.status),
            archived: sessionContent.archived,
            tooltip: MarkdownString.fromStrict(sessionContent.tooltip),
            timing: {
                created,
                lastRequestStarted,
                lastRequestEnded,
            },
            changes: sessionContent.changes instanceof Array ? sessionContent.changes : undefined,
            metadata: sessionContent.metadata,
        };
    }
    ChatSessionItem.from = from;
})(ChatSessionItem || (ChatSessionItem = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXRGLE9BQU8sRUFBd0MsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUUsT0FBTyxLQUFLLFdBQVcsTUFBTSxxQ0FBcUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZFLE9BQU8sS0FBSyxNQUFNLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RCxPQUFPLEVBQW1CLHFCQUFxQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxRQUFR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LEtBQUssNkNBQXFDO1FBQ3BFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsZ0RBQXdDO1FBQzFFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssNkNBQXFDO1FBQ3BFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsaURBQXlDO1FBQzVFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sOENBQXNDO1FBQ3RFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sOENBQXNDO1FBQ3RFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsZ0RBQXdDO1FBQzFFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksNkNBQW9DO1FBQ2xFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssOENBQXFDO1FBQ3BFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsaURBQXdDO1FBQzFFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksNkNBQW9DO1FBQ2xFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsbURBQTBDO1FBQzlFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sZ0RBQXVDO1FBQ3hFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sZ0RBQXVDO1FBQ3hFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksNkNBQW9DO1FBQ2xFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssOENBQXFDO1FBQ3BFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksNkNBQW9DO1FBQ2xFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsa0RBQXlDO1FBQzVFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sK0NBQXNDO1FBQ3RFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssOENBQXFDO1FBQ3BFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsaURBQXdDO1FBQzFFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLGFBQWEsc0RBQTZDO1FBQ3BGLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssOENBQXFDO1FBQ3BFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksNkNBQW9DO0tBQ2xFLENBQUMsQ0FBQztJQUVILFNBQWdCLElBQUksQ0FBQyxJQUE4QjtRQUNsRCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlEQUF5QyxDQUFDO0lBQ2pFLENBQUM7SUFGZSx1QkFBSSxPQUVuQixDQUFBO0lBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQXlEO1FBQzNFLDhDQUFzQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDO1FBQ3RFLGdEQUF3QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDO1FBQzFFLG1EQUEyQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsV0FBVyxDQUFDO1FBQ2hGLDZDQUFxQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBQ3BFLGdEQUF3QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDO1FBQzFFLDZDQUFxQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBQ3BFLGlEQUF5QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDO1FBQzVFLDhDQUFzQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDO1FBQ3RFLDhDQUFzQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDO1FBQ3RFLGdEQUF3QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDO1FBQzFFLDZDQUFvQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDO1FBQ2xFLDhDQUFxQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBQ3BFLGlEQUF3QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDO1FBQzFFLDZDQUFvQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDO1FBQ2xFLG1EQUEwQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDO1FBQzlFLGdEQUF1QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDO1FBQ3hFLGdEQUF1QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDO1FBQ3hFLDZDQUFvQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDO1FBQ2xFLDhDQUFxQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBQ3BFLDZDQUFvQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDO1FBQ2xFLGtEQUF5QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDO1FBQzVFLCtDQUFzQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDO1FBQ3RFLDhDQUFxQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBQ3BFLGlEQUF3QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDO1FBQzFFLHNEQUE2QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsYUFBYSxDQUFDO1FBQ3BGLDZDQUFvQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDO1FBQ2xFLDhDQUFxQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO0tBQ3BFLENBQUMsQ0FBQztJQUVILFNBQWdCLEVBQUUsQ0FBQyxJQUFrQztRQUNwRCxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQztJQUMzRCxDQUFDO0lBRmUscUJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFyRWdCLGtCQUFrQixLQUFsQixrQkFBa0IsUUFxRWxDO0FBRUQsTUFBTSxLQUFXLGNBQWMsQ0FxQzlCO0FBckNELFdBQWlCLGNBQWM7SUFFOUIsU0FBZ0IsRUFBRSxDQUFDLFVBQW9DLEVBQUUsU0FBc0M7UUFFOUYsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUM7UUFDMUMsTUFBTSxDQUFDLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxhQUFhLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUM7UUFDdkosTUFBTSxDQUFDLFFBQVEsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDO1FBQ3RDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQztRQUMxQyxNQUFNLENBQUMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUM7UUFDeEMsTUFBTSxDQUFDLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQztRQUV0RCxRQUFRO1FBQ1IsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNsRCxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLENBQUM7YUFBTSxJQUFJLE9BQU8sVUFBVSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqRCxNQUFNLENBQUMsS0FBSyxHQUFHLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDaEgsQ0FBQztRQUVELE1BQU0sQ0FBQyxjQUFjLEdBQUcsT0FBTyxVQUFVLENBQUMsZUFBZSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLGVBQWUsZ0VBQXdELENBQUMsQ0FBQztRQUNoTCxxQkFBcUI7UUFDckIsSUFBSSxPQUFPLFVBQVUsQ0FBQyxlQUFlLEtBQUssV0FBVyxJQUFJLFVBQVUsQ0FBQyxlQUFlLGlFQUF5RCxFQUFFLENBQUM7WUFDOUksTUFBTSxDQUFDLFVBQVUsR0FBRyxJQUFJLEtBQUssQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BFLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDO1lBQzFDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssWUFBWSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN6SCxDQUFDO1FBQ0QsSUFBSSxVQUFVLENBQUMsbUJBQW1CLElBQUksVUFBVSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqRixNQUFNLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBdUIsQ0FBQyxDQUFDLENBQUM7UUFDNUcsQ0FBQztRQUNELE1BQU0sQ0FBQyxPQUFPLEdBQUcsU0FBUyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFMUcsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBbENlLGlCQUFFLEtBa0NqQixDQUFBO0FBQ0YsQ0FBQyxFQXJDZ0IsY0FBYyxLQUFkLGNBQWMsUUFxQzlCO0FBRUQsTUFBTSxLQUFXLG9CQUFvQixDQWlCcEM7QUFqQkQsV0FBaUIsb0JBQW9CO0lBQ3BDLFNBQWdCLElBQUksQ0FBQyxJQUFnQztRQUNwRCxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xFLE1BQU0sSUFBSSxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdEMsQ0FBQztRQUVELE9BQU87WUFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsYUFBYSxFQUFFLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztTQUM1RCxDQUFDO0lBQ0gsQ0FBQztJQVRlLHlCQUFJLE9BU25CLENBQUE7SUFDRCxTQUFnQixFQUFFLENBQUMsSUFBb0M7UUFDdEQsT0FBTztZQUNOLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixhQUFhLEVBQUUsV0FBVyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhO1NBQzVILENBQUM7SUFDSCxDQUFDO0lBTGUsdUJBQUUsS0FLakIsQ0FBQTtBQUNGLENBQUMsRUFqQmdCLG9CQUFvQixLQUFwQixvQkFBb0IsUUFpQnBDO0FBRUQsTUFBTSxLQUFXLG9CQUFvQixDQW1CcEM7QUFuQkQsV0FBaUIsb0JBQW9CO0lBRXBDLFNBQWdCLElBQUksQ0FBQyxJQUFnQztRQUNwRCxPQUFPO1lBQ04sS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLGFBQWEsRUFBRSxjQUFjLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDNUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoRyxlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQWU7U0FDckMsQ0FBQztJQUNILENBQUM7SUFQZSx5QkFBSSxPQU9uQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLElBQW9DO1FBQ3RELE9BQU87WUFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsYUFBYSxFQUFFLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYTtZQUM1SCxVQUFVLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzlGLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTtTQUNyQyxDQUFDO0lBQ0gsQ0FBQztJQVBlLHVCQUFFLEtBT2pCLENBQUE7QUFDRixDQUFDLEVBbkJnQixvQkFBb0IsS0FBcEIsb0JBQW9CLFFBbUJwQztBQUVELE1BQU0sS0FBVyxhQUFhLENBaUI3QjtBQWpCRCxXQUFpQixhQUFhO0lBRTdCLFNBQWdCLElBQUksQ0FBQyxJQUF5QjtRQUM3QyxPQUFPO1lBQ04sZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlO1lBQ3JDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTtZQUNyQyxVQUFVLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1NBQ2hHLENBQUM7SUFDSCxDQUFDO0lBTmUsa0JBQUksT0FNbkIsQ0FBQTtJQUVELFNBQWdCLEVBQUUsQ0FBQyxJQUE2QjtRQUMvQyxPQUFPO1lBQ04sZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlO1lBQ3JDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTtZQUNyQyxVQUFVLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1NBQzlGLENBQUM7SUFDSCxDQUFDO0lBTmUsZ0JBQUUsS0FNakIsQ0FBQTtBQUNGLENBQUMsRUFqQmdCLGFBQWEsS0FBYixhQUFhLFFBaUI3QjtBQUVELE1BQU0sS0FBVyxTQUFTLENBY3pCO0FBZEQsV0FBaUIsU0FBUztJQUV6QixTQUFnQixFQUFFLENBQUMsU0FBcUMsRUFBRSxJQUF5QjtRQUNsRixNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQzlCLFFBQVEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUMxQixPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxFQUM5RyxJQUFJLENBQUMsSUFBSSxJQUFJLGFBQWEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUN4QyxDQUFDO1FBQ0YsR0FBRyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNsRSxHQUFHLENBQUMsT0FBTyxHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzFHLEdBQUcsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNuQyxHQUFHLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7UUFDckMsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBWGUsWUFBRSxLQVdqQixDQUFBO0FBQ0YsQ0FBQyxFQWRnQixTQUFTLEtBQVQsU0FBUyxRQWN6QjtBQUVELE1BQU0sS0FBVyxrQkFBa0IsQ0FlbEM7QUFmRCxXQUFpQixrQkFBa0I7SUFFbEMsU0FBZ0IsRUFBRSxDQUFDLFNBQXFDLEVBQUUsSUFBa0M7UUFDM0YsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxPQUFPLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDMUQsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztZQUNqQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUNoQixJQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ25CLE1BQU0sQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQVplLHFCQUFFLEtBWWpCLENBQUE7QUFDRixDQUFDLEVBZmdCLGtCQUFrQixLQUFsQixrQkFBa0IsUUFlbEM7QUFFRCxNQUFNLEtBQVcsYUFBYSxDQU83QjtBQVBELFdBQWlCLGFBQWE7SUFDN0IsU0FBZ0IsSUFBSSxDQUFDLElBQTBCO1FBQzlDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUZlLGtCQUFJLE9BRW5CLENBQUE7SUFDRCxTQUFnQixFQUFFLENBQUMsSUFBNkI7UUFDL0MsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRmUsZ0JBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFQZ0IsYUFBYSxLQUFiLGFBQWEsUUFPN0I7QUFFRCxNQUFNLEtBQVcsWUFBWSxDQXVCNUI7QUF2QkQsV0FBaUIsWUFBWTtJQUU1QixTQUFnQixJQUFJLENBQUMsSUFBeUI7UUFDN0MsT0FBTztZQUNOLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDN0IsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2hCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQU5lLGlCQUFJLE9BTW5CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsSUFBcUI7UUFDdkMsSUFBSSxNQUFNLEdBQW9CLFNBQVMsQ0FBQztRQUN4QyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQztnQkFDSixNQUFNLEdBQUcsT0FBTyxJQUFJLENBQUMsR0FBRyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxRixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxTQUFTO1lBQ1YsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzlCLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQVplLGVBQUUsS0FZakIsQ0FBQTtBQUNGLENBQUMsRUF2QmdCLFlBQVksS0FBWixZQUFZLFFBdUI1QjtBQUVELE1BQU0sS0FBVyxpQkFBaUIsQ0FtQmpDO0FBbkJELFdBQWlCLGlCQUFpQjtJQUNqQyxTQUFnQixFQUFFLENBQUMsaUJBQStDO1FBQ2pFLE1BQU0sRUFBRSxHQUFHLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hFLElBQUksaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDaEMsRUFBRSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFDRCxJQUFJLGlCQUFpQixDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDM0MsRUFBRSxDQUFDLG1CQUFtQixHQUFHLGlCQUFpQixDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNqRyxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBVGUsb0JBQUUsS0FTakIsQ0FBQTtJQUVELFNBQWdCLElBQUksQ0FBQyxpQkFBMkM7UUFDL0QsT0FBTztZQUNOLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxLQUFLO1lBQzlCLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDNUYsbUJBQW1CLEVBQUUsaUJBQWlCLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUNqSixDQUFDO0lBQ0gsQ0FBQztJQU5lLHNCQUFJLE9BTW5CLENBQUE7QUFDRixDQUFDLEVBbkJnQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBbUJqQztBQUVELE1BQU0sS0FBVyxLQUFLLENBT3JCO0FBUEQsV0FBaUIsS0FBSztJQUNyQixTQUFnQixFQUFFLENBQUMsQ0FBbUM7UUFDckQsT0FBTyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUZlLFFBQUUsS0FFakIsQ0FBQTtJQUNELFNBQWdCLElBQUksQ0FBQyxLQUFrQjtRQUN0QyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFGZSxVQUFJLE9BRW5CLENBQUE7QUFDRixDQUFDLEVBUGdCLEtBQUssS0FBTCxLQUFLLFFBT3JCO0FBR0QsTUFBTSxLQUFXLGNBQWMsQ0FROUI7QUFSRCxXQUFpQixjQUFjO0lBQzlCLFNBQWdCLElBQUksQ0FBQyxHQUEwQjtRQUM5QyxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFDekMsQ0FBQztJQUZlLG1CQUFJLE9BRW5CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsR0FBNkI7UUFDL0MsT0FBTyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRmUsaUJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFSZ0IsY0FBYyxLQUFkLGNBQWMsUUFROUI7QUFFRCxNQUFNLEtBQVcsc0JBQXNCLENBYXRDO0FBYkQsV0FBaUIsc0JBQXNCO0lBRXRDLFNBQWdCLEVBQUUsQ0FBQyxNQUFrQjtRQUNwQyxRQUFRLE1BQU0sRUFBRSxDQUFDO1lBQ2hCO2dCQUNDLE9BQU8sS0FBSyxDQUFDLHNCQUFzQixDQUFDLFVBQVUsQ0FBQztZQUNoRDtnQkFDQyxPQUFPLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUM7WUFDNUMscUNBQTZCO1lBQzdCO2dCQUNDLE9BQU8sS0FBSyxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztRQUMvQyxDQUFDO0lBQ0YsQ0FBQztJQVZlLHlCQUFFLEtBVWpCLENBQUE7QUFDRixDQUFDLEVBYmdCLHNCQUFzQixLQUF0QixzQkFBc0IsUUFhdEM7QUFFRCxNQUFNLEtBQVcsMEJBQTBCLENBMkIxQztBQTNCRCxXQUFpQiwwQkFBMEI7SUFDMUMsU0FBZ0IsSUFBSSxDQUFDLEtBQXdDO1FBQzVELFFBQVEsS0FBSyxFQUFFLENBQUM7WUFDZixLQUFLLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxHQUFHO2dCQUN4Qyx5Q0FBaUM7WUFDbEMsS0FBSyxLQUFLLENBQUMsMEJBQTBCLENBQUMsUUFBUTtnQkFDN0MsOENBQXNDO1lBQ3ZDLEtBQUssS0FBSyxDQUFDLDBCQUEwQixDQUFDLFFBQVE7Z0JBQzdDLDhDQUFzQztZQUN2QyxLQUFLLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLENBQUM7WUFDekM7Z0JBQ0Msd0NBQWdDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBWmUsK0JBQUksT0FZbkIsQ0FBQTtJQUNELFNBQWdCLEVBQUUsQ0FBQyxLQUE0QjtRQUM5QyxRQUFRLEtBQUssRUFBRSxDQUFDO1lBQ2Y7Z0JBQ0MsT0FBTyxLQUFLLENBQUMsMEJBQTBCLENBQUMsR0FBRyxDQUFDO1lBQzdDO2dCQUNDLE9BQU8sS0FBSyxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQztZQUNsRDtnQkFDQyxPQUFPLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUM7WUFDbEQsc0NBQThCO1lBQzlCO2dCQUNDLE9BQU8sS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQztRQUM3QyxDQUFDO0lBQ0YsQ0FBQztJQVplLDZCQUFFLEtBWWpCLENBQUE7QUFDRixDQUFDLEVBM0JnQiwwQkFBMEIsS0FBMUIsMEJBQTBCLFFBMkIxQztBQUVELE1BQU0sS0FBVyxTQUFTLENBbUJ6QjtBQW5CRCxXQUFpQixTQUFTO0lBRXpCLFNBQWdCLElBQUksQ0FBQyxHQUFxQjtRQUN6QyxJQUFJLEdBQUcsS0FBSyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xDLHNDQUE4QjtRQUMvQixDQUFDO2FBQU0sSUFBSSxHQUFHLEtBQUssS0FBSyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2QyxvQ0FBNEI7UUFDN0IsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFQZSxjQUFJLE9BT25CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsR0FBc0I7UUFDeEMsSUFBSSxHQUFHLG1DQUEyQixFQUFFLENBQUM7WUFDcEMsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQztRQUM3QixDQUFDO2FBQU0sSUFBSSxHQUFHLGlDQUF5QixFQUFFLENBQUM7WUFDekMsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUMzQixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQVBlLFlBQUUsS0FPakIsQ0FBQTtBQUNGLENBQUMsRUFuQmdCLFNBQVMsS0FBVCxTQUFTLFFBbUJ6QjtBQUVELE1BQU0sS0FBVyxnQkFBZ0IsQ0FhaEM7QUFiRCxXQUFpQixnQkFBZ0I7SUFDaEMsU0FBZ0IsSUFBSSxDQUFDLEdBQWlEO1FBQ3JFLElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDN0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ25CLENBQUM7UUFFRCxRQUFRLEdBQUcsRUFBRSxDQUFDO1lBQ2IsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsd0NBQWdDO1lBQzNFLEtBQUssS0FBSyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDLDRDQUFtQztZQUN2RSxLQUFLLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQyxrREFBeUM7UUFDcEYsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBWGUscUJBQUksT0FXbkIsQ0FBQTtBQUNGLENBQUMsRUFiZ0IsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQWFoQztBQUVELE1BQU0sS0FBVyxZQUFZLENBZTVCO0FBZkQsV0FBaUIsWUFBWTtJQUM1QixTQUFnQixJQUFJLENBQUMsQ0FBc0I7UUFDMUMsTUFBTSxLQUFLLEdBQTJCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzdFLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1osS0FBSyxDQUFDLElBQUksR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFOZSxpQkFBSSxPQU1uQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLENBQXlCO1FBQzNDLE1BQU0sS0FBSyxHQUF3QixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMxRSxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNaLEtBQUssQ0FBQyxJQUFJLEdBQUcsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBTmUsZUFBRSxLQU1qQixDQUFBO0FBQ0YsQ0FBQyxFQWZnQixZQUFZLEtBQVosWUFBWSxRQWU1QjtBQUVELE1BQU0sS0FBVyxnQkFBZ0IsQ0EyQmhDO0FBM0JELFdBQWlCLGdCQUFnQjtJQUNoQyxTQUFnQixJQUFJLENBQUMsSUFBeUM7UUFDN0QsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLFFBQVEsSUFBSSxFQUFFLENBQUM7Z0JBQ2QsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTztvQkFDbEMsT0FBTyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDO2dCQUMzQyxLQUFLLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPO29CQUNsQyxPQUFPLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUM7Z0JBQzNDLEtBQUssS0FBSyxDQUFDLGdCQUFnQixDQUFDLE1BQU07b0JBQ2pDLE9BQU8sU0FBUyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQztZQUMzQyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFaZSxxQkFBSSxPQVluQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQTRDO1FBQzlELElBQUksSUFBSSxFQUFFLENBQUM7WUFDVixRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDcEIsS0FBSyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEtBQUs7b0JBQzVDLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQztnQkFDdkMsS0FBSyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEtBQUs7b0JBQzVDLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQztnQkFDdkMsS0FBSyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEtBQUs7b0JBQzNDLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQztZQUN2QyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFaZSxtQkFBRSxLQVlqQixDQUFBO0FBQ0YsQ0FBQyxFQTNCZ0IsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQTJCaEM7QUFPRCxNQUFNLEtBQVcscUJBQXFCLENBZ0JyQztBQWhCRCxXQUFpQixxQkFBcUI7SUFFckMsU0FBZ0IsSUFBSSxDQUFDLE9BQStCO1FBQ25ELElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPO2dCQUNOLE1BQU0sRUFBRSxPQUFPLE9BQU8sQ0FBQyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQzNFLFFBQVEsRUFBRSxPQUFPLENBQUMsVUFBVTtnQkFDNUIsYUFBYSxFQUFFLE9BQU8sQ0FBQyxhQUFhO2dCQUNwQyxTQUFTLEVBQUUsT0FBTyxPQUFPLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQzVGLFFBQVEsRUFBRSxPQUFPLE9BQU8sQ0FBQyxRQUFRLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVM7YUFDM0YsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBWmUsMEJBQUksT0FZbkIsQ0FBQTtBQUVGLENBQUMsRUFoQmdCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFnQnJDO0FBRUQsTUFBTSxLQUFXLFdBQVcsQ0F5RDNCO0FBekRELFdBQWlCLFdBQVc7SUFNM0IsU0FBZ0IsSUFBSSxDQUFDLE9BQThDO1FBQ2xFLElBQUksT0FBTyxZQUFZLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM5QyxPQUFPLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxPQUFPLE9BQU8sQ0FBQztRQUNoQixDQUFDO1FBRUQsa0VBQWtFO1FBQ2xFLG9FQUFvRTtRQUNwRSxvRUFBb0U7UUFDcEUsMkJBQTJCO1FBQzNCLDBEQUEwRDtRQUMxRCxJQUFJLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxJQUFJLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDOUUsT0FBTyxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUM3RixDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUMsQ0FBQyxrQ0FBa0M7SUFDbkQsQ0FBQztJQW5CZSxnQkFBSSxPQW1CbkIsQ0FBQTtJQUVELFNBQVMsc0JBQXNCLENBQUMsR0FBWTtRQUMzQyxNQUFNLEVBQUUsR0FBRyxHQUF5RSxDQUFDO1FBQ3JGLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNULE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxFQUFFLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQztJQUNoRSxDQUFDO0lBRUQsU0FBUyw0QkFBNEIsQ0FBQyxHQUFZO1FBRWpELG1FQUFtRTtRQUNuRSxzRUFBc0U7UUFDdEUsdUVBQXVFO1FBRXZFLE1BQU0sRUFBRSxHQUFHLEdBQTJELENBQUM7UUFDdkUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ1QsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTyxPQUFPLEVBQUUsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLE9BQU8sRUFBRSxDQUFDLE9BQU8sS0FBSyxRQUFRLENBQUM7SUFDdEUsQ0FBQztJQUVELFNBQWdCLEVBQUUsQ0FBQyxPQUFxRDtRQUN2RSxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sT0FBTyxDQUFDO1FBQ2hCLENBQUM7UUFFRCxPQUFPLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEYsQ0FBQztJQU5lLGNBQUUsS0FNakIsQ0FBQTtBQUNGLENBQUMsRUF6RGdCLFdBQVcsS0FBWCxXQUFXLFFBeUQzQjtBQUVELE1BQU0sS0FBVyxnQkFBZ0IsQ0F1QmhDO0FBdkJELFdBQWlCLGdCQUFnQjtJQUtoQyxTQUFnQixJQUFJLENBQUMsUUFBNkM7UUFDakUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQzthQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3BDLE9BQTBDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUQsQ0FBQzthQUFNLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDekMsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLE1BQU0sR0FBRyxRQUFpQyxDQUFDLENBQUMsbUNBQW1DO1lBQ3JGLE9BQU87Z0JBQ04sUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRO2dCQUN6QixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07Z0JBQ3JCLE9BQU8sRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxTQUFTO2dCQUN0RCxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7Z0JBQzNCLFlBQVksRUFBRSxNQUFNLENBQUMsWUFBWTthQUNqQyxDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUFqQmUscUJBQUksT0FpQm5CLENBQUE7QUFDRixDQUFDLEVBdkJnQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBdUJoQztBQUVELE1BQU0sS0FBVyxhQUFhLENBUzdCO0FBVEQsV0FBaUIsYUFBYTtJQUU3QixTQUFnQixJQUFJLENBQUMsS0FBMkI7UUFDL0MsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUZlLGtCQUFJLE9BRW5CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsS0FBaUI7UUFDbkMsT0FBTyxJQUFJLEtBQUssQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUZlLGdCQUFFLEtBRWpCLENBQUE7QUFDRixDQUFDLEVBVGdCLGFBQWEsS0FBYixhQUFhLFFBUzdCO0FBRUQsTUFBTSxLQUFXLDRCQUE0QixDQWlCNUM7QUFqQkQsV0FBaUIsNEJBQTRCO0lBQzVDLFNBQWdCLEVBQUUsQ0FBQyxJQUE0QztRQUM5RCxPQUFPO1lBQ04sTUFBTSxFQUFFLE9BQU8sSUFBSSxDQUFDLFlBQVksS0FBSyxRQUFRLElBQUksT0FBTyxJQUFJLENBQUMsVUFBVSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQzdKLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztZQUNuQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGNBQWM7U0FDNUIsQ0FBQztJQUNILENBQUM7SUFOZSwrQkFBRSxLQU1qQixDQUFBO0lBRUQsU0FBZ0IsSUFBSSxDQUFDLElBQXlDO1FBQzdELE9BQU87WUFDTixjQUFjLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDNUIsWUFBWSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsU0FBUztZQUNwQyxVQUFVLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPO1lBQ2hDLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztTQUNuQyxDQUFDO0lBQ0gsQ0FBQztJQVBlLGlDQUFJLE9BT25CLENBQUE7QUFDRixDQUFDLEVBakJnQiw0QkFBNEIsS0FBNUIsNEJBQTRCLFFBaUI1QztBQUVELE1BQU0sS0FBVyxnQkFBZ0IsQ0FvQmhDO0FBcEJELFdBQWlCLGdCQUFnQjtJQUNoQyxTQUFnQixJQUFJLENBQUMsSUFBNkI7UUFDakQsUUFBUSxJQUFJLEVBQUUsQ0FBQztZQUNkLEtBQUssS0FBSyxDQUFDLGdCQUFnQixDQUFDLE1BQU07Z0JBQ2pDLE9BQU8sU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFDbEMsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO1lBQ2pDO2dCQUNDLE9BQU8sU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7SUFSZSxxQkFBSSxPQVFuQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLElBQXdCO1FBQzFDLFFBQVEsSUFBSSxFQUFFLENBQUM7WUFDZCxLQUFLLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTTtnQkFDN0IsT0FBTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDO1lBQ3RDLEtBQUssU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDN0I7Z0JBQ0MsT0FBTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO1FBQ3JDLENBQUM7SUFDRixDQUFDO0lBUmUsbUJBQUUsS0FRakIsQ0FBQTtBQUNGLENBQUMsRUFwQmdCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFvQmhDO0FBRUQsTUFBTSxLQUFXLFlBQVksQ0F1QjVCO0FBdkJELFdBQWlCLFlBQVk7SUFFNUIsU0FBZ0IsSUFBSSxDQUFDLElBQXlCO1FBQzdDLE1BQU0sR0FBRyxHQUFvQztZQUM1QyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUM5QyxLQUFLLEVBQUUsRUFBRTtTQUNULENBQUM7UUFDRixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMvQixLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7SUFWZSxpQkFBSSxPQVVuQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLElBQXFDO1FBQ3ZELE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLFlBQVksQ0FDakMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLENBQ25DLENBQUM7UUFDRixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ25DLEdBQUcsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUM5QixDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBUmUsZUFBRSxLQVFqQixDQUFBO0FBQ0YsQ0FBQyxFQXZCZ0IsWUFBWSxLQUFaLFlBQVksUUF1QjVCO0FBRUQsTUFBTSxLQUFXLGdCQUFnQixDQXlCaEM7QUF6QkQsV0FBaUIsZ0JBQWdCO0lBRWhDLFNBQWdCLElBQUksQ0FBQyxJQUE2QjtRQUNqRCxPQUFPO1lBQ04sUUFBUSxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQzFDLFFBQVEsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUN6QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDbEIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLGdCQUFnQixFQUFFLDRCQUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLElBQUksRUFBRSxDQUFDO1lBQ2hGLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtTQUN0RSxDQUFDO0lBQ0gsQ0FBQztJQVZlLHFCQUFJLE9BVW5CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsSUFBeUM7UUFDM0QsT0FBTyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FDaEMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFDbEMsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxJQUFJLEVBQ1QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFDbEUsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUMxRixDQUFDO0lBQ0gsQ0FBQztJQVZlLG1CQUFFLEtBVWpCLENBQUE7QUFDRixDQUFDLEVBekJnQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBeUJoQztBQUVELE1BQU0sS0FBVyxzQkFBc0IsQ0FXdEM7QUFYRCxXQUFpQixzQkFBc0I7SUFDdEMsU0FBZ0IsSUFBSSxDQUFDLElBQWtDO1FBQ3RELE9BQU87WUFDTixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixVQUFVLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1NBQ3BDLENBQUM7SUFDSCxDQUFDO0lBTGUsMkJBQUksT0FLbkIsQ0FBQTtJQUVELFNBQWdCLEVBQUUsQ0FBQyxJQUEyQztRQUM3RCxPQUFPLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRmUseUJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFYZ0Isc0JBQXNCLEtBQXRCLHNCQUFzQixRQVd0QztBQUVELE1BQU0sS0FBVyxrQkFBa0IsQ0FhbEM7QUFiRCxXQUFpQixrQkFBa0I7SUFDbEMsU0FBZ0IsSUFBSSxDQUFDLE1BQWlDO1FBQ3JELE9BQU87WUFDTixRQUFRLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDbkIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQztZQUNwRCxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7U0FDekIsQ0FBQztJQUNILENBQUM7SUFOZSx1QkFBSSxPQU1uQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLE1BQXlDO1FBQzNELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFELE9BQU8sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFIZSxxQkFBRSxLQUdqQixDQUFBO0FBQ0YsQ0FBQyxFQWJnQixrQkFBa0IsS0FBbEIsa0JBQWtCLFFBYWxDO0FBR0QsTUFBTSxLQUFXLGdDQUFnQyxDQWtDaEQ7QUFsQ0QsV0FBaUIsZ0NBQWdDO0lBS2hELFNBQWdCLElBQUksQ0FBQyxPQUFxSTtRQUN6SixJQUFJLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTztnQkFDTixPQUFPLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksU0FBUztnQkFDdkQsT0FBTyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLFNBQVM7YUFDdkQsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksU0FBUyxDQUFDO0lBQy9DLENBQUM7SUFUZSxxQ0FBSSxPQVNuQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLE9BQXdLO1FBQzFMLElBQUksa0JBQWtCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxPQUFPO2dCQUNOLE9BQU8sRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7Z0JBQ3hDLE9BQU8sRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7YUFDeEMsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLFdBQVcsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQVRlLG1DQUFFLEtBU2pCLENBQUE7SUFFRCxTQUFTLGtCQUFrQixDQUFJLEdBQVE7UUFDdEMsTUFBTSxFQUFFLEdBQUcsR0FBc0QsQ0FBQztRQUNsRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDVCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxPQUFPLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3pFLENBQUM7QUFDRixDQUFDLEVBbENnQixnQ0FBZ0MsS0FBaEMsZ0NBQWdDLFFBa0NoRDtBQUVELE1BQU0sS0FBVyxxQkFBcUIsQ0FZckM7QUFaRCxXQUFpQixxQkFBcUI7SUFDckMsU0FBZ0IsSUFBSSxDQUFDLElBQXNDLEVBQUUsaUJBQTZDLEVBQUUsV0FBNEI7UUFDdkksTUFBTSxPQUFPLEdBQUcsT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDdkcsT0FBTztZQUNOLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsQ0FBQywrQ0FBdUMsQ0FBQywrQ0FBdUM7WUFDeEosT0FBTyxFQUFFLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLEVBQUUsY0FBYztZQUMzRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLHdCQUF3QjtZQUN2RCxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7U0FDdkIsQ0FBQztJQUNILENBQUM7SUFWZSwwQkFBSSxPQVVuQixDQUFBO0FBQ0YsQ0FBQyxFQVpnQixxQkFBcUIsS0FBckIscUJBQXFCLFFBWXJDO0FBRUQsTUFBTSxLQUFXLDBCQUEwQixDQVkxQztBQVpELFdBQWlCLDBCQUEwQjtJQUMxQyxTQUFnQixJQUFJLENBQUMsSUFBdUMsRUFBRSxpQkFBNkMsRUFBRSxXQUE0QjtRQUN4SSxNQUFNLE9BQU8sR0FBRyxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUV2RyxPQUFPO1lBQ04sT0FBTyxFQUFFLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDO1lBQzNELEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDN0IsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ25CLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtTQUNqQyxDQUFDO0lBQ0gsQ0FBQztJQVZlLCtCQUFJLE9BVW5CLENBQUE7QUFDRixDQUFDLEVBWmdCLDBCQUEwQixLQUExQiwwQkFBMEIsUUFZMUM7QUFFRCxNQUFNLEtBQVcsOEJBQThCLENBUzlDO0FBVEQsV0FBaUIsOEJBQThCO0lBQzlDLFNBQWdCLElBQUksQ0FBQyxPQUEwRDtRQUM5RSxPQUFPO1lBQ04sZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixJQUFJLEtBQUs7WUFDcEQscUJBQXFCLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixJQUFJLEVBQUU7WUFDM0QseUJBQXlCLEVBQUUsT0FBTyxFQUFFLHlCQUF5QixJQUFJLEVBQUU7WUFDbkUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixJQUFJLEVBQUU7U0FDdkQsQ0FBQztJQUNILENBQUM7SUFQZSxtQ0FBSSxPQU9uQixDQUFBO0FBQ0YsQ0FBQyxFQVRnQiw4QkFBOEIsS0FBOUIsOEJBQThCLFFBUzlDO0FBRUQsTUFBTSxLQUFXLHNCQUFzQixDQVd0QztBQVhELFdBQWlCLHNCQUFzQjtJQUN0QyxTQUFnQixJQUFJLENBQUMsT0FBc0M7UUFDMUQsT0FBTztZQUNOLEdBQUcsRUFBRSxPQUFPLENBQUMsR0FBRztZQUNoQixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7U0FDMUIsQ0FBQztJQUNILENBQUM7SUFMZSwyQkFBSSxPQUtuQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLE9BQTREO1FBQzlFLE9BQU8sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BGLENBQUM7SUFGZSx5QkFBRSxLQUVqQixDQUFBO0FBQ0YsQ0FBQyxFQVhnQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBV3RDO0FBRUQsTUFBTSxLQUFXLFdBQVcsQ0F5QjNCO0FBekJELFdBQWlCLFdBQVc7SUFDM0IsU0FBZ0IsSUFBSSxDQUFDLE9BQTJCO1FBQy9DLE9BQU87WUFDTixPQUFPLEVBQUUsY0FBYyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRTtZQUN6RCxJQUFJLCtCQUF1QjtZQUMzQixRQUFRLEVBQUUsT0FBTyxDQUFDLGNBQWM7WUFDaEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZO1lBQzVCLFlBQVksRUFBRSxPQUFPLENBQUMsWUFBWTtZQUNsQyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN4RyxVQUFVLEVBQUUsT0FBTyxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6QyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7Z0JBQ2QsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNqRCxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUU7YUFDeEMsQ0FBQyxDQUFDO1NBQ0gsQ0FBQztJQUNILENBQUM7SUFkZSxnQkFBSSxPQWNuQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLElBQWtDO1FBQ3BELE1BQU0sT0FBTyxHQUFHLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ3pILE9BQU8sQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUNuQyxPQUFPLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDdkMsT0FBTyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBQ3pDLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUMxRSxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBUGUsY0FBRSxLQU9qQixDQUFBO0FBQ0YsQ0FBQyxFQXpCZ0IsV0FBVyxLQUFYLFdBQVcsUUF5QjNCO0FBRUQsTUFBTSxLQUFXLE9BQU8sQ0FJdkI7QUFKRCxXQUFpQixPQUFPO0lBQ1YsaUJBQVMsR0FBRyxnQkFBZ0IsQ0FBQztJQUU3QixtQkFBVyxHQUFHLGtCQUFrQixDQUFDO0FBQy9DLENBQUMsRUFKZ0IsT0FBTyxLQUFQLE9BQU8sUUFJdkI7QUFFRCxNQUFNLEtBQVcsY0FBYyxDQVE5QjtBQVJELFdBQWlCLGNBQWM7SUFDOUIsU0FBZ0IsSUFBSSxDQUFDLElBQThCO1FBQ2xELE9BQU87WUFDTixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDL0IsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztTQUN6QyxDQUFDO0lBQ0gsQ0FBQztJQU5lLG1CQUFJLE9BTW5CLENBQUE7QUFDRixDQUFDLEVBUmdCLGNBQWMsS0FBZCxjQUFjLFFBUTlCO0FBRUQsTUFBTSxLQUFXLGtCQUFrQixDQVVsQztBQVZELFdBQWlCLGtCQUFrQjtJQUNsQyxNQUFNLG9CQUFvQixHQUErRDtRQUN4RixDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsdUNBQStCO1FBQ2xFLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxvQ0FBNEI7UUFDNUQsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLGtDQUEwQjtLQUN4RCxDQUFDO0lBRUYsU0FBZ0IsSUFBSSxDQUFDLElBQThCO1FBQ2xELE9BQU8sb0JBQW9CLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGlDQUF5QixDQUFDO0lBQzFHLENBQUM7SUFGZSx1QkFBSSxPQUVuQixDQUFBO0FBQ0YsQ0FBQyxFQVZnQixrQkFBa0IsS0FBbEIsa0JBQWtCLFFBVWxDO0FBRUQsTUFBTSxLQUFXLFFBQVEsQ0E2Q3hCO0FBN0NELFdBQWlCLFFBQVE7SUFHeEIsU0FBZ0IsSUFBSSxDQUFDLElBQXFCO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQztRQUNuRCxPQUFPO1lBQ04sS0FBSyxFQUFFLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsUUFBUSxFQUFFO1lBQzFELEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ3pCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6RCxLQUFLLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckQsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSTtZQUNyQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJO1lBQy9CLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1NBQzFFLENBQUM7SUFDSCxDQUFDO0lBYmUsYUFBSSxPQWFuQixDQUFBO0lBRUQsU0FBZ0IsT0FBTyxDQUFDLElBQTBCO1FBQ2pELE9BQU87WUFDTixNQUFNLEVBQUUsU0FBUztZQUNqQixLQUFLLEVBQUUsU0FBUztZQUNoQixFQUFFLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTztZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUN6QixJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDL0IsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pDLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLENBQUMsQ0FBQztZQUNGLFFBQVEsRUFBRTtnQkFDVCxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztnQkFDZCxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztnQkFDakIsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7Z0JBQ2xCLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztnQkFDeEIsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7Z0JBQ3BCLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO2dCQUNsQixJQUFJLEVBQUUsQ0FBQzthQUNQO1lBQ0QsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxTQUFTLENBQUM7WUFDeEMsa0JBQWtCLEVBQUUsS0FBSztZQUN6QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsSUFBSSxTQUFTO1lBQzFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLFNBQVM7U0FDcEMsQ0FBQztJQUNILENBQUM7SUExQmUsZ0JBQU8sVUEwQnRCLENBQUE7QUFDRixDQUFDLEVBN0NnQixRQUFRLEtBQVIsUUFBUSxRQTZDeEI7QUFFRCxXQUFpQixPQUFPO0lBQ3ZCLFNBQWdCLElBQUksQ0FBQyxHQUFtQjtRQUN2QyxPQUFPLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRmUsWUFBSSxPQUVuQixDQUFBO0lBRUQsU0FBZ0IsRUFBRSxDQUFDLEdBQWE7UUFDL0IsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFGZSxVQUFFLEtBRWpCLENBQUE7QUFDRixDQUFDLEVBUmdCLE9BQU8sS0FBUCxPQUFPLFFBUXZCO0FBRUQsTUFBTSxLQUFXLFdBQVcsQ0F3RDNCO0FBeERELFdBQWlCLFdBQVc7SUFDM0IsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLElBQWdELEVBQUUsTUFBa0MsRUFBeUMsRUFBRTtRQUM3SixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU8sU0FBUyxDQUFDLENBQUMsd0JBQXdCO1FBQzNDLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBOEIsQ0FBQztZQUM1QyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztZQUM5QixNQUFNO1lBQ04sVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUF3QztnQkFDakQsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO2dCQUNwQixRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVE7cUJBQ2xCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBcUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLGtDQUEwQixDQUFDO3FCQUNsRixHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQzthQUNyQixDQUFDLENBQUM7WUFDSCxRQUFRLEVBQUUsRUFBRTtTQUNaLENBQUMsQ0FBQztRQUVILElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ25CLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO2dCQUM1QyxNQUFNLENBQUMsR0FBRyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ1AsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUMsQ0FBQztJQUVGLFNBQWdCLEVBQUUsQ0FBQyxVQUFrQztRQUNwRCxNQUFNLElBQUksR0FBRyxJQUFJLHFCQUFxQixFQUE2QixDQUFDO1FBQ3BFLEtBQUssTUFBTSxJQUFJLElBQUksVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsMERBQTBEO1FBQzFELE1BQU0sS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNCLE1BQU0sS0FBSyxHQUFpRCxFQUFFLENBQUM7UUFDL0QsT0FBTyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDckIsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsR0FBRyxFQUFHLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQ2hCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2xCLENBQUM7cUJBQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQzFCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPO1lBQ04sV0FBVyxFQUFFLFVBQVUsQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1NBQ25FLENBQUM7SUFDSCxDQUFDO0lBdkJlLGNBQUUsS0F1QmpCLENBQUE7QUFDRixDQUFDLEVBeERnQixXQUFXLEtBQVgsV0FBVyxRQXdEM0I7QUFFRCxNQUFNLEtBQVcsWUFBWSxDQXFGNUI7QUFyRkQsV0FBaUIsWUFBWTtJQUM1QixTQUFTLGlCQUFpQixDQUFDLEtBQStCO1FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3ZELENBQUM7SUFFRCxTQUFTLFlBQVksQ0FBQyxRQUF3QztRQUM3RCxPQUFPLE1BQU0sSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUlELFNBQVMsVUFBVSxDQUFDLFFBQW9EO1FBQ3ZFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUFDLE9BQU8sU0FBUyxDQUFDO1FBQUMsQ0FBQztRQUNwQyxPQUFPLGVBQWUsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDakYsQ0FBQztJQUVELFNBQWdCLEVBQUUsQ0FBQyxVQUFzQztRQUN4RCxJQUFJLFVBQVUsQ0FBQyxJQUFJLGlDQUF5QixFQUFFLENBQUM7WUFDOUMsTUFBTSxRQUFRLEdBQTRCLEVBQUUsQ0FBQztZQUM3QyxJQUFJLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDekIsS0FBSyxNQUFNLE1BQU0sSUFBSSxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQzFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7d0JBQ2IsUUFBUSxFQUFFLE1BQU0sQ0FBQyxLQUFLO3dCQUN0QixRQUFRLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7d0JBQ3JDLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSztxQkFDbkIsQ0FBQyxDQUFDO2dCQUNKLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FDakMsVUFBVSxDQUFDLEtBQUssRUFDaEIsVUFBVSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFDL0IsVUFBVSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQ3JELENBQUMsQ0FBQyxLQUFLLEVBQ1AsVUFBVSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUUsRUFDdkIsQ0FBQyxDQUFDLEtBQUssQ0FDUCxDQUFDLENBQ0YsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FDbkMsVUFBVSxDQUFDLElBQUksRUFDZixVQUFVLENBQUMsS0FBSyxFQUNoQixVQUFVLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUMvQixDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUE1QmUsZUFBRSxLQTRCakIsQ0FBQTtJQUVELFNBQWdCLFdBQVcsQ0FBQyxRQUFtQztRQUM5RCxJQUFJLE9BQU8sUUFBUSxDQUFDLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxDQUFDLFFBQVEsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNwRSxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNoRSxDQUFDO1FBRUQsSUFBSSxVQUFVLElBQUksUUFBUSxFQUFFLENBQUM7WUFDNUIsT0FBTztnQkFDTixLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVE7Z0JBQ3hCLFFBQVEsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDekMsSUFBSSw4QkFBc0I7Z0JBQzFCLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU07b0JBQ2pDLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztvQkFDdkgsQ0FBQyxDQUFDLFNBQVM7YUFDWixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPO2dCQUNOLElBQUksZ0NBQXdCO2dCQUM1QixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUk7Z0JBQ25CLEtBQUssRUFBRSxRQUFRLENBQUMsUUFBUTtnQkFDeEIsUUFBUSxFQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO2FBQ3pDLENBQUM7UUFDSCxDQUFDO0lBQ0YsQ0FBQztJQXRCZSx3QkFBVyxjQXNCMUIsQ0FBQTtJQUVELFNBQWdCLFFBQVEsQ0FBQyxZQUFvQixFQUFFLEVBQVUsRUFBRSxRQUE2QjtRQUN2RixLQUFLLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDNUQsS0FBSyxDQUFDLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN6RCxLQUFLLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFOUQsT0FBTztZQUNOLEVBQUU7WUFDRixHQUFHLEVBQUUsUUFBUSxDQUFDLEdBQUc7WUFDakIsU0FBUyxFQUFFLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQztZQUN4RCxNQUFNLEVBQUUsUUFBUSxDQUFDLGNBQWMsSUFBSSxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDO1lBQzdFLFdBQVcsRUFBRSxRQUFRLENBQUMsbUJBQW1CLElBQUksaUJBQWlCLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO1lBQzVGLE9BQU8sRUFBRSxRQUFRLFlBQVksS0FBSyxDQUFDLFlBQVksSUFBSSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNqRixRQUFRLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUNwRyxDQUFDO0lBQ0gsQ0FBQztJQWRlLHFCQUFRLFdBY3ZCLENBQUE7QUFDRixDQUFDLEVBckZnQixZQUFZLEtBQVosWUFBWSxRQXFGNUI7QUFFRCxNQUFNLEtBQVcscUJBQXFCLENBV3JDO0FBWEQsV0FBaUIscUJBQXFCO0lBRXJDLFNBQWdCLEVBQUUsQ0FBQyxLQUFzQztRQUN4RCxRQUFRLEtBQUssRUFBRSxDQUFDO1lBQ2Y7Z0JBQ0MsT0FBTyxLQUFLLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDO1lBRTNDO2dCQUNDLE9BQU8sS0FBSyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQztRQUMvQyxDQUFDO0lBQ0YsQ0FBQztJQVJlLHdCQUFFLEtBUWpCLENBQUE7QUFDRixDQUFDLEVBWGdCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFXckM7QUFFRCxNQUFNLEtBQVcsaUJBQWlCLENBdUNqQztBQXZDRCxXQUFpQixpQkFBaUI7SUFFakMsU0FBZ0IsRUFBRSxDQUFDLElBQTJDO1FBQzdELE1BQU0sTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUN6QyxVQUFVLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFDeEIsSUFBSSxDQUFDLElBQUksRUFDVCxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsRUFDakIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQ3BCLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUNwQixLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FDN0IsQ0FBQztRQUVGLE1BQU0sQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUNwQyxNQUFNLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFFOUIsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBZGUsb0JBQUUsS0FjakIsQ0FBQTtJQUVELFNBQWdCLElBQUksQ0FBQyxJQUE4QixFQUFFLFNBQWtCLEVBQUUsTUFBZTtRQUV2RixTQUFTLEdBQUcsU0FBUyxJQUE4QixJQUFLLENBQUMsVUFBVSxDQUFDO1FBQ3BFLE1BQU0sR0FBRyxNQUFNLElBQThCLElBQUssQ0FBQyxPQUFPLENBQUM7UUFFM0QsSUFBSSxTQUFTLEtBQUssU0FBUyxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNyRCxNQUFNLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2pDLENBQUM7UUFFRCxPQUFPO1lBQ04sVUFBVSxFQUFFLFNBQVM7WUFDckIsT0FBTyxFQUFFLE1BQU07WUFDZixJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2hDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUU7WUFDekIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUM3QixjQUFjLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO1lBQy9DLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO1NBQ3BDLENBQUM7SUFDSCxDQUFDO0lBcEJlLHNCQUFJLE9Bb0JuQixDQUFBO0FBQ0YsQ0FBQyxFQXZDZ0IsaUJBQWlCLEtBQWpCLGlCQUFpQixRQXVDakM7QUFFRCxNQUFNLEtBQVcsU0FBUyxDQVd6QjtBQVhELFdBQWlCLFNBQVM7SUFDekIsU0FBZ0IsSUFBSSxDQUFDLEtBQW1DO1FBQ3ZELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPO1lBQ04sS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1lBQ2xCLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztTQUN0QixDQUFDO0lBQ0gsQ0FBQztJQVRlLGNBQUksT0FTbkIsQ0FBQTtBQUNGLENBQUMsRUFYZ0IsU0FBUyxLQUFULFNBQVMsUUFXekI7QUFFRCxNQUFNLEtBQVcsZ0JBQWdCLENBNERoQztBQTVERCxXQUFpQixnQkFBZ0I7SUFDaEMsU0FBZ0IsRUFBRSxDQUFDLElBQVksRUFBRSxJQUF5QyxFQUFFLGVBQW9EO1FBQy9ILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDM0IsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLE9BQU8sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQzVDLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xJLENBQUM7UUFFRCxJQUFJLElBQUksS0FBSyxLQUFLLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNoRCxPQUFPLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUM1RSxDQUFDO1FBRUQsT0FBTyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQVplLG1CQUFFLEtBWWpCLENBQUE7SUFFTSxLQUFLLFVBQVUsSUFBSSxDQUFDLElBQVksRUFBRSxJQUFpRCxFQUFFLEtBQWEsWUFBWSxFQUFFO1FBQ3RILE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTFDLElBQUksSUFBSSxLQUFLLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUM1QixPQUFPO2dCQUNOLEVBQUU7Z0JBQ0YsUUFBUSxFQUFFLFdBQVc7Z0JBQ3JCLFFBQVEsRUFBRSxTQUFTO2dCQUNuQixXQUFXLEVBQUUsZ0JBQWdCLENBQUMsV0FBVyxDQUFDO2FBQzFDLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLE9BQU87WUFDTixFQUFFO1lBQ0YsUUFBUSxFQUFFLFdBQVc7WUFDckIsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JCLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSTtnQkFDcEIsR0FBRyxFQUFFLFNBQVMsQ0FBQyxHQUFHO2dCQUNsQixFQUFFLEVBQUcsU0FBb0MsQ0FBQyxPQUFPLElBQUssU0FBK0IsQ0FBQyxFQUFFO2FBQ3hGLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDYixDQUFDO0lBQ0gsQ0FBQztJQXRCcUIscUJBQUksT0FzQnpCLENBQUE7SUFFRCxTQUFTLGdCQUFnQixDQUFDLFdBQW1CO1FBQzVDLE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDNUMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSixPQUFPLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEIsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixPQUFPO1lBQ1IsQ0FBQztZQUVELE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsU0FBUyxhQUFhLENBQUMsS0FBNEM7UUFDbEUsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDdEMsT0FBTyxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztBQUNGLENBQUMsRUE1RGdCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUE0RGhDO0FBRUQsTUFBTSxLQUFXLFlBQVksQ0F1QjVCO0FBdkJELFdBQWlCLFlBQVk7SUFDNUIsU0FBZ0IsY0FBYyxDQUFDLEtBQXNDLEVBQUUsZUFBd0Q7UUFDOUgsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFO1lBQzdDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQVUsQ0FBQztRQUMxRSxDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFMZSwyQkFBYyxpQkFLN0IsQ0FBQTtJQUVNLEtBQUssVUFBVSxJQUFJLENBQUMsWUFBaUM7UUFDM0QsTUFBTSxLQUFLLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQ2hGLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFVLENBQUM7UUFDbEUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUNsQixDQUFDO0lBTnFCLGlCQUFJLE9BTXpCLENBQUE7SUFFTSxLQUFLLFVBQVUsUUFBUSxDQUFDLFlBQTREO1FBQzFGLE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxLQUFLLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBRTtZQUNoRixPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFVLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUNsQixDQUFDO0lBTnFCLHFCQUFRLFdBTTdCLENBQUE7QUFDRixDQUFDLEVBdkJnQixZQUFZLEtBQVosWUFBWSxRQXVCNUI7QUFFRCxNQUFNLEtBQVcsWUFBWSxDQW1CNUI7QUFuQkQsV0FBaUIsWUFBWTtJQUM1QixTQUFnQixJQUFJLENBQUMsUUFBNkIsRUFBRSxPQUFzQztRQUN6RixPQUFPO1lBQ04sSUFBSSxFQUFFLE9BQU87WUFDYixPQUFPLEVBQUUsUUFBUSxDQUFDLFdBQVcsSUFBSSxPQUFPLEVBQUUsT0FBTyxJQUFJLEVBQUU7WUFDdkQsVUFBVSxFQUFFLFFBQVEsQ0FBQyxPQUFPLElBQUksT0FBTyxFQUFFLE9BQU87WUFDaEQsT0FBTyxFQUFFLFFBQVEsQ0FBQyxNQUFNO1lBQ3hCLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSztTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQVJlLGlCQUFJLE9BUW5CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsUUFBdUI7UUFDekMsT0FBTztZQUNOLE1BQU0sRUFBRSxRQUFRLENBQUMsT0FBTztZQUN4QixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7WUFDckIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxPQUFPO1lBQzdCLE9BQU8sRUFBRSxRQUFRLENBQUMsVUFBVTtTQUM1QixDQUFDO0lBQ0gsQ0FBQztJQVBlLGVBQUUsS0FPakIsQ0FBQTtBQUNGLENBQUMsRUFuQmdCLFlBQVksS0FBWixZQUFZLFFBbUI1QjtBQUVELE1BQU0sS0FBVyw0QkFBNEIsQ0FpQjVDO0FBakJELFdBQWlCLDRCQUE0QjtJQUM1QyxTQUFnQixFQUFFLENBQUMsSUFBa0M7UUFDcEQsUUFBUSxJQUFJLEVBQUUsQ0FBQztZQUNkLGdEQUF3QyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsNEJBQTRCLENBQUMsTUFBTSxDQUFDO1lBQzNGLDhDQUFzQyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsNEJBQTRCLENBQUMsSUFBSSxDQUFDO1lBQ3ZGLG1EQUEyQyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsNEJBQTRCLENBQUMsU0FBUyxDQUFDO1FBQ2xHLENBQUM7SUFDRixDQUFDO0lBTmUsK0JBQUUsS0FNakIsQ0FBQTtJQUVELFNBQWdCLElBQUksQ0FBQyxJQUF5QztRQUM3RCxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2QsS0FBSyxLQUFLLENBQUMsNEJBQTRCLENBQUMsTUFBTSxDQUFDLENBQUMsbURBQTJDO1lBQzNGLEtBQUssS0FBSyxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxDQUFDLGlEQUF5QztZQUN2RixLQUFLLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxzREFBOEM7UUFDbEcsQ0FBQztRQUNELGlEQUF5QztJQUMxQyxDQUFDO0lBUGUsaUNBQUksT0FPbkIsQ0FBQTtBQUNGLENBQUMsRUFqQmdCLDRCQUE0QixLQUE1Qiw0QkFBNEIsUUFpQjVDO0FBRUQsTUFBTSxLQUFXLHdCQUF3QixDQTZIeEM7QUE3SEQsV0FBaUIsd0JBQXdCO0lBRXhDLFNBQWdCLEVBQUUsQ0FBQyxPQUFrQztRQUNwRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN2QyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ3ZCLE9BQU8sSUFBSSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN2RCxDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxhQUFhLEVBQUUsQ0FBQztnQkFDckMsTUFBTSxPQUFPLEdBQW1GLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDM0gsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO3dCQUMxQixPQUFPLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUNuRSxDQUFDO3lCQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQzt3QkFDakMsT0FBTyxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3pFLENBQUM7eUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFlBQVksRUFBRSxDQUFDO3dCQUN2QyxPQUFPLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDekQsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLE9BQU8sU0FBUyxDQUFDLENBQUMsc0JBQXNCO29CQUN6QyxDQUFDO2dCQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osT0FBTyxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEYsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7Z0JBQ25DLE9BQU8sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDL0UsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ25FLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUNsQyxPQUFPLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDaEYsQ0FBQztZQUVELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQztRQUVoQyxNQUFNLElBQUksR0FBRyw0QkFBNEIsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNELE1BQU0sTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQy9FLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQS9CZSwyQkFBRSxLQStCakIsQ0FBQTtJQUVELFNBQWdCLElBQUksQ0FBQyxPQUF3QztRQUU1RCxNQUFNLElBQUksR0FBRyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdELE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFFMUIsSUFBSSxjQUFjLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQztRQUNyQyxJQUFJLE9BQU8sY0FBYyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3hDLGNBQWMsR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQWlDLEVBQUU7WUFDdkUsSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLDJCQUEyQixFQUFFLENBQUM7Z0JBQ3BELE9BQU87b0JBQ04sSUFBSSxFQUFFLGFBQWE7b0JBQ25CLFVBQVUsRUFBRSxDQUFDLENBQUMsTUFBTTtvQkFDcEIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTt3QkFDcEMsSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7NEJBQ2pELE9BQU87Z0NBQ04sSUFBSSxFQUFFLE1BQU07Z0NBQ1osS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO2dDQUNqQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7NkJBQ1MsQ0FBQzt3QkFDbkMsQ0FBQzs2QkFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsMEJBQTBCLEVBQUUsQ0FBQzs0QkFDN0QsT0FBTztnQ0FDTixJQUFJLEVBQUUsWUFBWTtnQ0FDbEIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLOzZCQUNvQixDQUFDO3dCQUN4QyxDQUFDOzZCQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDOzRCQUN4RCxPQUFPO2dDQUNOLElBQUksRUFBRSxNQUFNO2dDQUNaLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtnQ0FDdkIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztnQ0FDOUIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFROzZCQUNTLENBQUM7d0JBQ25DLENBQUM7NkJBQU0sQ0FBQzs0QkFDUCxzQkFBc0I7NEJBQ3RCLE9BQU8sU0FBUyxDQUFDO3dCQUNsQixDQUFDO29CQUNGLENBQUMsQ0FBQyxDQUFDO29CQUNILE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTztpQkFDbEIsQ0FBQztZQUNILENBQUM7aUJBQU0sSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQ3JELElBQUksZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3hCLE1BQU0sS0FBSyxHQUFtQzt3QkFDN0MsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUEwQzt3QkFDdEQsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztxQkFDM0IsQ0FBQztvQkFFRixPQUFPO3dCQUNOLElBQUksRUFBRSxXQUFXO3dCQUNqQixLQUFLLEVBQUUsS0FBSztxQkFDWixDQUFDO2dCQUNILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPO3dCQUNOLElBQUksRUFBRSxNQUFNO3dCQUNaLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUTt3QkFDcEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQzt3QkFDM0IsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO3FCQUNXLENBQUM7Z0JBQ2xDLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksQ0FBQyxZQUFZLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO2dCQUN6RCxPQUFPO29CQUNOLElBQUksRUFBRSxVQUFVO29CQUNoQixVQUFVLEVBQUUsQ0FBQyxDQUFDLE1BQU07b0JBQ3BCLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtvQkFDWixVQUFVLEVBQUUsQ0FBQyxDQUFDLEtBQUs7aUJBQ25CLENBQUM7WUFDSCxDQUFDO2lCQUFNLElBQUksQ0FBQyxZQUFZLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUNyRCxPQUFPO29CQUNOLElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSztpQkFDZCxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzNCLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztnQkFDekQsQ0FBQztnQkFFRCxPQUFPO29CQUNOLElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPO1lBQ04sSUFBSTtZQUNKLElBQUk7WUFDSixPQUFPO1NBQ1AsQ0FBQztJQUNILENBQUM7SUF6RmUsNkJBQUksT0F5Rm5CLENBQUE7QUFDRixDQUFDLEVBN0hnQix3QkFBd0IsS0FBeEIsd0JBQXdCLFFBNkh4QztBQUVELE1BQU0sS0FBVyx5QkFBeUIsQ0FrSXpDO0FBbElELFdBQWlCLHlCQUF5QjtJQUV6QyxTQUFnQixFQUFFLENBQUMsT0FBa0M7UUFDcEQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDdkMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUN2QixPQUFPLElBQUkscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDdkQsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7Z0JBQ3JDLE1BQU0sT0FBTyxHQUFtRixDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDbEgsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO3dCQUMxQixPQUFPLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUNuRSxDQUFDO3lCQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQzt3QkFDakMsT0FBTyxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3pFLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDekQsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztnQkFDSCxPQUFPLElBQUksS0FBSyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNoRixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxXQUFXLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMvRSxDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDOUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbkUsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ2xDLE9BQU8sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN2RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2hGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sSUFBSSxHQUFHLDRCQUE0QixDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEYsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBNUJlLDRCQUFFLEtBNEJqQixDQUFBO0lBRUQsU0FBZ0IsSUFBSSxDQUFDLE9BQXlDO1FBRTdELE1BQU0sSUFBSSxHQUFHLDRCQUE0QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0QsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUUxQixJQUFJLGNBQWMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO1FBQ3JDLElBQUksT0FBTyxjQUFjLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDeEMsY0FBYyxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUNwRSxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBaUMsRUFBRTtZQUN2RSxJQUFJLENBQUMsWUFBWSxLQUFLLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztnQkFDcEQsT0FBTztvQkFDTixJQUFJLEVBQUUsYUFBYTtvQkFDbkIsVUFBVSxFQUFFLENBQUMsQ0FBQyxNQUFNO29CQUNwQixLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO3dCQUNwQyxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQzs0QkFDakQsT0FBTztnQ0FDTixJQUFJLEVBQUUsTUFBTTtnQ0FDWixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7Z0NBQ2pCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTs2QkFDUyxDQUFDO3dCQUNuQyxDQUFDOzZCQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxDQUFDOzRCQUM3RCxPQUFPO2dDQUNOLElBQUksRUFBRSxZQUFZO2dDQUNsQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7NkJBQ29CLENBQUM7d0JBQ3hDLENBQUM7NkJBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7NEJBQ3hELE9BQU87Z0NBQ04sSUFBSSxFQUFFLE1BQU07Z0NBQ1osUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2dDQUN2QixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2dDQUM5QixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7NkJBQ1MsQ0FBQzt3QkFDbkMsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLHNCQUFzQjs0QkFDdEIsT0FBTyxTQUFTLENBQUM7d0JBQ2xCLENBQUM7b0JBQ0YsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPO2lCQUNsQixDQUFDO1lBQ0gsQ0FBQztpQkFBTSxJQUFJLENBQUMsWUFBWSxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQkFDckQsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDeEIsTUFBTSxLQUFLLEdBQW1DO3dCQUM3QyxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQTBDO3dCQUN0RCxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO3FCQUMzQixDQUFDO29CQUVGLE9BQU87d0JBQ04sSUFBSSxFQUFFLFdBQVc7d0JBQ2pCLEtBQUssRUFBRSxLQUFLO3FCQUNaLENBQUM7Z0JBQ0gsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU87d0JBQ04sSUFBSSxFQUFFLE1BQU07d0JBQ1osUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO3dCQUNwQixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO3dCQUMzQixRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVE7cUJBQ1csQ0FBQztnQkFDbEMsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLHlCQUF5QixFQUFFLENBQUM7Z0JBQ3pELE9BQU87b0JBQ04sSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLFVBQVUsRUFBRSxDQUFDLENBQUMsTUFBTTtvQkFDcEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO29CQUNaLFVBQVUsRUFBRSxDQUFDLENBQUMsS0FBSztpQkFDbkIsQ0FBQztZQUNILENBQUM7aUJBQU0sSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQ3JELE9BQU87b0JBQ04sSUFBSSxFQUFFLE1BQU07b0JBQ1osS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO2lCQUNkLENBQUM7WUFDSCxDQUFDO2lCQUFNLElBQUksQ0FBQyxZQUFZLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO2dCQUN6RCxPQUFPO29CQUNOLElBQUksRUFBRSxVQUFVO29CQUNoQixLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7b0JBQ2QsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFO29CQUNSLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUTtpQkFDcEIsQ0FBQztZQUVILENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMzQixNQUFNLElBQUksS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7Z0JBQy9ELENBQUM7Z0JBRUQsT0FBTztvQkFDTixJQUFJLEVBQUUsTUFBTTtvQkFDWixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1lBQ0gsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTztZQUNOLElBQUk7WUFDSixJQUFJO1lBQ0osT0FBTztTQUNQLENBQUM7SUFDSCxDQUFDO0lBakdlLDhCQUFJLE9BaUduQixDQUFBO0FBQ0YsQ0FBQyxFQWxJZ0IseUJBQXlCLEtBQXpCLHlCQUF5QixRQWtJekM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxJQUFpQztJQUN6RCxNQUFNLElBQUksR0FBRyxPQUFPLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDbEYsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLEtBQUssV0FBVyxDQUFDO1FBQ2pCLEtBQUssWUFBWSxDQUFDO1FBQ2xCLEtBQUssV0FBVyxDQUFDO1FBQ2pCLEtBQUssV0FBVyxDQUFDO1FBQ2pCLEtBQUssWUFBWSxDQUFDO1FBQ2xCLEtBQUssV0FBVztZQUNmLE9BQU8sSUFBSSxDQUFDO1FBQ2I7WUFDQyxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxLQUFXLHdCQUF3QixDQVV4QztBQVZELFdBQWlCLHdCQUF3QjtJQUN4QyxTQUFnQixJQUFJLENBQUMsSUFBcUM7UUFDekQsT0FBTztZQUNOLElBQUksRUFBRSxpQkFBaUI7WUFDdkIsT0FBTyxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztTQUN4QyxDQUFDO0lBQ0gsQ0FBQztJQUxlLDZCQUFJLE9BS25CLENBQUE7SUFDRCxTQUFnQixFQUFFLENBQUMsSUFBK0I7UUFDakQsT0FBTyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFGZSwyQkFBRSxLQUVqQixDQUFBO0FBQ0YsQ0FBQyxFQVZnQix3QkFBd0IsS0FBeEIsd0JBQXdCLFFBVXhDO0FBRUQsTUFBTSxLQUFXLDRCQUE0QixDQVk1QztBQVpELFdBQWlCLDRCQUE0QjtJQUM1QyxTQUFnQixJQUFJLENBQUMsSUFBeUM7UUFDN0QsT0FBTztZQUNOLElBQUksRUFBRSxjQUFjO1lBQ3BCLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSztZQUNmLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNuQixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7U0FDM0IsQ0FBQztJQUNILENBQUM7SUFQZSxpQ0FBSSxPQU9uQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQXdDO1FBQzFELE9BQU8sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUZlLCtCQUFFLEtBRWpCLENBQUE7QUFDRixDQUFDLEVBWmdCLDRCQUE0QixLQUE1Qiw0QkFBNEIsUUFZNUM7QUFFRCxNQUFNLEtBQVcsMkNBQTJDLENBVzNEO0FBWEQsV0FBaUIsMkNBQTJDO0lBQzNELFNBQWdCLElBQUksQ0FBQyxJQUF3RDtRQUM1RSxPQUFPO1lBQ04sSUFBSSxFQUFFLGNBQWM7WUFDcEIsT0FBTyxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUN4QyxlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQWU7U0FDckMsQ0FBQztJQUNILENBQUM7SUFOZSxnREFBSSxPQU1uQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQXFEO1FBQ3ZFLE9BQU8sSUFBSSxLQUFLLENBQUMsMkNBQTJDLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ3JILENBQUM7SUFGZSw4Q0FBRSxLQUVqQixDQUFBO0FBQ0YsQ0FBQyxFQVhnQiwyQ0FBMkMsS0FBM0MsMkNBQTJDLFFBVzNEO0FBRUQsTUFBTSxLQUFXLDRCQUE0QixDQVU1QztBQVZELFdBQWlCLDRCQUE0QjtJQUM1QyxTQUFnQixJQUFJLENBQUMsSUFBeUM7UUFDN0QsT0FBTztZQUNOLElBQUksRUFBRSxjQUFjO1lBQ3BCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixPQUFPLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1lBQzFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQVJlLGlDQUFJLE9BUW5CLENBQUE7QUFDRixDQUFDLEVBVmdCLDRCQUE0QixLQUE1Qiw0QkFBNEIsUUFVNUM7QUFFRCxNQUFNLEtBQVcsZ0NBQWdDLENBcURoRDtBQXJERCxXQUFpQixnQ0FBZ0M7SUFDaEQsU0FBUyxvQkFBb0IsQ0FBQyxJQUE2QjtRQUMxRCxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2QsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxNQUFNLENBQUM7WUFDaEQsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUMsT0FBTyxjQUFjLENBQUM7WUFDaEUsS0FBSyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxhQUFhLENBQUM7WUFDOUQsT0FBTyxDQUFDLENBQUMsT0FBTyxNQUFNLENBQUM7UUFDeEIsQ0FBQztJQUNGLENBQUM7SUFFRCxTQUFTLG9CQUFvQixDQUFDLElBQTZDO1FBQzFFLFFBQVEsSUFBSSxFQUFFLENBQUM7WUFDZCxLQUFLLE1BQU0sQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztZQUNoRCxLQUFLLGNBQWMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQztZQUNoRSxLQUFLLGFBQWEsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQztZQUM5RCxPQUFPLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7UUFDN0MsQ0FBQztJQUNGLENBQUM7SUFFRCxTQUFnQixJQUFJLENBQUMsSUFBNkM7UUFDakUsT0FBTztZQUNOLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDbkMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFO2dCQUNSLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUNsQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7Z0JBQ2QsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO2dCQUMvRCxPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RixZQUFZLEVBQUUsQ0FBQyxDQUFDLFlBQVk7Z0JBQzVCLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxrQkFBa0I7YUFDeEMsQ0FBQyxDQUFDO1lBQ0gsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1NBQ3pCLENBQUM7SUFDSCxDQUFDO0lBZGUscUNBQUksT0FjbkIsQ0FBQTtJQUVELFNBQWdCLEVBQUUsQ0FBQyxJQUFnQztRQUNsRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLFlBQVksQ0FDL0QsQ0FBQyxDQUFDLEVBQUUsRUFDSixvQkFBb0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQzVCLENBQUMsQ0FBQyxLQUFLLEVBQ1A7WUFDQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3JJLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQy9CLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDVixLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUs7Z0JBQ2hCLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSzthQUNoQixDQUFDLENBQUM7WUFDSCxZQUFZLEVBQUUsQ0FBQyxDQUFDLFlBQVk7WUFDNUIsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQjtTQUN4QyxDQUNELENBQUMsQ0FBQztRQUNILE9BQU8sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBakJlLG1DQUFFLEtBaUJqQixDQUFBO0FBQ0YsQ0FBQyxFQXJEZ0IsZ0NBQWdDLEtBQWhDLGdDQUFnQyxRQXFEaEQ7QUFFRCxNQUFNLEtBQVcscUJBQXFCLENBcUNyQztBQXJDRCxXQUFpQixxQkFBcUI7SUFDckMsU0FBZ0IsSUFBSSxDQUFDLElBQXFDO1FBQ3pELE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLFNBQVMsT0FBTyxDQUFDLEtBQW9DLEVBQUUsT0FBWTtZQUNsRSxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQ3ZCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDL0MsT0FBTztvQkFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2hCLEdBQUcsRUFBRSxLQUFLO29CQUNWLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQztpQkFDeEQsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU87WUFDTixJQUFJLEVBQUUsVUFBVTtZQUNoQixRQUFRLEVBQUU7Z0JBQ1QsS0FBSyxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQ3hCLEdBQUcsRUFBRSxPQUFPO2dCQUNaLFFBQVEsRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQzthQUNqQztTQUNELENBQUM7SUFDSCxDQUFDO0lBcEJlLDBCQUFJLE9Bb0JuQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQXdCO1FBQzFDLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBb0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFGLFNBQVMsT0FBTyxDQUFDLEtBQTBEO1lBQzFFLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDdkIsT0FBTztvQkFDTixJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUs7b0JBQ2hCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO2lCQUNqRCxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUM3QixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDbEUsT0FBTyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQWRlLHdCQUFFLEtBY2pCLENBQUE7QUFDRixDQUFDLEVBckNnQixxQkFBcUIsS0FBckIscUJBQXFCLFFBcUNyQztBQUVELE1BQU0sS0FBVyx5QkFBeUIsQ0EyQnpDO0FBM0JELFdBQWlCLHlCQUF5QjtJQUN6QyxTQUFnQixJQUFJLENBQUMsSUFBc0M7UUFDMUQsT0FBTztZQUNOLElBQUksRUFBRSxlQUFlO1lBQ3JCLGFBQWEsRUFBRTtnQkFDZCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7Z0JBQ2pCLFNBQVMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ25DLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztvQkFDOUIsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO29CQUM5QixXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVc7b0JBQzlCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztvQkFDbEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO2lCQUN0QixDQUFDLENBQUM7YUFDSDtZQUNELFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtTQUN2QixDQUFDO0lBQ0gsQ0FBQztJQWZlLDhCQUFJLE9BZW5CLENBQUE7SUFDRCxTQUFnQixFQUFFLENBQUMsSUFBa0M7UUFDcEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvRCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDaEYsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ2hGLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNoRixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7WUFDckIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxPQUFPO1NBQ3pCLENBQUMsQ0FBQyxDQUFDO1FBQ0osT0FBTyxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFUZSw0QkFBRSxLQVNqQixDQUFBO0FBQ0YsQ0FBQyxFQTNCZ0IseUJBQXlCLEtBQXpCLHlCQUF5QixRQTJCekM7QUFFRCxNQUFNLEtBQVcsc0JBQXNCLENBNEJ0QztBQTVCRCxXQUFpQixzQkFBc0I7SUFDdEMsU0FBZ0IsSUFBSSxDQUFDLElBQW1DO1FBQ3ZELGtFQUFrRTtRQUNsRSxNQUFNLEtBQUssR0FBRyxDQUFDLEtBQWMsRUFBdUIsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEUsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLEtBQWEsRUFBcUMsRUFBRSxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUM7UUFFbEcsT0FBTztZQUNOLElBQUksRUFBRSxpQkFBaUI7WUFDdkIsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2hCLGVBQWUsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFDakMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLO2dCQUNaLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO29CQUNoQyxDQUFDLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO29CQUNsQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1NBQzdCLENBQUM7SUFDSCxDQUFDO0lBZGUsMkJBQUksT0FjbkIsQ0FBQTtJQUVELFNBQWdCLEVBQUUsQ0FBQyxJQUFzQztRQUN4RCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQThCLElBQUksQ0FBQyxDQUFDO1FBQ3hELE9BQU8sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQ3RDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQztZQUMvQixDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWU7WUFDdkIsQ0FBQyxDQUFDLFVBQVUsSUFBSSxLQUFLLENBQUMsZUFBZTtnQkFDcEMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBNkI7Z0JBQ3ZFLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsRUFDdEMsSUFBSSxDQUFDLElBQUksQ0FDVCxDQUFDO0lBQ0gsQ0FBQztJQVZlLHlCQUFFLEtBVWpCLENBQUE7QUFDRixDQUFDLEVBNUJnQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBNEJ0QztBQUVELE1BQU0sS0FBVyx3QkFBd0IsQ0FVeEM7QUFWRCxXQUFpQix3QkFBd0I7SUFDeEMsU0FBZ0IsSUFBSSxDQUFDLElBQXFDO1FBQ3pELE9BQU87WUFDTixJQUFJLEVBQUUsaUJBQWlCO1lBQ3ZCLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7U0FDeEMsQ0FBQztJQUNILENBQUM7SUFMZSw2QkFBSSxPQUtuQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQStCO1FBQ2pELE9BQU8sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRmUsMkJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFWZ0Isd0JBQXdCLEtBQXhCLHdCQUF3QixRQVV4QztBQUVELE1BQU0sS0FBVyxnQ0FBZ0MsQ0FZaEQ7QUFaRCxXQUFpQixnQ0FBZ0M7SUFDaEQsU0FBZ0IsSUFBSSxDQUFDLElBQTZDO1FBQ2pFLE9BQU87WUFDTixJQUFJLEVBQUUsVUFBVTtZQUNoQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFO1lBQ1gsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQ3ZCLENBQUM7SUFDSCxDQUFDO0lBUGUscUNBQUksT0FPbkIsQ0FBQTtJQUNELFNBQWdCLEVBQUUsQ0FBQyxJQUE0QjtRQUM5QyxPQUFPLElBQUksS0FBSyxDQUFDLGdDQUFnQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzdGLENBQUM7SUFGZSxtQ0FBRSxLQUVqQixDQUFBO0FBQ0YsQ0FBQyxFQVpnQixnQ0FBZ0MsS0FBaEMsZ0NBQWdDLFFBWWhEO0FBRUQsTUFBTSxLQUFXLG9CQUFvQixDQWFwQztBQWJELFdBQWlCLG9CQUFvQjtJQUNwQyxTQUFnQixJQUFJLENBQUMsSUFBaUM7UUFDckQsT0FBTztZQUNOLElBQUksRUFBRSxNQUFNO1lBQ1osUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDakMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQ3ZCLENBQUM7SUFDSCxDQUFDO0lBUmUseUJBQUksT0FRbkIsQ0FBQTtJQUNELFNBQWdCLEVBQUUsQ0FBQyxJQUF3QjtRQUMxQyxPQUFPLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMxRyxDQUFDO0lBRmUsdUJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFiZ0Isb0JBQW9CLEtBQXBCLG9CQUFvQixRQWFwQztBQUVELE1BQU0sS0FBVyx1QkFBdUIsQ0FVdkM7QUFWRCxXQUFpQix1QkFBdUI7SUFDdkMsU0FBZ0IsSUFBSSxDQUFDLElBQW9DO1FBQ3hELE9BQU87WUFDTixJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7U0FDeEMsQ0FBQztJQUNILENBQUM7SUFMZSw0QkFBSSxPQUtuQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQThCO1FBQ2hELE9BQU8sSUFBSSxLQUFLLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRmUsMEJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFWZ0IsdUJBQXVCLEtBQXZCLHVCQUF1QixRQVV2QztBQUVELE1BQU0sS0FBVywwQkFBMEIsQ0FPMUM7QUFQRCxXQUFpQiwwQkFBMEI7SUFDMUMsU0FBZ0IsSUFBSSxDQUFDLElBQXVDO1FBQzNELE9BQU87WUFDTixJQUFJLEVBQUUsWUFBWTtZQUNsQixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7U0FDM0IsQ0FBQztJQUNILENBQUM7SUFMZSwrQkFBSSxPQUtuQixDQUFBO0FBQ0YsQ0FBQyxFQVBnQiwwQkFBMEIsS0FBMUIsMEJBQTBCLFFBTzFDO0FBRUQsTUFBTSxLQUFXLDJCQUEyQixDQTBCM0M7QUExQkQsV0FBaUIsMkJBQTJCO0lBQzNDLFNBQWdCLElBQUksQ0FBQyxJQUF3RixFQUFFLGlCQUFvQyxFQUFFLGtCQUFtQztRQUN2TCw0SEFBNEg7UUFDNUgsSUFBSSxPQUFvQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbkIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDZixNQUFNLElBQUksS0FBSyxDQUFDLDBEQUEwRCxDQUFDLENBQUM7WUFDN0UsQ0FBQztZQUNELE9BQU8sR0FBRztnQkFDVCxLQUFLLEVBQUUsbUJBQW1CO2dCQUMxQixFQUFFLEVBQUUsYUFBYTtnQkFDakIsU0FBUyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQzthQUNyQixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEdBQUcsaUJBQWlCLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBQ0QsT0FBTztZQUNOLElBQUksRUFBRSxhQUFhO1lBQ25CLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNuQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQzdCLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztZQUNyQixPQUFPO1NBQ1AsQ0FBQztJQUNILENBQUM7SUF4QmUsZ0NBQUksT0F3Qm5CLENBQUE7QUFDRixDQUFDLEVBMUJnQiwyQkFBMkIsS0FBM0IsMkJBQTJCLFFBMEIzQztBQUVELE1BQU0sS0FBVyxvQkFBb0IsQ0FXcEM7QUFYRCxXQUFpQixvQkFBb0I7SUFDcEMsU0FBZ0IsSUFBSSxDQUFDLElBQWlDO1FBQ3JELE9BQU87WUFDTixJQUFJLEVBQUUsTUFBTTtZQUNaLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7U0FDN0IsQ0FBQztJQUNILENBQUM7SUFOZSx5QkFBSSxPQU1uQixDQUFBO0lBQ0QsU0FBZ0IsRUFBRSxDQUFDLElBQTJCO1FBQzdDLE9BQU8sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRmUsdUJBQUUsS0FFakIsQ0FBQTtBQUNGLENBQUMsRUFYZ0Isb0JBQW9CLEtBQXBCLG9CQUFvQixRQVdwQztBQUVELE1BQU0sS0FBVyxzQkFBc0IsQ0F1UXRDO0FBdlFELFdBQWlCLHNCQUFzQjtJQUN0QyxTQUFnQixJQUFJLENBQUMsSUFBbUM7UUFDdkQsZ0ZBQWdGO1FBQ2hGLHdGQUF3RjtRQUN4RixJQUFJLGFBQXdELENBQUM7UUFDN0QsSUFBSSxnQkFBcUIsQ0FBQztRQUUxQixJQUFJLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSwyQkFBMkIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQ2pGLHFFQUFxRTtZQUNyRSxhQUFhLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvRSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsQ0FBQyx1REFBdUQ7UUFDdEYsQ0FBQzthQUFNLENBQUM7WUFDUCxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdkcsQ0FBQztRQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLEtBQUssUUFBUTtZQUNsRCxDQUFDLENBQUMsMEJBQTBCLENBQUMsTUFBTTtZQUNuQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxxQkFBcUI7Z0JBQzVDLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxtQkFBbUI7Z0JBQ2hELENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFZCxrRkFBa0Y7UUFDbEYsb0ZBQW9GO1FBQ3BGLG1GQUFtRjtRQUNuRixJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLE9BQU87Z0JBQ04sSUFBSSxFQUFFLDhCQUE4QjtnQkFDcEMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO2dCQUMzQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7Z0JBQzdCLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDbkcsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO2dCQUNoRyxnQkFBZ0I7Z0JBQ2hCLG9CQUFvQixFQUFFLElBQUksQ0FBQyxvQkFBb0I7Z0JBQy9DLGFBQWE7YUFDYixDQUFDO1FBQ0gsQ0FBQztRQUVELDJGQUEyRjtRQUMzRixPQUFPO1lBQ04sSUFBSSxFQUFFLDBCQUEwQjtZQUNoQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDM0IsTUFBTSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3JCLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVE7WUFDdkcsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3ZGLGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNoRyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDN0IsVUFBVSxFQUFFLElBQUk7WUFDaEIsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO1lBQy9CLGtDQUFrQztZQUNsQyxnQkFBZ0I7WUFDaEIsYUFBYTtZQUNiLFlBQVk7WUFDWixvQkFBb0IsRUFBRSxJQUFJLENBQUMsb0JBQW9CO1NBQy9DLENBQUM7SUFDSCxDQUFDO0lBdERlLDJCQUFJLE9Bc0RuQixDQUFBO0lBRUQsU0FBUywyQkFBMkIsQ0FBQyxJQUFTO1FBQzdDLE9BQU8sSUFBSSxLQUFLLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRO1lBQy9DLE9BQU8sSUFBSSxJQUFJLElBQUksT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVE7WUFDakQsUUFBUSxJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsU0FBUyx5QkFBeUIsQ0FBQyxJQUFzQyxFQUFFLE9BQWlCO1FBQzNGLE9BQU87WUFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQzdCLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM5QyxPQUFPO29CQUNOLElBQUksRUFBRSxPQUFnQjtvQkFDdEIsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO29CQUNwQixLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN0RixNQUFNLEVBQUUsTUFBTTtpQkFDZCxDQUFDO1lBQ0gsQ0FBQyxDQUFDO1lBQ0YsT0FBTyxFQUFFLE9BQU8sSUFBSSxLQUFLO1NBQ3pCLENBQUM7SUFDSCxDQUFDO0lBRUQsU0FBUyx1QkFBdUIsQ0FBQyxJQUFTO1FBQ3pDLDhEQUE4RDtRQUM5RCxJQUFJLFNBQVMsSUFBSSxJQUFJLElBQUksVUFBVSxJQUFJLElBQUksRUFBRSxDQUFDO1lBQzdDLE9BQU87Z0JBQ04sSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDckIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2FBQ3ZCLENBQUM7UUFDSCxDQUFDO2FBQU0sSUFBSSxhQUFhLElBQUksSUFBSSxJQUFJLFVBQVUsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUN4RCxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsSUFBSSxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDeEgsV0FBVyxFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXO2dCQUNuRCxRQUFRLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVE7YUFDN0MsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ2QsTUFBTSxNQUFNLEdBQW9DO2dCQUMvQyxJQUFJLEVBQUUsVUFBVTtnQkFDaEIscUJBQXFCO2dCQUNyQixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7Z0JBQzdCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtnQkFDdkIscUJBQXFCLEVBQUUsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUM5RCxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJO2lCQUN0QixDQUFDLENBQUMsQ0FBQyxTQUFTO2dCQUNiLG9CQUFvQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNsQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRO29CQUM3QixRQUFRLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRO2lCQUM3QixDQUFDLENBQUMsQ0FBQyxTQUFTO2FBQ2IsQ0FBQztZQUVGLE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQzthQUFNLElBQUksVUFBVSxJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQy9ELDBEQUEwRDtZQUMxRCxPQUFPO2dCQUNOLElBQUksRUFBRSxVQUFVO2dCQUNoQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQzNDLEVBQUUsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO29CQUNqQixNQUFNLEVBQUUsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztpQkFDM0MsQ0FBQyxDQUFDO2FBQ0gsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLE9BQU8sSUFBSSxJQUFJLElBQUksUUFBUSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDL0UsdUVBQXVFO1lBQ3ZFLE9BQU87Z0JBQ04sSUFBSSxFQUFFLHNCQUFzQjtnQkFDNUIsS0FBSyxFQUFFLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3ZELE1BQU0sRUFBRSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFO2FBQzFELENBQUM7UUFDSCxDQUFDO2FBQU0sSUFBSSxJQUFJLElBQUksUUFBUSxJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ25FLCtEQUErRDtZQUMvRCxPQUFPO2dCQUNOLElBQUksRUFBRSxXQUFXO2dCQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRTtvQkFDbEMsSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUNqQyxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3pCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3RCLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDO2FBQ0YsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsOEJBQThCLEVBQUUsQ0FBQztZQUNqRSw4REFBOEQ7WUFDOUQsT0FBTztnQkFDTixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO2dCQUM3QixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7Z0JBQ3pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtnQkFDbkIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO2FBQ25CLENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsU0FBUyxzQkFBc0IsQ0FBQyxNQUFxQztRQUNwRSxxQkFBcUI7UUFDckIsUUFBUSxNQUFNLEVBQUUsQ0FBQztZQUNoQixLQUFLLEtBQUssQ0FBQyxjQUFjLENBQUMsVUFBVTtnQkFDbkMsT0FBTyxhQUFhLENBQUM7WUFDdEIsS0FBSyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVU7Z0JBQ25DLE9BQU8sYUFBYSxDQUFDO1lBQ3RCLEtBQUssS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTO2dCQUNsQyxPQUFPLFdBQVcsQ0FBQztZQUNwQjtnQkFDQyxPQUFPLGFBQWEsQ0FBQztRQUN2QixDQUFDO0lBQ0YsQ0FBQztJQUVELFNBQVMsc0JBQXNCLENBQUMsTUFBYztRQUM3QyxRQUFRLE1BQU0sRUFBRSxDQUFDO1lBQ2hCLEtBQUssYUFBYTtnQkFDakIsT0FBTyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQztZQUN4QyxLQUFLLGFBQWE7Z0JBQ2pCLE9BQU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7WUFDeEMsS0FBSyxXQUFXO2dCQUNmLE9BQU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7WUFDdkM7Z0JBQ0MsT0FBTyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQztRQUN6QyxDQUFDO0lBQ0YsQ0FBQztJQUVELFNBQWdCLEVBQUUsQ0FBQyxJQUFTO1FBQzNCLE1BQU0sY0FBYyxHQUFHLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUN0RCxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQzVCLElBQUksQ0FBQyxVQUFVLEVBQ2YsSUFBSSxDQUFDLFlBQVksQ0FDakIsQ0FBQztRQUVGLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDNUIsY0FBYyxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUMzRCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEIsY0FBYyxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ25ELENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNCLGNBQWMsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7UUFDekQsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNwQyxjQUFjLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDL0MsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNuQyxjQUFjLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDN0MsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDM0IsY0FBYyxDQUFDLGdCQUFnQixHQUFHLG1DQUFtQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlGLENBQUM7UUFDRCxjQUFjLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDO1FBQ2hFLGNBQWMsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztRQUVoRCxPQUFPLGNBQWMsQ0FBQztJQUN2QixDQUFDO0lBN0JlLHlCQUFFLEtBNkJqQixDQUFBO0lBRUQsU0FBUyxtQ0FBbUMsQ0FBQyxJQUFTO1FBQ3JELDhEQUE4RDtRQUM5RCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDOUIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3RCLDhCQUE4QjtnQkFDOUIsTUFBTSxNQUFNLEdBQVE7b0JBQ25CLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztvQkFDN0IsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2lCQUN2QixDQUFDO2dCQUVGLDZEQUE2RDtnQkFDN0QsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxDQUFDLE1BQU0sR0FBRzt3QkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUk7d0JBQ3JDLFNBQVMsRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsU0FBUzt3QkFDL0MsU0FBUyxFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTO3FCQUMvQyxDQUFDO2dCQUNILENBQUM7Z0JBRUQsMkRBQTJEO2dCQUMzRCxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO29CQUMvQixNQUFNLENBQUMsS0FBSyxHQUFHO3dCQUNkLFFBQVEsRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUTt3QkFDNUMsUUFBUSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRO3FCQUM1QyxDQUFDO2dCQUNILENBQUM7Z0JBRUQsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsNkJBQTZCO2dCQUM3QixPQUFPO29CQUNOLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztvQkFDckIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2lCQUN2QixDQUFDO1lBQ0gsQ0FBQztRQUNGLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDdEMsT0FBTztnQkFDTixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7Z0JBQzdCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTthQUN2QixDQUFDO1FBQ0gsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUNyQywwREFBMEQ7WUFDMUQsT0FBTztnQkFDTixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsS0FBYSxFQUFFLEVBQUU7b0JBQ3hELE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQy9CLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO29CQUNwRCxPQUFPO3dCQUNOLEVBQUU7d0JBQ0YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixNQUFNLEVBQUUsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztxQkFDM0MsQ0FBQztnQkFDSCxDQUFDLENBQUM7YUFDRixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztBQUNGLENBQUMsRUF2UWdCLHNCQUFzQixLQUF0QixzQkFBc0IsUUF1UXRDO0FBRUQsTUFBTSxLQUFXLFFBQVEsQ0FPeEI7QUFQRCxXQUFpQixRQUFRO0lBQ3hCLFNBQWdCLElBQUksQ0FBQyxJQUFzQztRQUMxRCxPQUFPO1lBQ04sSUFBSSxFQUFFLGNBQWM7WUFDcEIsT0FBTyxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztTQUN4QyxDQUFDO0lBQ0gsQ0FBQztJQUxlLGFBQUksT0FLbkIsQ0FBQTtBQUNGLENBQUMsRUFQZ0IsUUFBUSxLQUFSLFFBQVEsUUFPeEI7QUFFRCxNQUFNLEtBQVcsY0FBYyxDQU85QjtBQVBELFdBQWlCLGNBQWM7SUFDOUIsU0FBZ0IsSUFBSSxDQUFDLElBQW1CO1FBQ3ZDLE9BQU87WUFDTixJQUFJLEVBQUUsb0JBQW9CO1lBQzFCLE9BQU8sRUFBRSxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDekUsQ0FBQztJQUNILENBQUM7SUFMZSxtQkFBSSxPQUtuQixDQUFBO0FBQ0YsQ0FBQyxFQVBnQixjQUFjLEtBQWQsY0FBYyxRQU85QjtBQUVELE1BQU0sS0FBVyw2QkFBNkIsQ0FhN0M7QUFiRCxXQUFpQiw2QkFBNkI7SUFDN0MsU0FBZ0IsSUFBSSxDQUFDLElBQTBDLEVBQUUsaUJBQW9DLEVBQUUsa0JBQW1DO1FBQ3pJLDRIQUE0SDtRQUM1SCxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3pJLE9BQU87WUFDTixJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU87U0FDUCxDQUFDO0lBQ0gsQ0FBQztJQVBlLGtDQUFJLE9BT25CLENBQUE7SUFDRCxTQUFnQixFQUFFLENBQUMsSUFBNkIsRUFBRSxpQkFBb0M7UUFDckYsNEhBQTRIO1FBQzVILE9BQU8sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ3pKLENBQUM7SUFIZSxnQ0FBRSxLQUdqQixDQUFBO0FBQ0YsQ0FBQyxFQWJnQiw2QkFBNkIsS0FBN0IsNkJBQTZCLFFBYTdDO0FBRUQsTUFBTSxLQUFXLHdCQUF3QixDQWV4QztBQWZELFdBQWlCLHdCQUF3QjtJQUN4QyxTQUFnQixJQUFJLENBQUMsSUFBcUM7UUFDekQsT0FBTztZQUNOLElBQUksRUFBRSxVQUFVO1lBQ2hCLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNO1NBQ2pCLENBQUM7SUFDSCxDQUFDO0lBUGUsNkJBQUksT0FPbkIsQ0FBQTtJQUNELFNBQWdCLEVBQUUsQ0FBQyxJQUF3QjtRQUMxQyxNQUFNLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUMxQixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFKZSwyQkFBRSxLQUlqQixDQUFBO0FBRUYsQ0FBQyxFQWZnQix3QkFBd0IsS0FBeEIsd0JBQXdCLFFBZXhDO0FBRUQsTUFBTSxLQUFXLFlBQVksQ0FzQjVCO0FBdEJELFdBQWlCLFlBQVk7SUFDNUIsU0FBZ0IsSUFBSSxDQUFDLElBQXlCO1FBQzdDLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFCLE9BQU87Z0JBQ04sUUFBUSwrQkFBdUI7Z0JBQy9CLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUs7Z0JBQ3ZCLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZTthQUM5QixDQUFDO1FBQ0gsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDckMsT0FBTztnQkFDTixRQUFRLHVDQUErQjtnQkFDdkMsUUFBUSxFQUFFLElBQUksQ0FBQyxtQkFBbUI7YUFDbEMsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTztnQkFDTixRQUFRLDhCQUFzQjtnQkFDOUIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSztnQkFDdkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSztnQkFDeEMsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQzthQUMvQyxDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUFwQmUsaUJBQUksT0FvQm5CLENBQUE7QUFDRixDQUFDLEVBdEJnQixZQUFZLEtBQVosWUFBWSxRQXNCNUI7QUFHRCxNQUFNLEtBQVcsNEJBQTRCLENBUzVDO0FBVEQsV0FBaUIsNEJBQTRCO0lBQzVDLFNBQWdCLElBQUksQ0FBQyxJQUF5QztRQUM3RCxPQUFPO1lBQ04sSUFBSSxFQUFFLGNBQWM7WUFDcEIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUM7WUFDeEMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNO1NBQ2pCLENBQUM7SUFDSCxDQUFDO0lBUGUsaUNBQUksT0FPbkIsQ0FBQTtBQUNGLENBQUMsRUFUZ0IsNEJBQTRCLEtBQTVCLDRCQUE0QixRQVM1QztBQUVELE1BQU0sS0FBVyw2QkFBNkIsQ0FVN0M7QUFWRCxXQUFpQiw2QkFBNkI7SUFDN0MsU0FBZ0IsSUFBSSxDQUFDLElBQTBDO1FBQzlELE9BQU87WUFDTixJQUFJLEVBQUUsZUFBZTtZQUNyQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQixXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVc7Z0JBQzFCLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVzthQUMxQixDQUFDLENBQUM7U0FDSCxDQUFDO0lBQ0gsQ0FBQztJQVJlLGtDQUFJLE9BUW5CLENBQUE7QUFDRixDQUFDLEVBVmdCLDZCQUE2QixLQUE3Qiw2QkFBNkIsUUFVN0M7QUFFRCxNQUFNLEtBQVcseUJBQXlCLENBNkN6QztBQTdDRCxXQUFpQix5QkFBeUI7SUFDekMsU0FBZ0IsSUFBSSxDQUFDLElBQXFDO1FBQ3pELE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUTtZQUNwRSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUNoRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUM1TixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFaEIsSUFBSSxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLGNBQWMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDcEUsT0FBTztnQkFDTixJQUFJLEVBQUUsV0FBVztnQkFDakIsU0FBUyxFQUFFO29CQUNWLFlBQVksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVk7b0JBQ3JDLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUN4RCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUNsQixRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBd0IsQ0FBQztpQkFDbkQ7Z0JBQ0QsUUFBUTtnQkFDUixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87YUFDckIsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPO1lBQ04sSUFBSSxFQUFFLFdBQVc7WUFDakIsU0FBUyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQztnQkFDbkUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNaLFFBQVEsQ0FBQyxJQUFJLENBQWtCLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDM0MsUUFBUTtZQUNSLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQTVCZSw4QkFBSSxPQTRCbkIsQ0FBQTtJQUNELFNBQWdCLEVBQUUsQ0FBQyxJQUFnQztRQUNsRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQXdCLElBQUksQ0FBQyxDQUFDO1FBRWxELE1BQU0sUUFBUSxHQUFHLENBQUMsS0FBK0IsRUFBZ0MsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNyRyxLQUFLLENBQUMsQ0FBQztZQUNQLFFBQVEsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFcEIsT0FBTyxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FDekMsT0FBTyxLQUFLLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzNGLFlBQVksRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLFlBQVk7WUFDMUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztTQUMvRCxDQUFDLENBQUM7WUFDRixRQUFRLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUNVLENBQUMsQ0FBQyx3Q0FBd0M7SUFDaEYsQ0FBQztJQWRlLDRCQUFFLEtBY2pCLENBQUE7QUFDRixDQUFDLEVBN0NnQix5QkFBeUIsS0FBekIseUJBQXlCLFFBNkN6QztBQUVELE1BQU0sS0FBVyw0QkFBNEIsQ0FTNUM7QUFURCxXQUFpQiw0QkFBNEI7SUFDNUMsU0FBZ0IsSUFBSSxDQUFDLElBQXlDO1FBQzdELE9BQU87WUFDTixJQUFJLEVBQUUsY0FBYztZQUNwQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQVBlLGlDQUFJLE9BT25CLENBQUE7QUFDRixDQUFDLEVBVGdCLDRCQUE0QixLQUE1Qiw0QkFBNEIsUUFTNUM7QUFFRCxNQUFNLEtBQVcsZ0JBQWdCLENBK0VoQztBQS9FRCxXQUFpQixnQkFBZ0I7SUFFaEMsU0FBZ0IsSUFBSSxDQUFDLElBQXFDLEVBQUUsaUJBQW9DLEVBQUUsa0JBQW1DO1FBQ3BJLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQ3BELE9BQU8sd0JBQXdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUN6RCxPQUFPLHNCQUFzQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDNUQsT0FBTyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQzNELE9BQU8sd0JBQXdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsQ0FBQztZQUNuRSxPQUFPLGdDQUFnQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDdkQsT0FBTyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEMsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQzNELE9BQU8scUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pDLENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMseUJBQXlCLEVBQUUsQ0FBQztZQUM1RCxPQUFPLHlCQUF5QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLDZCQUE2QixFQUFFLENBQUM7WUFDaEUsT0FBTyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDeEYsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQzNELE9BQU8sd0JBQXdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUMvRCxPQUFPLDRCQUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLDJDQUEyQyxFQUFFLENBQUM7WUFDOUUsT0FBTywyQ0FBMkMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0QsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQy9ELE9BQU8sNEJBQTRCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUMxRCxPQUFPLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLDRCQUE0QixFQUFFLENBQUM7WUFDL0QsT0FBTyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEQsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxDQUFDO1lBQ25FLE9BQU8sZ0NBQWdDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUMvRCxPQUFPLDRCQUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDdkQsT0FBTyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEMsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQzdELE9BQU8sMEJBQTBCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLElBQUksWUFBWSxLQUFLLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztZQUM5RCxPQUFPLDJCQUEyQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUN0RixDQUFDO2FBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDekQsT0FBTyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUMsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxDQUFDO1lBQ2hFLE9BQU8sNkJBQTZCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxPQUFPO1lBQ04sSUFBSSxFQUFFLGlCQUFpQjtZQUN2QixPQUFPLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7U0FDaEMsQ0FBQztJQUNILENBQUM7SUFuRGUscUJBQUksT0FtRG5CLENBQUE7SUFFRCxTQUFnQixFQUFFLENBQUMsSUFBc0MsRUFBRSxpQkFBb0M7UUFDOUYsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbkIsS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1RCxLQUFLLGlCQUFpQixDQUFDO1lBQ3ZCLEtBQUssaUJBQWlCLENBQUM7WUFDdkIsS0FBSyxpQkFBaUIsQ0FBQztZQUN2QixLQUFLLFVBQVUsQ0FBQztZQUNoQixLQUFLLFNBQVM7Z0JBQ2IsT0FBTyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFYZSxtQkFBRSxLQVdqQixDQUFBO0lBRUQsU0FBZ0IsU0FBUyxDQUFDLElBQTZDLEVBQUUsaUJBQW9DO1FBQzVHLFFBQVEsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ25CLEtBQUssaUJBQWlCLENBQUMsQ0FBQyxPQUFPLHdCQUF3QixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqRSxLQUFLLGlCQUFpQixDQUFDLENBQUMsT0FBTyxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDL0QsS0FBSyxpQkFBaUIsQ0FBQyxDQUFDLE9BQU8sU0FBUyxDQUFDO1lBQ3pDLEtBQUssVUFBVSxDQUFDLENBQUMsT0FBTyxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkQsS0FBSyxTQUFTLENBQUMsQ0FBQyxPQUFPLDZCQUE2QixDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUNsRixDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQVZlLDBCQUFTLFlBVXhCLENBQUE7QUFDRixDQUFDLEVBL0VnQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBK0VoQztBQUVELE1BQU0sS0FBVyxnQkFBZ0IsQ0F3RmhDO0FBeEZELFdBQWlCLGdCQUFnQjtJQUNoQyxTQUFnQixFQUFFLENBQUMsT0FBMEIsRUFBRSxTQUFvRixFQUFFLEtBQStCLEVBQUUsa0JBQTBELEVBQUUsV0FBa0UsRUFBRSxLQUF3RCxFQUFFLFNBQXVDLEVBQUUsVUFBdUI7UUFFL1osTUFBTSxjQUFjLEdBQWdDLEVBQUUsQ0FBQztRQUN2RCxNQUFNLGtCQUFrQixHQUFnQyxFQUFFLENBQUM7UUFDM0QsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzdDLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDdkIsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDakMsY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1Asa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDekgsTUFBTSxtQkFBbUIsR0FBdUI7WUFDL0MsRUFBRSxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQ3JCLE1BQU0sRUFBRSxPQUFPLENBQUMsT0FBTztZQUN2QixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87WUFDeEIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLElBQUksQ0FBQztZQUM3QixzQkFBc0IsRUFBRSxPQUFPLENBQUMsc0JBQXNCLElBQUksSUFBSTtZQUM5RCxxQkFBcUIsRUFBRSxPQUFPLENBQUMscUJBQXFCLElBQUksS0FBSztZQUM3RCxTQUFTO1lBQ1QsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlO1lBQ3hDLFVBQVUsRUFBRSxrQkFBa0I7aUJBQzVCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO2lCQUM1RCxNQUFNLENBQUMsU0FBUyxDQUFDO1lBQ25CLGNBQWMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEVBQUUsQ0FBQztZQUNyRSxRQUFRLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO1lBQzNDLHdCQUF3QixFQUFFLE9BQU8sQ0FBQyx3QkFBd0I7WUFDMUQsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLHdCQUF3QjtZQUMxRCxTQUFTO1lBQ1QsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBeUIsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFVO1lBQ2pILEtBQUs7WUFDTCxLQUFLO1lBQ0wsa0JBQWtCO1lBQ2xCLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0I7WUFDMUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLE9BQU87WUFDbkQsaUJBQWlCLEVBQUUsMkJBQTJCLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztZQUMzRSxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWU7WUFDeEMsb0JBQW9CLEVBQUUsT0FBTyxDQUFDLG9CQUFvQjtZQUNsRCxZQUFZLEVBQUUsT0FBTyxDQUFDLFlBQVk7WUFDbEMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlO1lBQ3hDLGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxJQUFJLEtBQUs7WUFDakQsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDOUUsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLGlCQUFpQjtTQUM1QyxDQUFDO1FBRUYsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSx3QkFBd0IsQ0FBQyxFQUFFLENBQUM7WUFDaEUsbURBQW1EO1lBQ25ELE9BQVEsbUJBQTJCLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLG1EQUFtRDtZQUNuRCxPQUFRLG1CQUEyQixDQUFDLE9BQU8sQ0FBQztZQUM1QyxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxxQkFBcUIsQ0FBQztZQUMxRCxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxRQUFRLENBQUM7WUFDN0MsbURBQW1EO1lBQ25ELE9BQVEsbUJBQTJCLENBQUMsU0FBUyxDQUFDO1lBQzlDLG1EQUFtRDtZQUNuRCxPQUFRLG1CQUEyQixDQUFDLGdCQUFnQixDQUFDO1lBQ3JELG1EQUFtRDtZQUNuRCxPQUFRLG1CQUEyQixDQUFDLFNBQVMsQ0FBQztZQUM5QyxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxvQkFBb0IsQ0FBQztZQUN6RCxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxZQUFZLENBQUM7WUFDakQsbURBQW1EO1lBQ25ELE9BQVEsbUJBQTJCLENBQUMsZUFBZSxDQUFDO1lBQ3BELG1EQUFtRDtZQUNuRCxPQUFRLG1CQUEyQixDQUFDLGVBQWUsQ0FBQztZQUNwRCxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxLQUFLLENBQUM7UUFDM0MsQ0FBQztRQUVELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsMEJBQTBCLENBQUMsRUFBRSxDQUFDO1lBQ2xFLE9BQU8sbUJBQW1CLENBQUMsd0JBQXdCLENBQUM7WUFDcEQsT0FBTyxtQkFBbUIsQ0FBQyx3QkFBd0IsQ0FBQztZQUNwRCxtREFBbUQ7WUFDbkQsT0FBUSxtQkFBMkIsQ0FBQyxLQUFLLENBQUM7UUFDM0MsQ0FBQztRQUdELE9BQU8sbUJBQW1CLENBQUM7SUFDNUIsQ0FBQztJQXRGZSxtQkFBRSxLQXNGakIsQ0FBQTtBQUNGLENBQUMsRUF4RmdCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUF3RmhDO0FBRUQsTUFBTSxLQUFXLFlBQVksQ0FrQjVCO0FBbEJELFdBQWlCLFlBQVk7SUFDNUIsU0FBZ0IsRUFBRSxDQUFDLEdBQXNCO1FBQ3hDLFFBQVEsR0FBRyxFQUFFLENBQUM7WUFDYixLQUFLLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7WUFDcEUsS0FBSyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO1lBQ3BFLEtBQUssaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztZQUM3RCxLQUFLLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUM7UUFDdkUsQ0FBQztJQUNGLENBQUM7SUFQZSxlQUFFLEtBT2pCLENBQUE7SUFFRCxTQUFnQixJQUFJLENBQUMsR0FBdUI7UUFDM0MsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUNiLEtBQUssS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLGlCQUFpQixDQUFDLFFBQVEsQ0FBQztZQUNwRSxLQUFLLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxpQkFBaUIsQ0FBQyxRQUFRLENBQUM7WUFDcEUsS0FBSyxLQUFLLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8saUJBQWlCLENBQUMsSUFBSSxDQUFDO1lBQzdELEtBQUssS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLGlCQUFpQixDQUFDLFlBQVksQ0FBQztRQUN2RSxDQUFDO0lBQ0YsQ0FBQztJQVBlLGlCQUFJLE9BT25CLENBQUE7QUFDRixDQUFDLEVBbEJnQixZQUFZLEtBQVosWUFBWSxRQWtCNUI7QUFFRCxNQUFNLEtBQVcsNEJBQTRCLENBSTVDO0FBSkQsV0FBaUIsNEJBQTRCO0lBQzVDLFNBQWdCLElBQUksQ0FBQyxJQUF3QztRQUM1RCxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUZlLGlDQUFJLE9BRW5CLENBQUE7QUFDRixDQUFDLEVBSmdCLDRCQUE0QixLQUE1Qiw0QkFBNEIsUUFJNUM7QUFFRCxNQUFNLEtBQVcsbUJBQW1CLENBOERuQztBQTlERCxXQUFpQixtQkFBbUI7SUFDbkMsU0FBZ0IsRUFBRSxDQUFDLFFBQW1DLEVBQUUsV0FBa0UsRUFBRSxVQUF1QjtRQUNsSixJQUFJLEtBQUssR0FBd0MsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUNoRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixJQUFJLE1BQWMsQ0FBQztZQUNuQixJQUFJLENBQUM7Z0JBQ0osTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixNQUFNLEdBQUcsUUFBUSxRQUFRLENBQUMsSUFBSSxRQUFRLFFBQVEsQ0FBQyxFQUFFLFVBQVUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzVFLENBQUM7WUFFRCxVQUFVLENBQUMsS0FBSyxDQUFDLGlFQUFpRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQzVGLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzVCLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNCLENBQUM7YUFBTSxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLElBQUksS0FBSyxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuSCxLQUFLLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNwQyxDQUFDO2FBQU0sSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzNDLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUM7WUFDaEQsS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUN4QyxRQUFRLENBQUMsUUFBUSxJQUFJLFdBQVcsRUFDaEMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFpQixDQUFDLENBQUMsQ0FBQyxFQUNoRixHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQ3ZDLENBQUM7UUFDSCxDQUFDO2FBQU0sSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQzNDLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxjQUFjLElBQUksa0JBQWtCLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNqRyxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsU0FBUyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xGLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQXFDLEVBQUU7Z0JBQ3pHLElBQUksUUFBUSxDQUFDLFNBQVMsSUFBSSxHQUFHLENBQUMsUUFBUSxFQUFFLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ3hELE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ2xCLENBQUM7Z0JBRUQsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFO3dCQUN6QixJQUFJLGNBQWMsSUFBSSxDQUFDLENBQUMsUUFBUSxHQUFHLGNBQWMsRUFBRSxDQUFDOzRCQUNuRCxPQUFPLEtBQUssQ0FBQzt3QkFDZCxDQUFDO3dCQUNELElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7NEJBQ3JILE9BQU8sS0FBSyxDQUFDO3dCQUNkLENBQUM7d0JBRUQsT0FBTyxJQUFJLENBQUM7b0JBQ2IsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFDRCxJQUFJLGNBQWMsQ0FBQztRQUNuQixJQUFJLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxJQUFJLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDaEYsSUFBSSxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQzdCLGNBQWMsR0FBRywrQkFBK0IsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQzlFLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTztZQUNOLEVBQUUsRUFBRSxRQUFRLENBQUMsRUFBRTtZQUNmLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtZQUNuQixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDO1lBQzVFLGNBQWM7WUFDZCxLQUFLO1lBQ0wsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLGdCQUFnQjtTQUMzQyxDQUFDO0lBQ0gsQ0FBQztJQTVEZSxzQkFBRSxLQTREakIsQ0FBQTtBQUNGLENBQUMsRUE5RGdCLG1CQUFtQixLQUFuQixtQkFBbUIsUUE4RG5DO0FBRUQsTUFBTSxLQUFXLDhCQUE4QixDQVk5QztBQVpELFdBQWlCLDhCQUE4QjtJQUM5QyxTQUFnQixFQUFFLENBQUMsUUFBbUM7UUFDckQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUM3QixJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFFRCxPQUFPO1lBQ04sSUFBSSxFQUFFLFFBQVEsQ0FBQyxFQUFFO1lBQ2pCLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUM7U0FDNUUsQ0FBQztJQUNILENBQUM7SUFWZSxpQ0FBRSxLQVVqQixDQUFBO0FBQ0YsQ0FBQyxFQVpnQiw4QkFBOEIsS0FBOUIsOEJBQThCLFFBWTlDO0FBRUQsSUFBVSwrQkFBK0IsQ0FjeEM7QUFkRCxXQUFVLCtCQUErQjtJQUN4QyxTQUFnQixFQUFFLENBQUMsU0FBbUQ7UUFDckUsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDO1FBQzFCLEtBQUssTUFBTSxDQUFDLElBQUksU0FBUyxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUN2QixjQUFjLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNELENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNqQyxjQUFjLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1lBQy9ELENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxjQUFjLENBQUM7SUFDdkIsQ0FBQztJQVplLGtDQUFFLEtBWWpCLENBQUE7QUFDRixDQUFDLEVBZFMsK0JBQStCLEtBQS9CLCtCQUErQixRQWN4QztBQUVELE1BQU0sS0FBVywyQkFBMkIsQ0FrQzNDO0FBbENELFdBQWlCLDJCQUEyQjtJQUMzQyxTQUFnQixFQUFFLENBQUMsSUFBa0Y7UUFDcEcsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLE9BQU87Z0JBQ04sR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztnQkFDekIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDckIsY0FBYyxFQUFFLCtCQUErQixDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUMvRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUzthQUN6QixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFaZSw4QkFBRSxLQVlqQixDQUFBO0lBRUQsU0FBZ0IsSUFBSSxDQUFDLElBQW9EO1FBQ3hFLElBQUksSUFBSSxFQUFFLENBQUM7WUFDVixPQUFPO2dCQUNOLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztnQkFDYixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7Z0JBQ2YsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNyQixjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNoRCxJQUFJLEVBQUUsTUFBZTtvQkFDckIsRUFBRSxFQUFFLEdBQUcsQ0FBQyxJQUFJO29CQUNaLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSTtvQkFDZCxLQUFLLEVBQUUsU0FBUztvQkFDaEIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBWSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUztpQkFDbEYsQ0FBQyxDQUFDLElBQUksRUFBRTtnQkFDVCxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUzthQUN6QixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFsQmUsZ0NBQUksT0FrQm5CLENBQUE7QUFDRixDQUFDLEVBbENnQiwyQkFBMkIsS0FBM0IsMkJBQTJCLFFBa0MzQztBQUVELE1BQU0sS0FBVyx1QkFBdUIsQ0FjdkM7QUFkRCxXQUFpQix1QkFBdUI7SUFDdkMsU0FBZ0IsSUFBSSxDQUFDLElBQStCLEVBQUUsaUJBQW9DLEVBQUUsV0FBNEI7UUFDdkgsT0FBTztZQUNOLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRTtZQUNYLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUNuQixLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLO1lBQzNCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2pDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUM7U0FDaEUsQ0FBQztJQUNILENBQUM7SUFaZSw0QkFBSSxPQVluQixDQUFBO0FBQ0YsQ0FBQyxFQWRnQix1QkFBdUIsS0FBdkIsdUJBQXVCLFFBY3ZDO0FBRUQsTUFBTSxLQUFXLGVBQWUsQ0FpRC9CO0FBakRELFdBQWlCLGVBQWU7SUFDL0IsU0FBZ0IsRUFBRSxDQUFDLE1BQXdCO1FBQzFDLE9BQU87WUFDTixZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVk7WUFDakMsUUFBUSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1lBQ3pDLFlBQVksRUFBRSxNQUFNLENBQUMsWUFBWTtZQUNqQyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU87U0FDdkIsQ0FBQztJQUNILENBQUM7SUFQZSxrQkFBRSxLQU9qQixDQUFBO0lBQ0QsU0FBZ0IsSUFBSSxDQUFDLE1BQXlCO1FBQzdDLE9BQU87WUFDTixZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVk7WUFDakMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRO1lBQ3pCLFlBQVksRUFBRSxNQUFNLENBQUMsWUFBWTtZQUNqQyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU87U0FDdkIsQ0FBQztJQUNILENBQUM7SUFQZSxvQkFBSSxPQU9uQixDQUFBO0lBRUQsU0FBUyxjQUFjLENBQUMsUUFBc0M7UUFDN0QsT0FBTyxjQUFjLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ3ZDLElBQUksS0FBSyxDQUFDLElBQUksa0RBQXlDLEVBQUUsQ0FBQztnQkFDekQsT0FBTyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ3pGLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxnREFBdUMsRUFBRSxDQUFDO2dCQUM5RCxPQUFPLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyRCxDQUFDO2lCQUFNLElBQUksS0FBSyxDQUFDLElBQUksb0RBQTJDLEVBQUUsQ0FBQztnQkFDbEUsT0FBTyxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ25GLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxxREFBNEMsRUFBRSxDQUFDO2dCQUNuRSxPQUFPLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxRCxDQUFDO2lCQUFNLElBQUksS0FBSyxDQUFDLElBQUksZ0RBQXVDLEVBQUUsQ0FBQztnQkFDOUQsSUFBSSxNQUFrQixDQUFDO2dCQUN2QixnREFBZ0Q7Z0JBQ2hELElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDcEgsTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzFDLENBQUM7cUJBQU0sSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzNDLElBQUksQ0FBQzt3QkFDSixNQUFNLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7b0JBQzFDLENBQUM7b0JBQUMsTUFBTSxDQUFDO3dCQUNSLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQztnQkFDRixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QixDQUFDO2dCQUVELE9BQU8sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2hGLENBQUM7WUFFRCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7QUFDRixDQUFDLEVBakRnQixlQUFlLEtBQWYsZUFBZSxRQWlEL0I7QUFFRCxNQUFNLEtBQVcsd0JBQXdCLENBeUR4QztBQXpERCxXQUFpQix3QkFBd0I7SUFDeEMsU0FBZ0IsRUFBRSxDQUFDLE1BQXdCLEVBQUUsS0FBMkIsRUFBRSxpQkFBb0M7UUFDN0csSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUNsQyx5QkFBeUI7WUFDekIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxlQUFlLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDckMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1lBQ25ELE1BQU0sYUFBYSxHQUFHO2dCQUNyQixPQUFPLEVBQUUsaUJBQWlCLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUU7YUFDakcsQ0FBQztZQUNGLE1BQU0sYUFBYSxHQUE2QixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLENBQUM7WUFDbkYsT0FBTyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO1FBQ3BELENBQUM7YUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQzdDLE1BQU0sY0FBYyxHQUE4QixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3pILE9BQU8sRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQztRQUNyRCxDQUFDO2FBQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztZQUMvQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssVUFBVSxFQUFFLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO1FBQ3ZHLENBQUM7YUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFFN0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUM7Z0JBQ3hCLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxRQUFRLENBQUM7Z0JBQzVELENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxRQUFRLENBQUM7Z0JBQzVELENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxLQUFLLENBQUM7YUFDdEQsQ0FBQyxDQUFDO1lBRUgsT0FBTztnQkFDTixNQUFNLEVBQUU7b0JBQ1AsSUFBSSxFQUFFLDBCQUEwQjtvQkFDaEMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsUUFBUTtvQkFDN0YsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7b0JBQ2pDLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsaUJBQWlCO2lCQUNqRCxFQUFFLE1BQU0sRUFBRSxRQUFRO2FBQ25CLENBQUM7UUFDSCxDQUFDO2FBQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyx1QkFBdUIsRUFBRSxDQUFDO1lBQzFELE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxDQUFDO2dCQUN4QixDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsK0JBQStCLENBQUMsUUFBUSxDQUFDO2dCQUM1RCxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsK0JBQStCLENBQUMsUUFBUSxDQUFDO2FBQzVELENBQUMsQ0FBQztZQUVILE9BQU87Z0JBQ04sTUFBTSxFQUFFO29CQUNQLElBQUksRUFBRSx1QkFBdUI7b0JBQzdCLE9BQU8sRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLCtCQUErQixDQUFDLFFBQVE7b0JBQzdGLEdBQUcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO29CQUNqQyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLGlCQUFpQjtvQkFDakQsU0FBUyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUztvQkFDakMsVUFBVSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBVTtvQkFDbkMsWUFBWSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsWUFBWTtpQkFDdkMsRUFBRSxNQUFNLEVBQUUsUUFBUTthQUNuQixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO1FBQ25ELENBQUM7SUFDRixDQUFDO0lBdkRlLDJCQUFFLEtBdURqQixDQUFBO0FBQ0YsQ0FBQyxFQXpEZ0Isd0JBQXdCLEtBQXhCLHdCQUF3QixRQXlEeEM7QUFFRCxNQUFNLEtBQVcsZ0JBQWdCLENBVWhDO0FBVkQsV0FBaUIsZ0JBQWdCO0lBQ2hDLFNBQWdCLElBQUksQ0FBQyxRQUFpRyxFQUFFLFNBQXFDLEVBQUUsV0FBNEI7UUFDMUwsSUFBSSxpQkFBaUIsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNuQyxPQUFPLEVBQUUsZUFBZSxFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM3RixDQUFDO1FBQ0QsSUFBSSxLQUFLLElBQUksUUFBUSxFQUFFLENBQUM7WUFDdkIsT0FBTyxFQUFFLEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDOUIsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQVJlLHFCQUFJLE9BUW5CLENBQUE7QUFDRixDQUFDLEVBVmdCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFVaEM7QUFDRCxNQUFNLEtBQVcseUJBQXlCLENBT3pDO0FBUEQsV0FBaUIseUJBQXlCO0lBQ3pDLFNBQWdCLElBQUksQ0FBQyxJQUFtQztRQUN2RCxPQUFPO1lBQ04sR0FBRyxJQUFJO1lBQ1AsYUFBYSxFQUFFLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztTQUM1RCxDQUFDO0lBQ0gsQ0FBQztJQUxlLDhCQUFJLE9BS25CLENBQUE7QUFDRixDQUFDLEVBUGdCLHlCQUF5QixLQUF6Qix5QkFBeUIsUUFPekM7QUFFRCxNQUFNLEtBQVcsc0JBQXNCLENBWXRDO0FBWkQsV0FBaUIsc0JBQXNCO0lBQ3RDLFNBQWdCLElBQUksQ0FBQyxXQUE0RSxFQUFFLGFBQXFCO1FBQ3ZILElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU87Z0JBQ04sS0FBSyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDOUQsQ0FBQztRQUNILENBQUM7UUFDRCxPQUFPO1lBQ04sS0FBSyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLGVBQWUsRUFBRSxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUM3SSxDQUFDO0lBQ0gsQ0FBQztJQVZlLDJCQUFJLE9BVW5CLENBQUE7QUFDRixDQUFDLEVBWmdCLHNCQUFzQixLQUF0QixzQkFBc0IsUUFZdEM7QUFFRCxNQUFNLEtBQVcsaUNBQWlDLENBU2pEO0FBVEQsV0FBaUIsaUNBQWlDO0lBQ2pELFNBQWdCLElBQUksQ0FBQyxlQUF5RCxFQUFFLGFBQXFCO1FBQ3BHLE9BQU87WUFDTixHQUFHLGVBQWU7WUFDbEIsYUFBYTtZQUNiLEdBQUcsRUFBRSxlQUFlLENBQUMsR0FBRztZQUN4QixXQUFXLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLElBQUksU0FBUztTQUN2RSxDQUFDO0lBQ0gsQ0FBQztJQVBlLHNDQUFJLE9BT25CLENBQUE7QUFDRixDQUFDLEVBVGdCLGlDQUFpQyxLQUFqQyxpQ0FBaUMsUUFTakQ7QUFFRCxNQUFNLEtBQVcsaUJBQWlCLENBT2pDO0FBUEQsV0FBaUIsaUJBQWlCO0lBQ2pDLFNBQWdCLEVBQUUsQ0FBQyxJQUFpQztRQUNuRCxPQUFPO1lBQ04sSUFBSSxFQUFFLHdCQUF3QixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQzVDLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztTQUNuQyxDQUFDO0lBQ0gsQ0FBQztJQUxlLG9CQUFFLEtBS2pCLENBQUE7QUFDRixDQUFDLEVBUGdCLGlCQUFpQixLQUFqQixpQkFBaUIsUUFPakM7QUFFRCxNQUFNLEtBQVcsd0JBQXdCLENBYXhDO0FBYkQsV0FBaUIsd0JBQXdCO0lBQ3hDLFNBQWdCLEVBQUUsQ0FBQyxJQUF3QztRQUMxRCxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2Q7Z0JBQ0MsT0FBTyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDO1lBQzVDO2dCQUNDLE9BQU8sS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQztZQUM1QztnQkFDQyxPQUFPLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLENBQUM7WUFDL0M7Z0JBQ0MsT0FBTyxLQUFLLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDO1FBQ2hELENBQUM7SUFDRixDQUFDO0lBWGUsMkJBQUUsS0FXakIsQ0FBQTtBQUNGLENBQUMsRUFiZ0Isd0JBQXdCLEtBQXhCLHdCQUF3QixRQWF4QztBQUVELE1BQU0sS0FBVywrQkFBK0IsQ0FrQi9DO0FBbEJELFdBQWlCLCtCQUErQjtJQUMvQyxTQUFnQixFQUFFLENBQUksTUFBb0QsRUFBRSxTQUErRDtRQUMxSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLG1DQUFtQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzNFLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUN0RixPQUFPO2dCQUNOLElBQUksRUFBRSxLQUFLLENBQUMsbUNBQW1DLENBQUMsT0FBTztnQkFDdkQsWUFBWSxFQUFFLFlBQVk7Z0JBQzFCLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxtQkFBbUI7YUFDL0MsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLG1DQUFtQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ25GLE9BQU87Z0JBQ04sSUFBSSxFQUFFLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxRQUFRO2FBQ3hELENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTztZQUNOLElBQUksRUFBRSxLQUFLLENBQUMsbUNBQW1DLENBQUMsUUFBUTtTQUN4RCxDQUFDO0lBQ0gsQ0FBQztJQWhCZSxrQ0FBRSxLQWdCakIsQ0FBQTtBQUNGLENBQUMsRUFsQmdCLCtCQUErQixLQUEvQiwrQkFBK0IsUUFrQi9DO0FBRUQsTUFBTSxLQUFXLHlCQUF5QixDQWlCekM7QUFqQkQsV0FBaUIseUJBQXlCO0lBQ3pDLFNBQWdCLElBQUksQ0FBQyxLQUFpRDtRQUNyRSxJQUFJLEtBQUssS0FBSyxLQUFLLENBQUMsbUNBQW1DLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDL0QsT0FBTyxTQUFTLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDO1FBQ2xELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxTQUFTLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDO1FBQ2pELENBQUM7SUFDRixDQUFDO0lBTmUsOEJBQUksT0FNbkIsQ0FBQTtJQUVELFNBQWdCLEVBQUUsQ0FBQyxJQUF5QztRQUMzRCxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2QsS0FBSyxTQUFTLENBQUMseUJBQXlCLENBQUMsS0FBSztnQkFDN0MsT0FBTyxLQUFLLENBQUMsbUNBQW1DLENBQUMsS0FBSyxDQUFDO1lBQ3hEO2dCQUNDLE9BQU8sS0FBSyxDQUFDLG1DQUFtQyxDQUFDLElBQUksQ0FBQztRQUN4RCxDQUFDO0lBQ0YsQ0FBQztJQVBlLDRCQUFFLEtBT2pCLENBQUE7QUFDRixDQUFDLEVBakJnQix5QkFBeUIsS0FBekIseUJBQXlCLFFBaUJ6QztBQUVELE1BQU0sS0FBVyxhQUFhLENBVzdCO0FBWEQsV0FBaUIsYUFBYTtJQUM3QixTQUFnQixJQUFJLENBQUMsSUFBMEIsRUFBRSxFQUFVO1FBQzFELE9BQU87WUFDTixFQUFFO1lBQ0YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsZ0JBQWdCLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLDhDQUFzQyxDQUFrQztZQUNoSCxZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7U0FDL0IsQ0FBQztJQUNILENBQUM7SUFUZSxrQkFBSSxPQVNuQixDQUFBO0FBQ0YsQ0FBQyxFQVhnQixhQUFhLEtBQWIsYUFBYSxRQVc3QjtBQUVELE1BQU0sS0FBVyx1QkFBdUIsQ0FVdkM7QUFWRCxXQUFpQix1QkFBdUI7SUFDdkMsU0FBZ0IsRUFBRSxDQUFDLE1BQTJCO1FBQzdDLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUMzQixPQUFPLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLFdBQVcsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNwSCxDQUFDO2FBQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFSZSwwQkFBRSxLQVFqQixDQUFBO0FBQ0YsQ0FBQyxFQVZnQix1QkFBdUIsS0FBdkIsdUJBQXVCLFFBVXZDO0FBRUQsTUFBTSxLQUFXLHVCQUF1QixDQXVGdkM7QUF2RkQsV0FBaUIsdUJBQXVCO0lBQ3ZDLFNBQWdCLEVBQUUsQ0FBQyxNQUFtQjtRQUNyQyxNQUFNLFVBQVUsR0FBRyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM5RSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbkUsQ0FBQztpQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNwRyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxJQUFJLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUEyQyxDQUFDO1FBQzlDLElBQUksTUFBTSxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN2QyxVQUFVLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUM7UUFDL0MsQ0FBQztRQUNELElBQUksTUFBTSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzVCLFVBQVUsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUM7UUFDaEQsQ0FBQztRQUNELE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7SUFqQmUsMEJBQUUsS0FpQmpCLENBQUE7SUFFRCxTQUFnQixJQUFJLENBQUMsTUFBK0MsRUFBRSxTQUFnQztRQUNyRyxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzlCLHVCQUF1QixDQUFDLFNBQVMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFFRCxNQUFNLGdCQUFnQixHQUFHLENBQUMsSUFBbUQsRUFBRSxFQUFFO1lBQ2hGLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNuQix1QkFBdUIsQ0FBQyxTQUFTLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztZQUN2RSxDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksVUFBVSxHQUE0RyxTQUFTLENBQUM7UUFDcEksSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7WUFDN0MsVUFBVSxHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ25ELE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQXlCLENBQUMsQ0FBQztZQUM5RSxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztnQkFDL0IsVUFBVSxHQUFHO29CQUNaLE1BQU0sRUFBRTt3QkFDUCxJQUFJLEVBQUUsTUFBTTt3QkFDWixRQUFRLEVBQUcsTUFBTSxDQUFDLGtCQUFrRCxDQUFDLElBQUk7d0JBQ3pFLEtBQUssRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFFLE1BQU0sQ0FBQyxrQkFBa0QsQ0FBQyxLQUFLLENBQUM7cUJBQ3RGO2lCQUNrQyxDQUFDO2dCQUNyQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1lBQ25CLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQXFCO1lBQzdCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDbEMsSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7b0JBQ2pELGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN2QixPQUFPO3dCQUNOLElBQUksRUFBRSxNQUFNO3dCQUNaLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO3FCQUN2QixDQUFDO2dCQUNILENBQUM7cUJBQU0sSUFBSSxJQUFJLFlBQVksS0FBSyxDQUFDLDBCQUEwQixFQUFFLENBQUM7b0JBQzdELE9BQU87d0JBQ04sSUFBSSxFQUFFLFdBQVc7d0JBQ2pCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztxQkFDakIsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLElBQUksSUFBSSxZQUFZLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO29CQUN4RCxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDdkIsVUFBVSxHQUFHLElBQUksQ0FBQztvQkFDbEIsT0FBTzt3QkFDTixJQUFJLEVBQUUsTUFBTTt3QkFDWixLQUFLLEVBQUU7NEJBQ04sUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFROzRCQUN2QixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO3lCQUM5Qjt3QkFDRCxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7cUJBQ3ZCLENBQUM7Z0JBQ0gsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sSUFBSSxLQUFLLENBQUMsMkNBQTJDLENBQUMsQ0FBQztnQkFDOUQsQ0FBQztZQUNGLENBQUMsQ0FBQztZQUNGLGlCQUFpQixFQUFFLGNBQWMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDO1lBQ3RFLGlCQUFpQixFQUFFLFVBQVU7WUFDN0IsWUFBWSxFQUFFLE1BQU0sQ0FBQyxZQUFZO1lBQ2pDLGVBQWUsRUFBRSxNQUFNLENBQUMsUUFBUTtTQUNoQyxDQUFDO1FBRUYsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksNkJBQTZCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUNsRSxDQUFDO0lBbEVlLDRCQUFJLE9Ba0VuQixDQUFBO0FBQ0YsQ0FBQyxFQXZGZ0IsdUJBQXVCLEtBQXZCLHVCQUF1QixRQXVGdkM7QUFFRCxNQUFNLEtBQVcsUUFBUSxDQXNEeEI7QUF0REQsV0FBaUIsUUFBUTtJQUN4QixTQUFnQixhQUFhLENBQUMsUUFBMEI7UUFDdkQsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUZlLHNCQUFhLGdCQUU1QixDQUFBO0lBV0QsU0FBZ0IsSUFBSSxDQUFDLEtBQWtDO1FBQ3RELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7YUFBTSxJQUFJLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN6QyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7YUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM3QixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7YUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixDQUFDO2FBQU0sSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxNQUFNLElBQUksS0FBSyxFQUFFLENBQUM7WUFDM0UsTUFBTSxJQUFJLEdBQUcsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDaEYsTUFBTSxLQUFLLEdBQUcsT0FBTyxLQUFLLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDcEYsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQzNELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFoQmUsYUFBSSxPQWdCbkIsQ0FBQTtJQVNELFNBQWdCLEVBQUUsQ0FBQyxLQUE4QztRQUNoRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO2FBQU0sSUFBSSxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDekMsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO2FBQU0sSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUIsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLElBQUksR0FBRyxLQUFzRCxDQUFDO1lBQ3BFLE9BQU87Z0JBQ04sS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFDN0IsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQzthQUMzQixDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUFkZSxXQUFFLEtBY2pCLENBQUE7QUFDRixDQUFDLEVBdERnQixRQUFRLEtBQVIsUUFBUSxRQXNEeEI7QUFFRCxNQUFNLEtBQVcsZ0JBQWdCLENBcUJoQztBQXJCRCxXQUFpQixnQkFBZ0I7SUFDaEMsU0FBZ0Isd0JBQXdCLENBQUMsTUFBbUM7UUFDM0UsT0FBTztZQUNOLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSztZQUNuQixJQUFJLEVBQUUsNEJBQTRCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUMvQyxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7U0FDekIsQ0FBQztJQUNILENBQUM7SUFOZSx5Q0FBd0IsMkJBTXZDLENBQUE7SUFFRCxTQUFTLDRCQUE0QixDQUFDLElBQVk7UUFDakQsUUFBUSxJQUFJLEVBQUUsQ0FBQztZQUNkLEtBQUssMEJBQTBCLENBQUMsUUFBUTtnQkFDdkMsT0FBTywwQkFBMEIsQ0FBQyxRQUFRLENBQUM7WUFDNUMsS0FBSywwQkFBMEIsQ0FBQyxVQUFVO2dCQUN6QyxPQUFPLDBCQUEwQixDQUFDLFVBQVUsQ0FBQztZQUM5QyxLQUFLLDBCQUEwQixDQUFDLFFBQVE7Z0JBQ3ZDLE9BQU8sMEJBQTBCLENBQUMsUUFBUSxDQUFDO1lBQzVDO2dCQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUN4RCxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUMsRUFyQmdCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFxQmhDO0FBRUQsTUFBTSxLQUFXLG1CQUFtQixDQXFEbkM7QUFyREQsV0FBaUIsbUJBQW1CO0lBQ25DLFNBQVMsWUFBWSxDQUFDLFNBQXFDO1FBQzFELE9BQU8sQ0FBQyxDQUFFLFNBQTRDLENBQUMsR0FBRyxDQUFDO0lBQzVELENBQUM7SUFFRCxTQUFnQixJQUFJLENBQUMsSUFBZ0M7UUFDcEQsT0FBTyxlQUFlLENBQUMsWUFBWSxDQUNsQyxZQUFZLENBQUMsSUFBSSxDQUFDO1lBQ2pCLENBQUMsQ0FBQztnQkFDRCxJQUFJLHFDQUE2QjtnQkFDakMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO2dCQUNiLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7Z0JBQ3JDLGNBQWMsRUFBRyxJQUF3QyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7b0JBQzFFLFVBQVUsRUFBRyxJQUF3QyxDQUFDLGNBQWUsQ0FBQyxVQUFVO29CQUNoRixNQUFNLEVBQUcsSUFBd0MsQ0FBQyxjQUFlLENBQUMsTUFBTTtpQkFDeEUsQ0FBQyxDQUFDLENBQUMsU0FBUzthQUNiO1lBQ0QsQ0FBQyxDQUFDO2dCQUNELElBQUksc0NBQThCO2dCQUNsQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNO2dCQUNyQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7Z0JBQ2YsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNyQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7Z0JBQ2IsT0FBTyxFQUFFLFNBQVM7Z0JBQ2xCLE9BQU8sRUFBRSxTQUFTO2FBQ2xCLENBQ0YsQ0FBQztJQUNILENBQUM7SUF0QmUsd0JBQUksT0FzQm5CLENBQUE7SUFFRCxpREFBaUQ7SUFDakQsU0FBZ0IsRUFBRSxDQUFDLEdBQXVDO1FBQ3pELE1BQU0sTUFBTSxHQUFHLGVBQWUsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFELElBQUksTUFBTSxDQUFDLElBQUksd0NBQWdDLEVBQUUsQ0FBQztZQUNqRCxPQUFPLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUN2QyxHQUFHLENBQUMsS0FBSyxFQUNULE1BQU0sQ0FBQyxHQUFHLEVBQ1YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQ2xDLEdBQUcsQ0FBQyxVQUFVLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQ3hELENBQUM7UUFDSCxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUNoRCxHQUFHLENBQUMsS0FBSyxFQUNULE1BQU0sQ0FBQyxPQUFPLEVBQ2QsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFDaEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ2xILEdBQUcsQ0FBQyxVQUFVLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQ3hELENBQUM7WUFDRixJQUFJLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDaEIsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDO0lBQ0YsQ0FBQztJQXRCZSxzQkFBRSxLQXNCakIsQ0FBQTtBQUNGLENBQUMsRUFyRGdCLG1CQUFtQixLQUFuQixtQkFBbUIsUUFxRG5DO0FBRUQsTUFBTSxLQUFXLG1DQUFtQyxDQWFuRDtBQWJELFdBQWlCLG1DQUFtQztJQUNuRCxTQUFnQixJQUFJLENBQUMsSUFBWTtRQUNoQyxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2QsS0FBSyxLQUFLLENBQUMsbUNBQW1DLENBQUMsS0FBSztnQkFDbkQseUNBQWlDO1lBQ2xDLEtBQUssS0FBSyxDQUFDLG1DQUFtQyxDQUFDLE9BQU87Z0JBQ3JELDJDQUFtQztZQUNwQyxLQUFLLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxXQUFXO2dCQUN6RCwrQ0FBdUM7WUFDeEM7Z0JBQ0MsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1FBQ2pFLENBQUM7SUFDRixDQUFDO0lBWGUsd0NBQUksT0FXbkIsQ0FBQTtBQUNGLENBQUMsRUFiZ0IsbUNBQW1DLEtBQW5DLG1DQUFtQyxRQWFuRDtBQUVELE1BQU0sS0FBVyx5QkFBeUIsQ0FvQnpDO0FBcEJELFdBQWlCLHlCQUF5QjtJQUN6QyxTQUFnQixFQUFFLENBQUMsS0FBdUI7UUFDekMsTUFBTSxNQUFNLEdBQTZDLEVBQUUsQ0FBQztRQUM1RCxLQUFLLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDeEMsU0FBUztZQUNWLENBQUM7WUFDRCxNQUFNLFNBQVMsR0FBNkIsRUFBRSxDQUFDO1lBQy9DLEtBQUssTUFBTSxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQzVCLE1BQU0sUUFBUSxHQUFHLGVBQWUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3pDLElBQUksUUFBUSxFQUFFLENBQUM7b0JBQ2QsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDMUIsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxTQUFTLENBQUM7WUFDOUIsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFsQmUsNEJBQUUsS0FrQmpCLENBQUE7QUFDRixDQUFDLEVBcEJnQix5QkFBeUIsS0FBekIseUJBQXlCLFFBb0J6QztBQUVELE1BQU0sS0FBVyxlQUFlLENBYS9CO0FBYkQsV0FBaUIsZUFBZTtJQUMvQixTQUFnQixFQUFFLENBQUMsSUFBd0I7UUFDMUMsTUFBTSxPQUFPLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPO1lBQ04sT0FBTztZQUNQLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQVhlLGtCQUFFLEtBV2pCLENBQUE7QUFDRixDQUFDLEVBYmdCLGVBQWUsS0FBZixlQUFlLFFBYS9CO0FBRUQsTUFBTSxLQUFXLGVBQWUsQ0E2Qy9CO0FBN0NELFdBQWlCLGVBQWU7SUFFL0IsU0FBUyxhQUFhLENBQUMsTUFBNEM7UUFDbEUsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDMUIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELFFBQVEsTUFBTSxFQUFFLENBQUM7WUFDaEIsS0FBSyxDQUFDLEVBQUUsa0NBQWtDO2dCQUN6Qyx3Q0FBZ0M7WUFDakMsS0FBSyxDQUFDLEVBQUUscUNBQXFDO2dCQUM1QywyQ0FBbUM7WUFDcEMsS0FBSyxDQUFDLEVBQUUsc0NBQXNDO2dCQUM3Qyw0Q0FBb0M7WUFDckMsS0FBSyxDQUFDLEVBQUUsc0NBQXNDO2dCQUM3Qyw0Q0FBb0M7WUFDckM7Z0JBQ0MsT0FBTyxTQUFTLENBQUM7UUFDbkIsQ0FBQztJQUNGLENBQUM7SUFFRCxTQUFnQixJQUFJLENBQUMsY0FBc0M7UUFDMUQsa0hBQWtIO1FBQ2xILE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUM7UUFDckMsTUFBTSxPQUFPLEdBQUcsTUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQztRQUMxRCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sRUFBRSxrQkFBa0IsSUFBSSxNQUFNLEVBQUUsU0FBUyxDQUFDO1FBQzNFLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxFQUFFLGdCQUFnQixJQUFJLE1BQU0sRUFBRSxPQUFPLENBQUM7UUFFckUsT0FBTztZQUNOLFFBQVEsRUFBRSxjQUFjLENBQUMsUUFBUTtZQUNqQyxLQUFLLEVBQUUsY0FBYyxDQUFDLEtBQUs7WUFDM0IsV0FBVyxFQUFFLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3JHLEtBQUssRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNuRixNQUFNLEVBQUUsYUFBYSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7WUFDNUMsUUFBUSxFQUFFLGNBQWMsQ0FBQyxRQUFRO1lBQ2pDLE9BQU8sRUFBRSxjQUFjLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUM7WUFDMUQsTUFBTSxFQUFFO2dCQUNQLE9BQU87Z0JBQ1Asa0JBQWtCO2dCQUNsQixnQkFBZ0I7YUFDaEI7WUFDRCxPQUFPLEVBQUUsY0FBYyxDQUFDLE9BQU8sWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDckYsUUFBUSxFQUFFLGNBQWMsQ0FBQyxRQUFRO1NBQ2pDLENBQUM7SUFDSCxDQUFDO0lBdkJlLG9CQUFJLE9BdUJuQixDQUFBO0FBQ0YsQ0FBQyxFQTdDZ0IsZUFBZSxLQUFmLGVBQWUsUUE2Qy9CIn0=