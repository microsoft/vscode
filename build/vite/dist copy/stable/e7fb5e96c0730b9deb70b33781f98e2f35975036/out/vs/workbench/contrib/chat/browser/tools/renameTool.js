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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { rename } from '../../../../../editor/contrib/rename/browser/rename.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { errorResult, findLineNumber, findSymbolColumn, resolveToolUri } from './toolHelpers.js';
export const RenameToolId = 'vscode_renameSymbol';
const BaseModelDescription = `Rename a code symbol across the workspace using the language server's rename functionality. This performs a precise, semantics-aware rename that updates all references.

Input:
- "symbol": The exact current name of the symbol to rename.
- "newName": The new name for the symbol.
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;
let RenameTool = class RenameTool extends Disposable {
    constructor(_languageFeaturesService, _languageService, _textModelService, _workspaceContextService, _chatService, _bulkEditService) {
        super();
        this._languageFeaturesService = _languageFeaturesService;
        this._languageService = _languageService;
        this._textModelService = _textModelService;
        this._workspaceContextService = _workspaceContextService;
        this._chatService = _chatService;
        this._bulkEditService = _bulkEditService;
        this._onDidUpdateToolData = this._store.add(new Emitter());
        this.onDidUpdateToolData = this._onDidUpdateToolData.event;
        this._store.add(Event.debounce(this._languageFeaturesService.renameProvider.onDidChange, () => { }, 2000)((() => this._onDidUpdateToolData.fire())));
    }
    getToolData() {
        const languageIds = this._languageFeaturesService.renameProvider.registeredLanguageIds;
        if (languageIds.size === 0) {
            return undefined;
        }
        let modelDescription = BaseModelDescription;
        let userDescription;
        if (languageIds.has('*')) {
            modelDescription += '\n\nSupported for all languages.';
            userDescription = localize('tool.rename.userDescription', 'Rename a symbol across the workspace');
        }
        else {
            const sorted = [...languageIds].sort();
            modelDescription += `\n\nCurrently supported for: ${sorted.join(', ')}.`;
            const niceNames = sorted.map(id => this._languageService.getLanguageName(id) ?? id);
            userDescription = localize('tool.rename.userDescriptionWithLanguages', 'Rename a symbol across the workspace ({0})', niceNames.join(', '));
        }
        return {
            id: RenameToolId,
            toolReferenceName: 'rename',
            canBeReferencedInPrompt: false,
            icon: ThemeIcon.fromId(Codicon.rename.id),
            displayName: localize('tool.rename.displayName', 'Rename Symbol'),
            userDescription,
            modelDescription,
            source: ToolDataSource.Internal,
            when: ContextKeyExpr.has('config.chat.tools.renameTool.enabled'),
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: {
                        type: 'string',
                        description: 'The exact current name of the symbol to rename.'
                    },
                    newName: {
                        type: 'string',
                        description: 'The new name for the symbol.'
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
                required: ['symbol', 'newName', 'lineContent']
            }
        };
    }
    async prepareToolInvocation(context, _token) {
        const input = context.parameters;
        return {
            invocationMessage: localize('tool.rename.invocationMessage', 'Renaming `{0}` to `{1}`', input.symbol, input.newName),
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
            if (!this._languageFeaturesService.renameProvider.has(model)) {
                return errorResult(`No rename provider available for this file's language. The rename tool may not support this language.`);
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
            // --- perform rename ---
            const renameResult = await rename(this._languageFeaturesService.renameProvider, model, position, input.newName);
            if (renameResult.rejectReason) {
                return errorResult(`Rename rejected: ${renameResult.rejectReason}`);
            }
            if (renameResult.edits.length === 0) {
                return errorResult(`Rename produced no edits.`);
            }
            // --- apply edits via chat response stream ---
            if (invocation.context) {
                const chatModel = this._chatService.getSession(invocation.context.sessionResource);
                const request = chatModel?.getRequests().at(-1);
                if (chatModel && request) {
                    // Group text edits by URI
                    const editsByUri = new ResourceMap();
                    for (const edit of renameResult.edits) {
                        if (ResourceTextEdit.is(edit)) {
                            let edits = editsByUri.get(edit.resource);
                            if (!edits) {
                                edits = [];
                                editsByUri.set(edit.resource, edits);
                            }
                            edits.push(edit.textEdit);
                        }
                    }
                    // Push edits through the chat response stream
                    for (const [editUri, edits] of editsByUri) {
                        chatModel.acceptResponseProgress(request, {
                            kind: 'textEdit',
                            uri: editUri,
                            edits: [],
                        });
                        chatModel.acceptResponseProgress(request, {
                            kind: 'textEdit',
                            uri: editUri,
                            edits,
                        });
                        chatModel.acceptResponseProgress(request, {
                            kind: 'textEdit',
                            uri: editUri,
                            edits: [],
                            done: true,
                        });
                    }
                    return this._successResult(input, editsByUri.size, renameResult.edits.length);
                }
            }
            // Fallback: apply via bulk edit service when no chat context is available
            await this._bulkEditService.apply(renameResult);
            const fileCount = new ResourceSet(renameResult.edits.filter(ResourceTextEdit.is).map(e => e.resource)).size;
            return this._successResult(input, fileCount, renameResult.edits.length);
        }
        finally {
            ref.dispose();
        }
    }
    _successResult(input, fileCount, editCount) {
        const text = editCount === 1
            ? localize('tool.rename.oneEdit', "Renamed `{0}` to `{1}` - 1 edit in {2} file.", input.symbol, input.newName, fileCount)
            : localize('tool.rename.edits', "Renamed `{0}` to `{1}` - {2} edits across {3} files.", input.symbol, input.newName, editCount, fileCount);
        const result = createToolSimpleTextResult(text);
        result.toolResultMessage = new MarkdownString(text);
        return result;
    }
};
RenameTool = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, ILanguageService),
    __param(2, ITextModelService),
    __param(3, IWorkspaceContextService),
    __param(4, IChatService),
    __param(5, IBulkEditService)
], RenameTool);
export { RenameTool };
let RenameToolContribution = class RenameToolContribution extends Disposable {
    static { this.ID = 'chat.renameTool'; }
    constructor(toolsService, instantiationService) {
        super();
        const renameTool = this._store.add(instantiationService.createInstance(RenameTool));
        let registration;
        const registerRenameTool = () => {
            registration?.dispose();
            registration = undefined;
            toolsService.flushToolUpdates();
            const toolData = renameTool.getToolData();
            if (toolData) {
                registration = toolsService.registerTool(toolData, renameTool);
            }
        };
        registerRenameTool();
        this._store.add(renameTool.onDidUpdateToolData(registerRenameTool));
        this._store.add({
            dispose: () => {
                registration?.dispose();
            }
        });
    }
};
RenameToolContribution = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IInstantiationService)
], RenameToolContribution);
export { RenameToolContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9yZW5hbWVUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9B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