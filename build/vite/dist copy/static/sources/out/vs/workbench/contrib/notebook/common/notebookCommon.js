/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../base/common/buffer.js';
import * as glob from '../../../../base/common/glob.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { generateMetadataUri, generate as generateUri, extractCellOutputDetails, parseMetadataUri, parse as parseUri } from '../../../services/notebook/common/notebookDocumentService.js';
export const NOTEBOOK_EDITOR_ID = 'workbench.editor.notebook';
export const NOTEBOOK_DIFF_EDITOR_ID = 'workbench.editor.notebookTextDiffEditor';
export const NOTEBOOK_MULTI_DIFF_EDITOR_ID = 'workbench.editor.notebookMultiTextDiffEditor';
export const INTERACTIVE_WINDOW_EDITOR_ID = 'workbench.editor.interactive';
export const REPL_EDITOR_ID = 'workbench.editor.repl';
export const NOTEBOOK_OUTPUT_EDITOR_ID = 'workbench.editor.notebookOutputEditor';
export const EXECUTE_REPL_COMMAND_ID = 'replNotebook.input.execute';
export var CellKind;
(function (CellKind) {
    CellKind[CellKind["Markup"] = 1] = "Markup";
    CellKind[CellKind["Code"] = 2] = "Code";
})(CellKind || (CellKind = {}));
export const NOTEBOOK_DISPLAY_ORDER = [
    'application/json',
    'application/javascript',
    'text/html',
    'image/svg+xml',
    Mimes.latex,
    Mimes.markdown,
    'image/png',
    'image/jpeg',
    Mimes.text
];
export const ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER = [
    Mimes.latex,
    Mimes.markdown,
    'application/json',
    'text/html',
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    Mimes.text,
];
/**
 * A mapping of extension IDs who contain renderers, to notebook ids who they
 * should be treated as the same in the renderer selection logic. This is used
 * to prefer the 1st party Jupyter renderers even though they're in a separate
 * extension, for instance. See #136247.
 */
export const RENDERER_EQUIVALENT_EXTENSIONS = new Map([
    ['ms-toolsai.jupyter', new Set(['jupyter-notebook', 'interactive'])],
    ['ms-toolsai.jupyter-renderers', new Set(['jupyter-notebook', 'interactive'])],
]);
export const RENDERER_NOT_AVAILABLE = '_notAvailable';
export var NotebookRunState;
(function (NotebookRunState) {
    NotebookRunState[NotebookRunState["Running"] = 1] = "Running";
    NotebookRunState[NotebookRunState["Idle"] = 2] = "Idle";
})(NotebookRunState || (NotebookRunState = {}));
export var NotebookCellExecutionState;
(function (NotebookCellExecutionState) {
    NotebookCellExecutionState[NotebookCellExecutionState["Unconfirmed"] = 1] = "Unconfirmed";
    NotebookCellExecutionState[NotebookCellExecutionState["Pending"] = 2] = "Pending";
    NotebookCellExecutionState[NotebookCellExecutionState["Executing"] = 3] = "Executing";
})(NotebookCellExecutionState || (NotebookCellExecutionState = {}));
export var NotebookExecutionState;
(function (NotebookExecutionState) {
    NotebookExecutionState[NotebookExecutionState["Unconfirmed"] = 1] = "Unconfirmed";
    NotebookExecutionState[NotebookExecutionState["Pending"] = 2] = "Pending";
    NotebookExecutionState[NotebookExecutionState["Executing"] = 3] = "Executing";
})(NotebookExecutionState || (NotebookExecutionState = {}));
/** Note: enum values are used for sorting */
export var NotebookRendererMatch;
(function (NotebookRendererMatch) {
    /** Renderer has a hard dependency on an available kernel */
    NotebookRendererMatch[NotebookRendererMatch["WithHardKernelDependency"] = 0] = "WithHardKernelDependency";
    /** Renderer works better with an available kernel */
    NotebookRendererMatch[NotebookRendererMatch["WithOptionalKernelDependency"] = 1] = "WithOptionalKernelDependency";
    /** Renderer is kernel-agnostic */
    NotebookRendererMatch[NotebookRendererMatch["Pure"] = 2] = "Pure";
    /** Renderer is for a different mimeType or has a hard dependency which is unsatisfied */
    NotebookRendererMatch[NotebookRendererMatch["Never"] = 3] = "Never";
})(NotebookRendererMatch || (NotebookRendererMatch = {}));
/**
 * Renderer messaging requirement. While this allows for 'optional' messaging,
 * VS Code effectively treats it the same as true right now. "Partial
 * activation" of extensions is a very tricky problem, which could allow
 * solving this. But for now, optional is mostly only honored for aznb.
 */
export var RendererMessagingSpec;
(function (RendererMessagingSpec) {
    RendererMessagingSpec["Always"] = "always";
    RendererMessagingSpec["Never"] = "never";
    RendererMessagingSpec["Optional"] = "optional";
})(RendererMessagingSpec || (RendererMessagingSpec = {}));
export var NotebookCellsChangeType;
(function (NotebookCellsChangeType) {
    NotebookCellsChangeType[NotebookCellsChangeType["ModelChange"] = 1] = "ModelChange";
    NotebookCellsChangeType[NotebookCellsChangeType["Move"] = 2] = "Move";
    NotebookCellsChangeType[NotebookCellsChangeType["ChangeCellLanguage"] = 5] = "ChangeCellLanguage";
    NotebookCellsChangeType[NotebookCellsChangeType["Initialize"] = 6] = "Initialize";
    NotebookCellsChangeType[NotebookCellsChangeType["ChangeCellMetadata"] = 7] = "ChangeCellMetadata";
    NotebookCellsChangeType[NotebookCellsChangeType["Output"] = 8] = "Output";
    NotebookCellsChangeType[NotebookCellsChangeType["OutputItem"] = 9] = "OutputItem";
    NotebookCellsChangeType[NotebookCellsChangeType["ChangeCellContent"] = 10] = "ChangeCellContent";
    NotebookCellsChangeType[NotebookCellsChangeType["ChangeDocumentMetadata"] = 11] = "ChangeDocumentMetadata";
    NotebookCellsChangeType[NotebookCellsChangeType["ChangeCellInternalMetadata"] = 12] = "ChangeCellInternalMetadata";
    NotebookCellsChangeType[NotebookCellsChangeType["ChangeCellMime"] = 13] = "ChangeCellMime";
    NotebookCellsChangeType[NotebookCellsChangeType["Unknown"] = 100] = "Unknown";
})(NotebookCellsChangeType || (NotebookCellsChangeType = {}));
export var SelectionStateType;
(function (SelectionStateType) {
    SelectionStateType[SelectionStateType["Handle"] = 0] = "Handle";
    SelectionStateType[SelectionStateType["Index"] = 1] = "Index";
})(SelectionStateType || (SelectionStateType = {}));
export var CellEditType;
(function (CellEditType) {
    CellEditType[CellEditType["Replace"] = 1] = "Replace";
    CellEditType[CellEditType["Output"] = 2] = "Output";
    CellEditType[CellEditType["Metadata"] = 3] = "Metadata";
    CellEditType[CellEditType["CellLanguage"] = 4] = "CellLanguage";
    CellEditType[CellEditType["DocumentMetadata"] = 5] = "DocumentMetadata";
    CellEditType[CellEditType["Move"] = 6] = "Move";
    CellEditType[CellEditType["OutputItems"] = 7] = "OutputItems";
    CellEditType[CellEditType["PartialMetadata"] = 8] = "PartialMetadata";
    CellEditType[CellEditType["PartialInternalMetadata"] = 9] = "PartialInternalMetadata";
})(CellEditType || (CellEditType = {}));
export var NotebookMetadataUri;
(function (NotebookMetadataUri) {
    NotebookMetadataUri.scheme = Schemas.vscodeNotebookMetadata;
    function generate(notebook) {
        return generateMetadataUri(notebook);
    }
    NotebookMetadataUri.generate = generate;
    function parse(metadata) {
        return parseMetadataUri(metadata);
    }
    NotebookMetadataUri.parse = parse;
})(NotebookMetadataUri || (NotebookMetadataUri = {}));
export var CellUri;
(function (CellUri) {
    CellUri.scheme = Schemas.vscodeNotebookCell;
    function generate(notebook, handle) {
        return generateUri(notebook, handle);
    }
    CellUri.generate = generate;
    function parse(cell) {
        return parseUri(cell);
    }
    CellUri.parse = parse;
    /**
     * Generates a URI for a cell output in a notebook using the output ID.
     * Used when URI should be opened as text in the editor.
     */
    function generateCellOutputUriWithId(notebook, outputId) {
        return notebook.with({
            scheme: Schemas.vscodeNotebookCellOutput,
            query: new URLSearchParams({
                openIn: 'editor',
                outputId: outputId ?? '',
                notebookScheme: notebook.scheme !== Schemas.file ? notebook.scheme : '',
            }).toString()
        });
    }
    CellUri.generateCellOutputUriWithId = generateCellOutputUriWithId;
    /**
     * Generates a URI for a cell output in a notebook using the output index.
     * Used when URI should be opened in notebook editor.
     */
    function generateCellOutputUriWithIndex(notebook, cellUri, outputIndex) {
        return notebook.with({
            scheme: Schemas.vscodeNotebookCellOutput,
            fragment: cellUri.fragment,
            query: new URLSearchParams({
                openIn: 'notebook',
                outputIndex: String(outputIndex),
            }).toString()
        });
    }
    CellUri.generateCellOutputUriWithIndex = generateCellOutputUriWithIndex;
    function generateOutputEditorUri(notebook, cellId, cellIndex, outputId, outputIndex) {
        return notebook.with({
            scheme: Schemas.vscodeNotebookCellOutput,
            query: new URLSearchParams({
                openIn: 'notebookOutputEditor',
                notebook: notebook.toString(),
                cellIndex: String(cellIndex),
                outputId: outputId,
                outputIndex: String(outputIndex),
            }).toString()
        });
    }
    CellUri.generateOutputEditorUri = generateOutputEditorUri;
    function parseCellOutputUri(uri) {
        return extractCellOutputDetails(uri);
    }
    CellUri.parseCellOutputUri = parseCellOutputUri;
    function generateCellPropertyUri(notebook, handle, scheme) {
        return CellUri.generate(notebook, handle).with({ scheme: scheme });
    }
    CellUri.generateCellPropertyUri = generateCellPropertyUri;
    function parseCellPropertyUri(uri, propertyScheme) {
        if (uri.scheme !== propertyScheme) {
            return undefined;
        }
        return CellUri.parse(uri.with({ scheme: CellUri.scheme }));
    }
    CellUri.parseCellPropertyUri = parseCellPropertyUri;
})(CellUri || (CellUri = {}));
const normalizeSlashes = (str) => isWindows ? str.replace(/\//g, '\\') : str;
export class MimeTypeDisplayOrder {
    constructor(initialValue = [], defaultOrder = NOTEBOOK_DISPLAY_ORDER) {
        this.defaultOrder = defaultOrder;
        this.order = [...new Set(initialValue)].map(pattern => ({
            pattern,
            matches: glob.parse(normalizeSlashes(pattern), { ignoreCase: true })
        }));
    }
    /**
     * Returns a sorted array of the input mimeTypes.
     */
    sort(mimeTypes) {
        const remaining = new Map(Iterable.map(mimeTypes, m => [m, normalizeSlashes(m)]));
        let sorted = [];
        for (const { matches } of this.order) {
            for (const [original, normalized] of remaining) {
                if (matches(normalized)) {
                    sorted.push(original);
                    remaining.delete(original);
                    break;
                }
            }
        }
        if (remaining.size) {
            sorted = sorted.concat([...remaining.keys()].sort((a, b) => this.defaultOrder.indexOf(a) - this.defaultOrder.indexOf(b)));
        }
        return sorted;
    }
    /**
     * Records that the user selected the given mimetype over the other
     * possible mimeTypes, prioritizing it for future reference.
     */
    prioritize(chosenMimetype, otherMimeTypes) {
        const chosenIndex = this.findIndex(chosenMimetype);
        if (chosenIndex === -1) {
            // always first, nothing more to do
            this.order.unshift({ pattern: chosenMimetype, matches: glob.parse(normalizeSlashes(chosenMimetype), { ignoreCase: true }) });
            return;
        }
        // Get the other mimeTypes that are before the chosenMimetype. Then, move
        // them after it, retaining order.
        const uniqueIndices = new Set(otherMimeTypes.map(m => this.findIndex(m, chosenIndex)));
        uniqueIndices.delete(-1);
        const otherIndices = Array.from(uniqueIndices).sort();
        this.order.splice(chosenIndex + 1, 0, ...otherIndices.map(i => this.order[i]));
        for (let oi = otherIndices.length - 1; oi >= 0; oi--) {
            this.order.splice(otherIndices[oi], 1);
        }
    }
    /**
     * Gets an array of in-order mimetype preferences.
     */
    toArray() {
        return this.order.map(o => o.pattern);
    }
    findIndex(mimeType, maxIndex = this.order.length) {
        const normalized = normalizeSlashes(mimeType);
        for (let i = 0; i < maxIndex; i++) {
            if (this.order[i].matches(normalized)) {
                return i;
            }
        }
        return -1;
    }
}
export function diff(before, after, contains, equal = (a, b) => a === b) {
    const result = [];
    function pushSplice(start, deleteCount, toInsert) {
        if (deleteCount === 0 && toInsert.length === 0) {
            return;
        }
        const latest = result[result.length - 1];
        if (latest && latest.start + latest.deleteCount === start) {
            latest.deleteCount += deleteCount;
            latest.toInsert.push(...toInsert);
        }
        else {
            result.push({ start, deleteCount, toInsert });
        }
    }
    let beforeIdx = 0;
    let afterIdx = 0;
    while (true) {
        if (beforeIdx === before.length) {
            pushSplice(beforeIdx, 0, after.slice(afterIdx));
            break;
        }
        if (afterIdx === after.length) {
            pushSplice(beforeIdx, before.length - beforeIdx, []);
            break;
        }
        const beforeElement = before[beforeIdx];
        const afterElement = after[afterIdx];
        if (equal(beforeElement, afterElement)) {
            // equal
            beforeIdx += 1;
            afterIdx += 1;
            continue;
        }
        if (contains(afterElement)) {
            // `afterElement` exists before, which means some elements before `afterElement` are deleted
            pushSplice(beforeIdx, 1, []);
            beforeIdx += 1;
        }
        else {
            // `afterElement` added
            pushSplice(beforeIdx, 0, [afterElement]);
            afterIdx += 1;
        }
    }
    return result;
}
export const NOTEBOOK_EDITOR_CURSOR_BOUNDARY = new RawContextKey('notebookEditorCursorAtBoundary', 'none');
export const NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY = new RawContextKey('notebookEditorCursorAtLineBoundary', 'none');
export var NotebookEditorPriority;
(function (NotebookEditorPriority) {
    NotebookEditorPriority["default"] = "default";
    NotebookEditorPriority["option"] = "option";
})(NotebookEditorPriority || (NotebookEditorPriority = {}));
export var NotebookFindScopeType;
(function (NotebookFindScopeType) {
    NotebookFindScopeType["Cells"] = "cells";
    NotebookFindScopeType["Text"] = "text";
    NotebookFindScopeType["None"] = "none";
})(NotebookFindScopeType || (NotebookFindScopeType = {}));
//TODO@rebornix test
export function isDocumentExcludePattern(filenamePattern) {
    const arg = filenamePattern;
    if ((typeof arg.include === 'string' || glob.isRelativePattern(arg.include))
        && (typeof arg.exclude === 'string' || glob.isRelativePattern(arg.exclude))) {
        return true;
    }
    return false;
}
export function notebookDocumentFilterMatch(filter, viewType, resource) {
    if (Array.isArray(filter.viewType) && filter.viewType.indexOf(viewType) >= 0) {
        return true;
    }
    if (filter.viewType === viewType) {
        return true;
    }
    if (filter.filenamePattern) {
        const filenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.include : filter.filenamePattern;
        const excludeFilenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.exclude : undefined;
        if (glob.match(filenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
            if (excludeFilenamePattern) {
                if (glob.match(excludeFilenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
                    // should exclude
                    return false;
                }
            }
            return true;
        }
    }
    return false;
}
export const NotebookSetting = {
    displayOrder: 'notebook.displayOrder',
    cellToolbarLocation: 'notebook.cellToolbarLocation',
    cellToolbarVisibility: 'notebook.cellToolbarVisibility',
    showCellStatusBar: 'notebook.showCellStatusBar',
    cellExecutionTimeVerbosity: 'notebook.cellExecutionTimeVerbosity',
    textDiffEditorPreview: 'notebook.diff.enablePreview',
    diffOverviewRuler: 'notebook.diff.overviewRuler',
    experimentalInsertToolbarAlignment: 'notebook.experimental.insertToolbarAlignment',
    compactView: 'notebook.compactView',
    focusIndicator: 'notebook.cellFocusIndicator',
    insertToolbarLocation: 'notebook.insertToolbarLocation',
    globalToolbar: 'notebook.globalToolbar',
    stickyScrollEnabled: 'notebook.stickyScroll.enabled',
    stickyScrollMode: 'notebook.stickyScroll.mode',
    undoRedoPerCell: 'notebook.undoRedoPerCell',
    consolidatedOutputButton: 'notebook.consolidatedOutputButton',
    openOutputInPreviewEditor: 'notebook.output.openInPreviewEditor.enabled',
    showFoldingControls: 'notebook.showFoldingControls',
    dragAndDropEnabled: 'notebook.dragAndDropEnabled',
    cellEditorOptionsCustomizations: 'notebook.editorOptionsCustomizations',
    consolidatedRunButton: 'notebook.consolidatedRunButton',
    openGettingStarted: 'notebook.experimental.openGettingStarted',
    globalToolbarShowLabel: 'notebook.globalToolbarShowLabel',
    markupFontSize: 'notebook.markup.fontSize',
    markdownLineHeight: 'notebook.markdown.lineHeight',
    interactiveWindowCollapseCodeCells: 'interactiveWindow.collapseCellInputCode',
    outputScrollingDeprecated: 'notebook.experimental.outputScrolling',
    outputScrolling: 'notebook.output.scrolling',
    textOutputLineLimit: 'notebook.output.textLineLimit',
    LinkifyOutputFilePaths: 'notebook.output.linkifyFilePaths',
    minimalErrorRendering: 'notebook.output.minimalErrorRendering',
    formatOnSave: 'notebook.formatOnSave.enabled',
    insertFinalNewline: 'notebook.insertFinalNewline',
    defaultFormatter: 'notebook.defaultFormatter',
    formatOnCellExecution: 'notebook.formatOnCellExecution',
    codeActionsOnSave: 'notebook.codeActionsOnSave',
    outputWordWrap: 'notebook.output.wordWrap',
    outputLineHeightDeprecated: 'notebook.outputLineHeight',
    outputLineHeight: 'notebook.output.lineHeight',
    outputFontSizeDeprecated: 'notebook.outputFontSize',
    outputFontSize: 'notebook.output.fontSize',
    outputFontFamilyDeprecated: 'notebook.outputFontFamily',
    outputFontFamily: 'notebook.output.fontFamily',
    findFilters: 'notebook.find.filters',
    logging: 'notebook.logging',
    confirmDeleteRunningCell: 'notebook.confirmDeleteRunningCell',
    remoteSaving: 'notebook.experimental.remoteSave',
    gotoSymbolsAllSymbols: 'notebook.gotoSymbols.showAllSymbols',
    outlineShowMarkdownHeadersOnly: 'notebook.outline.showMarkdownHeadersOnly',
    outlineShowCodeCells: 'notebook.outline.showCodeCells',
    outlineShowCodeCellSymbols: 'notebook.outline.showCodeCellSymbols',
    breadcrumbsShowCodeCells: 'notebook.breadcrumbs.showCodeCells',
    scrollToRevealCell: 'notebook.scrolling.revealNextCellOnExecute',
    cellChat: 'notebook.experimental.cellChat',
    cellGenerate: 'notebook.experimental.generate',
    notebookVariablesView: 'notebook.variablesView',
    notebookInlineValues: 'notebook.inlineValues',
    InteractiveWindowPromptToSave: 'interactiveWindow.promptToSaveOnClose',
    cellFailureDiagnostics: 'notebook.cellFailureDiagnostics',
    outputBackupSizeLimit: 'notebook.backup.sizeLimit',
    multiCursor: 'notebook.multiCursor.enabled',
    markupFontFamily: 'notebook.markup.fontFamily',
};
export var CellStatusbarAlignment;
(function (CellStatusbarAlignment) {
    CellStatusbarAlignment[CellStatusbarAlignment["Left"] = 1] = "Left";
    CellStatusbarAlignment[CellStatusbarAlignment["Right"] = 2] = "Right";
})(CellStatusbarAlignment || (CellStatusbarAlignment = {}));
export class NotebookWorkingCopyTypeIdentifier {
    static { this._prefix = 'notebook/'; }
    static create(notebookType, viewType) {
        return `${NotebookWorkingCopyTypeIdentifier._prefix}${notebookType}/${viewType ?? notebookType}`;
    }
    static parse(candidate) {
        if (candidate.startsWith(NotebookWorkingCopyTypeIdentifier._prefix)) {
            const split = candidate.substring(NotebookWorkingCopyTypeIdentifier._prefix.length).split('/');
            if (split.length === 2) {
                return { notebookType: split[0], viewType: split[1] };
            }
        }
        return undefined;
    }
}
const textDecoder = new TextDecoder();
/**
 * Given a stream of individual stdout outputs, this function will return the compressed lines, escaping some of the common terminal escape codes.
 * E.g. some terminal escape codes would result in the previous line getting cleared, such if we had 3 lines and
 * last line contained such a code, then the result string would be just the first two lines.
 * @returns a single VSBuffer with the concatenated and compressed data, and whether any compression was done.
 */
export function compressOutputItemStreams(outputs) {
    const buffers = [];
    let startAppending = false;
    // Pick the first set of outputs with the same mime type.
    for (const output of outputs) {
        if ((buffers.length === 0 || startAppending)) {
            buffers.push(output);
            startAppending = true;
        }
    }
    let didCompression = compressStreamBuffer(buffers);
    const concatenated = VSBuffer.concat(buffers.map(buffer => VSBuffer.wrap(buffer)));
    const data = formatStreamText(concatenated);
    didCompression = didCompression || data.byteLength !== concatenated.byteLength;
    return { data, didCompression };
}
export const MOVE_CURSOR_1_LINE_COMMAND = `${String.fromCharCode(27)}[A`;
const MOVE_CURSOR_1_LINE_COMMAND_BYTES = MOVE_CURSOR_1_LINE_COMMAND.split('').map(c => c.charCodeAt(0));
const LINE_FEED = 10;
function compressStreamBuffer(streams) {
    let didCompress = false;
    streams.forEach((stream, index) => {
        if (index === 0 || stream.length < MOVE_CURSOR_1_LINE_COMMAND.length) {
            return;
        }
        const previousStream = streams[index - 1];
        // Remove the previous line if required.
        const command = stream.subarray(0, MOVE_CURSOR_1_LINE_COMMAND.length);
        if (command[0] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[0] && command[1] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[1] && command[2] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[2]) {
            const lastIndexOfLineFeed = previousStream.lastIndexOf(LINE_FEED);
            if (lastIndexOfLineFeed === -1) {
                return;
            }
            didCompress = true;
            streams[index - 1] = previousStream.subarray(0, lastIndexOfLineFeed);
            streams[index] = stream.subarray(MOVE_CURSOR_1_LINE_COMMAND.length);
        }
    });
    return didCompress;
}
/**
 * Took this from jupyter/notebook
 * https://github.com/jupyter/notebook/blob/b8b66332e2023e83d2ee04f83d8814f567e01a4e/notebook/static/base/js/utils.js
 * Remove characters that are overridden by backspace characters
 */
function fixBackspace(txt) {
    let tmp = txt;
    do {
        txt = tmp;
        // Cancel out anything-but-newline followed by backspace
        tmp = txt.replace(/[^\n]\x08/gm, '');
    } while (tmp.length < txt.length);
    return txt;
}
/**
 * Remove chunks that should be overridden by the effect of carriage return characters
 * From https://github.com/jupyter/notebook/blob/master/notebook/static/base/js/utils.js
 */
function fixCarriageReturn(txt) {
    txt = txt.replace(/\r+\n/gm, '\n'); // \r followed by \n --> newline
    while (txt.search(/\r[^$]/g) > -1) {
        const base = txt.match(/^(.*)\r+/m)[1];
        let insert = txt.match(/\r+(.*)$/m)[1];
        insert = insert + base.slice(insert.length, base.length);
        txt = txt.replace(/\r+.*$/m, '\r').replace(/^.*\r/m, insert);
    }
    return txt;
}
const BACKSPACE_CHARACTER = '\b'.charCodeAt(0);
const CARRIAGE_RETURN_CHARACTER = '\r'.charCodeAt(0);
function formatStreamText(buffer) {
    // We have special handling for backspace and carriage return characters.
    // Don't unnecessary decode the bytes if we don't need to perform any processing.
    if (!buffer.buffer.includes(BACKSPACE_CHARACTER) && !buffer.buffer.includes(CARRIAGE_RETURN_CHARACTER)) {
        return buffer;
    }
    // Do the same thing jupyter is doing
    return VSBuffer.fromString(fixCarriageReturn(fixBackspace(textDecoder.decode(buffer.buffer))));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDb21tb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSTdELE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFFeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQVNoRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFVckYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsSUFBSSxXQUFXLEVBQUUsd0JBQXdCLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxJQUFJLFFBQVEsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBSTNMLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLDJCQUEyQixDQUFDO0FBQzlELE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLHlDQUF5QyxDQUFDO0FBQ2pGLE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLDhDQUE4QyxDQUFDO0FBQzVGLE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLDhCQUE4QixDQUFDO0FBQzNFLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyx1QkFBdUIsQ0FBQztBQUN0RCxNQUFNLENBQUMsTUFBTSx5QkFBeUIs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