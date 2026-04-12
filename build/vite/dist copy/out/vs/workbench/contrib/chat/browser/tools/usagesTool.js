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
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isEqual, relativePath } from '../../../../../base/common/resources.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition } from '../../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ISearchService, resultIsMatch } from '../../../../services/search/common/search.js';
import { ILanguageModelToolsService, ToolDataSource, } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { errorResult, findLineNumber, findSymbolColumn, resolveToolUri } from './toolHelpers.js';
export const UsagesToolId = 'vscode_listCodeUsages';
const BaseModelDescription = `Find all usages (references, definitions, and implementations) of a code symbol across the workspace. This tool locates where a symbol is referenced, defined, or implemented.

Input:
- "symbol": The exact name of the symbol to search for (function, class, method, variable, type, etc.).
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;
let UsagesTool = class UsagesTool extends Disposable {
    constructor(_languageFeaturesService, _languageService, _modelService, _searchService, _textModelService, _workspaceContextService) {
        super();
        this._languageFeaturesService = _languageFeaturesService;
        this._languageService = _languageService;
        this._modelService = _modelService;
        this._searchService = _searchService;
        this._textModelService = _textModelService;
        this._workspaceContextService = _workspaceContextService;
        this._onDidUpdateToolData = this._store.add(new Emitter());
        this.onDidUpdateToolData = this._onDidUpdateToolData.event;
        this._store.add(Event.debounce(this._languageFeaturesService.referenceProvider.onDidChange, () => { }, 2000)((() => this._onDidUpdateToolData.fire())));
    }
    getToolData() {
        const languageIds = this._languageFeaturesService.referenceProvider.registeredLanguageIds;
        if (languageIds.size === 0) {
            return undefined;
        }
        let modelDescription = BaseModelDescription;
        let userDescription;
        if (languageIds.has('*')) {
            modelDescription += '\n\nSupported for all languages.';
            userDescription = localize('tool.usages.userDescription', 'Find references, definitions, and implementations of a symbol');
        }
        else {
            const sorted = [...languageIds].sort();
            modelDescription += `\n\nCurrently supported for: ${sorted.join(', ')}.`;
            const niceNames = sorted.map(id => this._languageService.getLanguageName(id) ?? id);
            userDescription = localize('tool.usages.userDescriptionWithLanguages', 'Find references, definitions, and implementations of a symbol ({0})', niceNames.join(', '));
        }
        return {
            id: UsagesToolId,
            toolReferenceName: 'usages',
            canBeReferencedInPrompt: false,
            icon: ThemeIcon.fromId(Codicon.references.id),
            displayName: localize('tool.usages.displayName', 'List Code Usages'),
            userDescription,
            modelDescription,
            source: ToolDataSource.Internal,
            when: ContextKeyExpr.has('config.chat.tools.usagesTool.enabled'),
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: {
                        type: 'string',
                        description: 'The exact name of the symbol (function, class, method, variable, type, etc.) to find usages of.'
                    },
                    uri: {
                        type: 'string',
                        description: 'A full URI of a file where the symbol appears (e.g. "file:///path/to/file.ts"). Provide either "uri" or "filePath".'
                    },
                    filePath: {
                        type: 'string',
                        description: 'A workspace-relative file path where the symbol appears (e.g. "src/utils/helpers.ts"). Provide either "uri" or "filePath".'
                    },
                    lineContent: {
                        type: 'string',
                        description: 'A substring of the line of code where the symbol appears. Used to locate the exact position. Must be actual text from the file.'
                    }
                },
                required: ['symbol', 'lineContent']
            }
        };
    }
    async prepareToolInvocation(context, _token) {
        const input = context.parameters;
        return {
            invocationMessage: localize('tool.usages.invocationMessage', 'Analyzing usages of `{0}`', input.symbol),
        };
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const input = invocation.parameters;
        // --- resolve URI ---
        const uri = resolveToolUri(input, this._workspaceContextService);
        if (!uri) {
            return errorResult('Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify the file.');
        }
        // --- open text model ---
        const ref = await this._textModelService.createModelReference(uri);
        try {
            const model = ref.object.textEditorModel;
            if (!this._languageFeaturesService.referenceProvider.has(model)) {
                return errorResult(`No reference provider available for this file's language. The usages tool may not support this language.`);
            }
            // --- find line containing lineContent ---
            const lineNumber = findLineNumber(model, input.lineContent);
            if (lineNumber === undefined) {
                return errorResult(`Could not find line content "${input.lineContent}" in ${uri.toString()}. Provide the exact text from the line where the symbol appears.`);
            }
            // --- find symbol in that line ---
            const lineText = model.getLineContent(lineNumber);
            const column = findSymbolColumn(lineText, input.symbol);
            if (column === undefined) {
                return errorResult(`Could not find symbol "${input.symbol}" in the matched line. Ensure the symbol name is correct and appears in the provided line content.`);
            }
            const position = new Position(lineNumber, column);
            // --- query references, definitions, implementations in parallel ---
            const [definitions, references, implementations] = await Promise.all([
                getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, model, position, false, token),
                getReferencesAtPosition(this._languageFeaturesService.referenceProvider, model, position, false, false, token),
                getImplementationsAtPosition(this._languageFeaturesService.implementationProvider, model, position, false, token),
            ]);
            if (references.length === 0) {
                const result = createToolSimpleTextResult(`No usages found for \`${input.symbol}\`.`);
                result.toolResultMessage = new MarkdownString(localize('tool.usages.noResults', 'Analyzed usages of `{0}`, no results', input.symbol));
                return result;
            }
            // --- classify and format results with previews ---
            const previews = await this._getLinePreviews(input.symbol, references, token);
            const lines = [];
            lines.push(`${references.length} usages of \`${input.symbol}\`:\n`);
            for (let i = 0; i < references.length; i++) {
                const ref = references[i];
                const kind = this._classifyReference(ref, definitions, implementations);
                const startLine = Range.lift(ref.range).startLineNumber;
                const preview = previews[i];
                if (preview) {
                    lines.push(`<usage type="${kind}" uri="${ref.uri.toString()}" line="${startLine}">`);
                    lines.push(`\t${preview}`);
                    lines.push(`</usage>`);
                }
                else {
                    lines.push(`<usage type="${kind}" uri="${ref.uri.toString()}" line="${startLine}" />`);
                }
            }
            const text = lines.join('\n');
            const result = createToolSimpleTextResult(text);
            result.toolResultMessage = references.length === 1
                ? new MarkdownString(localize('tool.usages.oneResult', 'Analyzed usages of `{0}`, 1 result', input.symbol))
                : new MarkdownString(localize('tool.usages.results', 'Analyzed usages of `{0}`, {1} results', input.symbol, references.length));
            result.toolResultDetails = references.map((r) => ({ uri: r.uri, range: r.range }));
            return result;
        }
        finally {
            ref.dispose();
        }
    }
    async _getLinePreviews(symbol, references, token) {
        const previews = new Array(references.length);
        // Build a lookup: (uriString, lineNumber) → index in references array
        const lookup = new Map();
        const needSearch = new ResourceSet();
        for (let i = 0; i < references.length; i++) {
            const ref = references[i];
            const lineNumber = Range.lift(ref.range).startLineNumber;
            // Try already-open models first
            const existingModel = this._modelService.getModel(ref.uri);
            if (existingModel) {
                previews[i] = existingModel.getLineContent(lineNumber).trim();
            }
            else {
                lookup.set(`${ref.uri.toString()}:${lineNumber}`, i);
                needSearch.add(ref.uri);
            }
        }
        if (needSearch.size === 0 || token.isCancellationRequested) {
            return previews;
        }
        // Use ISearchService to search for the symbol name, restricted to the
        // referenced files. This is backed by ripgrep for file:// URIs.
        try {
            // Build includePattern from workspace-relative paths
            const folders = this._workspaceContextService.getWorkspace().folders;
            const relativePaths = [];
            for (const uri of needSearch) {
                const folder = this._workspaceContextService.getWorkspaceFolder(uri);
                if (folder) {
                    const rel = relativePath(folder.uri, uri);
                    if (rel) {
                        relativePaths.push(rel);
                    }
                }
            }
            if (relativePaths.length > 0) {
                const includePattern = {};
                if (relativePaths.length === 1) {
                    includePattern[relativePaths[0]] = true;
                }
                else {
                    includePattern[`{${relativePaths.join(',')}}`] = true;
                }
                const searchResult = await this._searchService.textSearch({
                    type: 2 /* QueryType.Text */,
                    contentPattern: { pattern: escapeRegExpCharacters(symbol), isRegExp: true, isWordMatch: true },
                    folderQueries: folders.map(f => ({ folder: f.uri })),
                    includePattern,
                }, token);
                for (const fileMatch of searchResult.results) {
                    if (!fileMatch.results) {
                        continue;
                    }
                    for (const textMatch of fileMatch.results) {
                        if (!resultIsMatch(textMatch)) {
                            continue;
                        }
                        for (const range of textMatch.rangeLocations) {
                            const lineNumber = range.source.startLineNumber + 1; // 0-based → 1-based
                            const key = `${fileMatch.resource.toString()}:${lineNumber}`;
                            const idx = lookup.get(key);
                            if (idx !== undefined) {
                                previews[idx] = textMatch.previewText.trim();
                                lookup.delete(key);
                            }
                        }
                    }
                }
            }
        }
        catch {
            // search might fail, leave remaining previews as undefined
        }
        return previews;
    }
    _classifyReference(ref, definitions, implementations) {
        if (definitions.some(d => this._overlaps(ref, d))) {
            return 'definition';
        }
        if (implementations.some(d => this._overlaps(ref, d))) {
            return 'implementation';
        }
        return 'reference';
    }
    _overlaps(a, b) {
        if (!isEqual(a.uri, b.uri)) {
            return false;
        }
        return Range.areIntersectingOrTouching(a.range, b.range);
    }
};
UsagesTool = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, ILanguageService),
    __param(2, IModelService),
    __param(3, ISearchService),
    __param(4, ITextModelService),
    __param(5, IWorkspaceContextService)
], UsagesTool);
export { UsagesTool };
let UsagesToolContribution = class UsagesToolContribution extends Disposable {
    static { this.ID = 'chat.usagesTool'; }
    constructor(toolsService, instantiationService) {
        super();
        const usagesTool = this._store.add(instantiationService.createInstance(UsagesTool));
        let registration;
        const registerUsagesTool = () => {
            registration?.dispose();
            registration = undefined;
            toolsService.flushToolUpdates();
            const toolData = usagesTool.getToolData();
            if (toolData) {
                registration = toolsService.registerTool(toolData, usagesTool);
            }
        };
        registerUsagesTool();
        this._store.add(usagesTool.onDidUpdateToolData(registerUsagesTool));
        this._store.add({ dispose: () => registration?.dispose() });
    }
};
UsagesToolContribution = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IInstantiationService)
], UsagesToolContribution);
export { UsagesToolContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2VzVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy91c2FnZXNUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSw0QkFBNEIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGdFQUFnRSxD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