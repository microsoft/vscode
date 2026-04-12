/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotebookInlineVariablesController_1;
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { format } from '../../../../../../base/common/strings.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../../nls.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { createInlineValueDecoration } from '../../../../debug/browser/debugEditorContribution.js';
import { IDebugService } from '../../../../debug/common/debug.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { NotebookAction } from '../../controller/coreActions.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
class InlineSegment {
    constructor(column, text) {
        this.column = column;
        this.text = text;
    }
}
let NotebookInlineVariablesController = class NotebookInlineVariablesController extends Disposable {
    static { NotebookInlineVariablesController_1 = this; }
    static { this.id = 'notebook.inlineVariablesController'; }
    static { this.MAX_CELL_LINES = 5000; } // Skip extremely large cells
    constructor(notebookEditor, notebookKernelService, notebookExecutionStateService, languageFeaturesService, configurationService, debugService) {
        super();
        this.notebookEditor = notebookEditor;
        this.notebookKernelService = notebookKernelService;
        this.notebookExecutionStateService = notebookExecutionStateService;
        this.languageFeaturesService = languageFeaturesService;
        this.configurationService = configurationService;
        this.debugService = debugService;
        this.cellDecorationIds = new Map();
        this.cellContentListeners = new ResourceMap();
        this.currentCancellationTokenSources = new ResourceMap();
        this._register(this.notebookExecutionStateService.onDidChangeExecution(async (e) => {
            const inlineValuesSetting = this.configurationService.getValue(NotebookSetting.notebookInlineValues);
            if (inlineValuesSetting === 'off') {
                return;
            }
            if (e.type === NotebookExecutionType.cell) {
                await this.updateInlineVariables(e);
            }
        }));
        this._register(Event.runAndSubscribe(this.configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration(NotebookSetting.notebookInlineValues)) {
                if (this.configurationService.getValue(NotebookSetting.notebookInlineValues) === 'off') {
                    this.clearNotebookInlineDecorations();
                }
            }
        }));
    }
    async updateInlineVariables(event) {
        if (event.changed) { // undefined -> execution was completed, so return on all else. no code should execute until we know it's an execution completion
            return;
        }
        const cell = this.notebookEditor.getCellByHandle(event.cellHandle);
        if (!cell) {
            return;
        }
        // Cancel any ongoing request in this cell
        const existingSource = this.currentCancellationTokenSources.get(cell.uri);
        if (existingSource) {
            existingSource.cancel();
        }
        // Create a new CancellationTokenSource for the new request per cell
        this.currentCancellationTokenSources.set(cell.uri, new CancellationTokenSource());
        const token = this.currentCancellationTokenSources.get(cell.uri).token;
        if (this.debugService.state !== 0 /* State.Inactive */) {
            this._clearNotebookInlineDecorations();
            return;
        }
        if (!this.notebookEditor.textModel?.uri || !isEqual(this.notebookEditor.textModel.uri, event.notebook)) {
            return;
        }
        const model = await cell.resolveTextModel();
        if (!model) {
            return;
        }
        const inlineValuesSetting = this.configurationService.getValue(NotebookSetting.notebookInlineValues);
        const hasInlineValueProvider = this.languageFeaturesService.inlineValuesProvider.has(model);
        // Skip if setting is off or if auto and no provider is registered
        if (inlineValuesSetting === 'off' || (inlineValuesSetting === 'auto' && !hasInlineValueProvider)) {
            return;
        }
        this.clearCellInlineDecorations(cell);
        const inlineDecorations = [];
        if (hasInlineValueProvider) {
            // use extension based provider, borrowed from https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L679
            const lastLine = model.getLineCount();
            const lastColumn = model.getLineMaxColumn(lastLine);
            const ctx = {
                frameId: 0, // ignored, we won't have a stack from since not in a debug session
                stoppedLocation: new Range(lastLine, lastColumn, lastLine, lastColumn) // executing cell by cell, so "stopped" location would just be the end of document
            };
            const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
            const lineDecorations = new Map();
            const fullCellRange = new Range(1, 1, lastLine, lastColumn);
            const promises = providers.flatMap(provider => Promise.resolve(provider.provideInlineValues(model, fullCellRange, ctx, token)).then(async (result) => {
                if (!result) {
                    return;
                }
                const notebook = this.notebookEditor.textModel;
                if (!notebook) {
                    return;
                }
                const kernel = this.notebookKernelService.getMatchingKernel(notebook);
                const kernelVars = [];
                if (result.some(iv => iv.type === 'variable')) { // if anyone will need a lookup, get vars now to avoid needing to do it multiple times
                    if (!this.notebookEditor.hasModel()) {
                        return; // should not happen, a cell will be executed
                    }
                    const variables = kernel.selected?.provideVariables(event.notebook, undefined, 'named', 0, token);
                    if (variables) {
                        for await (const v of variables) {
                            kernelVars.push(v);
                        }
                    }
                }
                for (const iv of result) {
                    let text = undefined;
                    switch (iv.type) {
                        case 'text':
                            text = iv.text;
                            break;
                        case 'variable': {
                            const name = iv.variableName;
                            if (!name) {
                                continue; // skip to next var, no valid name to lookup with
                            }
                            const value = kernelVars.find(v => v.name === name)?.value;
                            if (!value) {
                                continue;
                            }
                            text = format('{0} = {1}', name, value);
                            break;
                        }
                        case 'expression': {
                            continue; // no active debug session, so evaluate would break
                        }
                    }
                    if (text) {
                        const line = iv.range.startLineNumber;
                        let lineSegments = lineDecorations.get(line);
                        if (!lineSegments) {
                            lineSegments = [];
                            lineDecorations.set(line, lineSegments);
                        }
                        if (!lineSegments.some(iv => iv.text === text)) { // de-dupe
                            lineSegments.push(new InlineSegment(iv.range.startColumn, text));
                        }
                    }
                }
            }, err => {
                onUnexpectedExternalError(err);
            }));
            await Promise.all(promises);
            // sort line segments and concatenate them into a decoration
            lineDecorations.forEach((segments, line) => {
                if (segments.length > 0) {
                    segments.sort((a, b) => a.column - b.column);
                    const text = segments.map(s => s.text).join(', ');
                    const editorWidth = cell.layoutInfo.editorWidth;
                    const fontInfo = cell.layoutInfo.fontInfo;
                    if (fontInfo && cell.textModel) {
                        const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
                        const lineLength = cell.textModel.getLineLength(line);
                        const available = Math.max(0, base - lineLength);
                        inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb', undefined, available));
                    }
                    else {
                        inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb'));
                    }
                }
            });
        }
        else if (inlineValuesSetting === 'on') { // fallback approach only when setting is 'on'
            if (!this.notebookEditor.hasModel()) {
                return; // should not happen, a cell will be executed
            }
            const kernel = this.notebookKernelService.getMatchingKernel(this.notebookEditor.textModel);
            const variables = kernel?.selected?.provideVariables(event.notebook, undefined, 'named', 0, token);
            if (!variables) {
                return;
            }
            const vars = [];
            for await (const v of variables) {
                vars.push(v);
            }
            const varNames = vars.map(v => v.name);
            const document = cell.textModel;
            if (!document) {
                return;
            }
            // Skip processing for extremely large cells
            if (document.getLineCount() > NotebookInlineVariablesController_1.MAX_CELL_LINES) {
                return;
            }
            const processedVars = new Set();
            // Get both function ranges and comment ranges
            const functionRanges = this.getFunctionRanges(document);
            const commentedRanges = this.getCommentedRanges(document);
            const ignoredRanges = [...functionRanges, ...commentedRanges];
            const lineDecorations = new Map();
            // For each variable name found in the kernel results
            for (const varName of varNames) {
                if (processedVars.has(varName)) {
                    continue;
                }
                // Look for variable usage globally - using word boundaries to ensure exact matches
                const regex = new RegExp(`\\b${varName}\\b(?!\\w)`, 'g');
                let lastMatchOutsideIgnored = null;
                let foundMatch = false;
                // Scan lines in reverse to find last occurrence first
                const lines = document.getValue().split('\n');
                for (let lineNumber = lines.length - 1; lineNumber >= 0; lineNumber--) {
                    const line = lines[lineNumber];
                    let match;
                    while ((match = regex.exec(line)) !== null) {
                        const startIndex = match.index;
                        const pos = new Position(lineNumber + 1, startIndex + 1);
                        // Check if this position is in any ignored range (function or comment)
                        if (!this.isPositionInRanges(pos, ignoredRanges)) {
                            lastMatchOutsideIgnored = {
                                line: lineNumber + 1,
                                column: startIndex + 1
                            };
                            foundMatch = true;
                            break; // Take first match in reverse order (which is last chronologically)
                        }
                    }
                    if (foundMatch) {
                        break; // We found our last valid occurrence, no need to check earlier lines
                    }
                }
                if (lastMatchOutsideIgnored) {
                    const inlineVal = varName + ' = ' + vars.find(v => v.name === varName)?.value;
                    let lineSegments = lineDecorations.get(lastMatchOutsideIgnored.line);
                    if (!lineSegments) {
                        lineSegments = [];
                        lineDecorations.set(lastMatchOutsideIgnored.line, lineSegments);
                    }
                    if (!lineSegments.some(iv => iv.text === inlineVal)) { // de-dupe
                        lineSegments.push(new InlineSegment(lastMatchOutsideIgnored.column, inlineVal));
                    }
                }
                processedVars.add(varName);
            }
            // sort line segments and concatenate them into a decoration
            lineDecorations.forEach((segments, line) => {
                if (segments.length > 0) {
                    segments.sort((a, b) => a.column - b.column);
                    const text = segments.map(s => s.text).join(', ');
                    const editorWidth = cell.layoutInfo.editorWidth;
                    const fontInfo = cell.layoutInfo.fontInfo;
                    if (fontInfo && cell.textModel) {
                        const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
                        const lineLength = cell.textModel.getLineLength(line);
                        const available = Math.max(0, base - lineLength);
                        inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb', undefined, available));
                    }
                    else {
                        inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb'));
                    }
                }
            });
        }
        if (inlineDecorations.length > 0) {
            this.updateCellInlineDecorations(cell, inlineDecorations);
            this.initCellContentListener(cell);
        }
    }
    getFunctionRanges(document) {
        return document.getLanguageId() === 'python'
            ? this.getPythonFunctionRanges(document.getValue())
            : this.getBracedFunctionRanges(document.getValue());
    }
    getPythonFunctionRanges(code) {
        const functionRanges = [];
        const lines = code.split('\n');
        let functionStartLine = -1;
        let inFunction = false;
        let pythonIndentLevel = -1;
        const pythonFunctionDeclRegex = /^(\s*)(async\s+)?(?:def\s+\w+|class\s+\w+)\s*\([^)]*\)\s*:/;
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            // Check for Python function/class declarations
            const pythonMatch = line.match(pythonFunctionDeclRegex);
            if (pythonMatch) {
                if (inFunction) {
                    // If we're already in a function and find another at the same or lower indent, close the current one
                    const currentIndent = pythonMatch[1].length;
                    if (currentIndent <= pythonIndentLevel) {
                        functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
                        inFunction = false;
                    }
                }
                if (!inFunction) {
                    inFunction = true;
                    functionStartLine = lineNumber;
                    pythonIndentLevel = pythonMatch[1].length;
                }
                continue;
            }
            // Check indentation for Python functions
            if (inFunction) {
                // Skip empty lines
                if (line.trim() === '') {
                    continue;
                }
                // Get the indentation of the current line
                const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
                // If we hit a line with same or lower indentation than where the function started,
                // we've exited the function
                if (currentIndent <= pythonIndentLevel) {
                    functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
                    inFunction = false;
                    pythonIndentLevel = -1;
                }
            }
        }
        // Handle case where Python function is at the end of the document
        if (inFunction) {
            functionRanges.push(new Range(functionStartLine + 1, 1, lines.length, lines[lines.length - 1].length + 1));
        }
        return functionRanges;
    }
    getBracedFunctionRanges(code) {
        const functionRanges = [];
        const lines = code.split('\n');
        let braceDepth = 0;
        let functionStartLine = -1;
        let inFunction = false;
        const functionDeclRegex = /\b(?:function\s+\w+|(?:async\s+)?(?:\w+\s*=\s*)?\([^)]*\)\s*=>|class\s+\w+|(?:public|private|protected|static)?\s*\w+\s*\([^)]*\)\s*{)/;
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            for (const char of line) {
                if (char === '{') {
                    if (!inFunction && functionDeclRegex.test(line)) {
                        inFunction = true;
                        functionStartLine = lineNumber;
                    }
                    braceDepth++;
                }
                else if (char === '}') {
                    braceDepth--;
                    if (braceDepth === 0 && inFunction) {
                        functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber + 1, line.length + 1));
                        inFunction = false;
                    }
                }
            }
        }
        return functionRanges;
    }
    getCommentedRanges(document) {
        return this._getCommentedRanges(document);
    }
    _getCommentedRanges(document) {
        try {
            return this.getCommentedRangesByAccurateTokenization(document);
        }
        catch (e) {
            // Fall back to manual parsing if tokenization fails
            return this.getCommentedRangesByManualParsing(document);
        }
    }
    getCommentedRangesByAccurateTokenization(document) {
        const commentRanges = [];
        const lineCount = document.getLineCount();
        // Skip processing for extremely large documents
        if (lineCount > NotebookInlineVariablesController_1.MAX_CELL_LINES) {
            return commentRanges;
        }
        // Process each line - force tokenization if needed and process tokens in a single pass
        for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
            // Force tokenization if needed
            if (!document.tokenization.hasAccurateTokensForLine(lineNumber)) {
                document.tokenization.forceTokenization(lineNumber);
            }
            const lineTokens = document.tokenization.getLineTokens(lineNumber);
            // Skip lines with no tokens
            if (lineTokens.getCount() === 0) {
                continue;
            }
            let startCharacter;
            // Check each token in the line
            for (let tokenIndex = 0; tokenIndex < lineTokens.getCount(); tokenIndex++) {
                const tokenType = lineTokens.getStandardTokenType(tokenIndex);
                if (tokenType === 1 /* StandardTokenType.Comment */ || tokenType === 2 /* StandardTokenType.String */ || tokenType === 3 /* StandardTokenType.RegEx */) {
                    if (startCharacter === undefined) {
                        // Start of a comment or string
                        startCharacter = lineTokens.getStartOffset(tokenIndex);
                    }
                    const endCharacter = lineTokens.getEndOffset(tokenIndex);
                    // Check if this is the end of the comment/string section (either end of line or different token type follows)
                    const isLastToken = tokenIndex === lineTokens.getCount() - 1;
                    const nextTokenDifferent = !isLastToken &&
                        lineTokens.getStandardTokenType(tokenIndex + 1) !== tokenType;
                    if (isLastToken || nextTokenDifferent) {
                        // End of comment/string section
                        commentRanges.push(new Range(lineNumber, startCharacter + 1, lineNumber, endCharacter + 1));
                        startCharacter = undefined;
                    }
                }
                else {
                    // Reset when we hit a non-comment, non-string token
                    startCharacter = undefined;
                }
            }
        }
        return commentRanges;
    }
    getCommentedRangesByManualParsing(document) {
        const commentRanges = [];
        const lines = document.getValue().split('\n');
        const languageId = document.getLanguageId();
        // Different comment patterns by language
        const lineCommentToken = languageId === 'python' ? '#' :
            languageId === 'javascript' || languageId === 'typescript' ? '//' :
                null;
        const blockComments = (languageId === 'javascript' || languageId === 'typescript') ? { start: '/*', end: '*/' } :
            null;
        let inBlockComment = false;
        let blockCommentStartLine = -1;
        let blockCommentStartCol = -1;
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            const trimmedLine = line.trim();
            // Skip empty lines
            if (trimmedLine.length === 0) {
                continue;
            }
            if (blockComments) {
                if (!inBlockComment) {
                    const startIndex = line.indexOf(blockComments.start);
                    if (startIndex !== -1) {
                        inBlockComment = true;
                        blockCommentStartLine = lineNumber;
                        blockCommentStartCol = startIndex;
                    }
                }
                if (inBlockComment) {
                    const endIndex = line.indexOf(blockComments.end);
                    if (endIndex !== -1) {
                        commentRanges.push(new Range(blockCommentStartLine + 1, blockCommentStartCol + 1, lineNumber + 1, endIndex + blockComments.end.length + 1));
                        inBlockComment = false;
                    }
                    continue;
                }
            }
            if (!inBlockComment && lineCommentToken && line.trimLeft().startsWith(lineCommentToken)) {
                const startCol = line.indexOf(lineCommentToken);
                commentRanges.push(new Range(lineNumber + 1, startCol + 1, lineNumber + 1, line.length + 1));
            }
        }
        // Handle block comment at end of file
        if (inBlockComment) {
            commentRanges.push(new Range(blockCommentStartLine + 1, blockCommentStartCol + 1, lines.length, lines[lines.length - 1].length + 1));
        }
        return commentRanges;
    }
    isPositionInRanges(position, ranges) {
        return ranges.some(range => range.containsPosition(position));
    }
    updateCellInlineDecorations(cell, decorations) {
        const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
        this.cellDecorationIds.set(cell, cell.deltaModelDecorations(oldDecorations, decorations));
    }
    initCellContentListener(cell) {
        const cellModel = cell.textModel;
        if (!cellModel) {
            return; // should not happen
        }
        // Clear decorations on content change
        this.cellContentListeners.set(cell.uri, cellModel.onDidChangeContent(() => {
            this.clearCellInlineDecorations(cell);
        }));
    }
    clearCellInlineDecorations(cell) {
        const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
        if (cellDecorations) {
            cell.deltaModelDecorations(cellDecorations, []);
            this.cellDecorationIds.delete(cell);
        }
        const listener = this.cellContentListeners.get(cell.uri);
        if (listener) {
            listener.dispose();
            this.cellContentListeners.delete(cell.uri);
        }
    }
    _clearNotebookInlineDecorations() {
        this.cellDecorationIds.forEach((_, cell) => {
            this.clearCellInlineDecorations(cell);
        });
    }
    clearNotebookInlineDecorations() {
        this._clearNotebookInlineDecorations();
    }
    dispose() {
        super.dispose();
        this._clearNotebookInlineDecorations();
        this.currentCancellationTokenSources.forEach(source => source.cancel());
        this.currentCancellationTokenSources.clear();
        this.cellContentListeners.forEach(listener => listener.dispose());
        this.cellContentListeners.clear();
    }
};
NotebookInlineVariablesController = NotebookInlineVariablesController_1 = __decorate([
    __param(1, INotebookKernelService),
    __param(2, INotebookExecutionStateService),
    __param(3, ILanguageFeaturesService),
    __param(4, IConfigurationService),
    __param(5, IDebugService)
], NotebookInlineVariablesController);
export { NotebookInlineVariablesController };
registerNotebookContribution(NotebookInlineVariablesController.id, NotebookInlineVariablesController);
registerAction2(class ClearNotebookInlineValues extends NotebookAction {
    constructor() {
        super({
            id: 'notebook.clearAllInlineValues',
            title: localize('clearAllInlineValues', 'Clear All Inline Values'),
        });
    }
    runWithContext(accessor, context) {
        const editor = context.notebookEditor;
        const controller = editor.getContribution(NotebookInlineVariablesController.id);
        controller.clearNotebookInlineDecorations();
        return Promise.resolve();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tJbmxpbmVWYXJpYWJsZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvbm90ZWJvb2tWYXJpYWJsZXMvbm90ZWJvb2tJbmxpbmVWYXJpYWJsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUl0RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXpHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQVMsTUFBTSxt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