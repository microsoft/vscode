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
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CellUri } from '../../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { ICodeMapperService } from '../../editing/chatCodeMapperService.js';
import { IChatService } from '../../chatService/chatService.js';
import { ToolDataSource, ToolInvocationPresentation } from '../languageModelToolsService.js';
export const ExtensionEditToolId = 'vscode_editFile';
export const InternalEditToolId = 'vscode_editFile_internal';
export const EditToolData = {
    id: InternalEditToolId,
    displayName: '', // not used
    modelDescription: '', // Not used
    source: ToolDataSource.Internal,
};
let EditTool = class EditTool {
    constructor(chatService, codeMapperService, notebookService) {
        this.chatService = chatService;
        this.codeMapperService = codeMapperService;
        this.notebookService = notebookService;
    }
    async invoke(invocation, countTokens, _progress, token) {
        if (!invocation.context) {
            throw new Error('toolInvocationToken is required for this tool');
        }
        const parameters = invocation.parameters;
        const fileUri = URI.revive(parameters.uri);
        const uri = CellUri.parse(fileUri)?.notebook || fileUri;
        const model = this.chatService.getSession(invocation.context.sessionResource);
        const request = model.getRequests().at(-1);
        model.acceptResponseProgress(request, {
            kind: 'markdownContent',
            content: new MarkdownString('\n````\n')
        });
        model.acceptResponseProgress(request, {
            kind: 'codeblockUri',
            uri,
            isEdit: true
        });
        model.acceptResponseProgress(request, {
            kind: 'markdownContent',
            content: new MarkdownString('\n````\n')
        });
        // Signal start.
        if (this.notebookService.hasSupportedNotebooks(uri) && (this.notebookService.getNotebookTextModel(uri))) {
            model.acceptResponseProgress(request, {
                kind: 'notebookEdit',
                edits: [],
                uri
            });
        }
        else {
            model.acceptResponseProgress(request, {
                kind: 'textEdit',
                edits: [],
                uri
            });
        }
        const editSession = model.editingSession;
        if (!editSession) {
            throw new Error('This tool must be called from within an editing session');
        }
        const result = await this.codeMapperService.mapCode({
            codeBlocks: [{ code: parameters.code, resource: uri, markdownBeforeBlock: parameters.explanation }],
            location: 'tool',
            chatRequestId: invocation.chatRequestId,
            chatRequestModel: invocation.modelId,
            chatSessionResource: invocation.context.sessionResource,
        }, {
            textEdit: (target, edits) => {
                model.acceptResponseProgress(request, { kind: 'textEdit', uri: target, edits });
            },
            notebookEdit(target, edits) {
                model.acceptResponseProgress(request, { kind: 'notebookEdit', uri: target, edits });
            },
        }, token);
        // Signal end.
        if (this.notebookService.hasSupportedNotebooks(uri) && (this.notebookService.getNotebookTextModel(uri))) {
            model.acceptResponseProgress(request, { kind: 'notebookEdit', uri, edits: [], done: true });
        }
        else {
            model.acceptResponseProgress(request, { kind: 'textEdit', uri, edits: [], done: true });
        }
        if (result?.errorMessage) {
            throw new Error(result.errorMessage);
        }
        let dispose;
        await new Promise((resolve) => {
            // The file will not be modified until the first edits start streaming in,
            // so wait until we see that it _was_ modified before waiting for it to be done.
            let wasFileBeingModified = false;
            dispose = autorun((r) => {
                const entries = editSession.entries.read(r);
                const currentFile = entries?.find((e) => isEqual(e.modifiedURI, uri));
                if (currentFile) {
                    if (currentFile.isCurrentlyBeingModifiedBy.read(r)) {
                        wasFileBeingModified = true;
                    }
                    else if (wasFileBeingModified) {
                        resolve(true);
                    }
                }
            });
        }).finally(() => {
            dispose.dispose();
        });
        return {
            content: [{ kind: 'text', value: 'The file was edited successfully' }]
        };
    }
    async prepareToolInvocation(context, token) {
        return {
            presentation: ToolInvocationPresentation.Hidden
        };
    }
};
EditTool = __decorate([
    __param(0, IChatService),
    __param(1, ICodeMapperService),
    __param(2, INotebookService)
], EditTool);
export { EditTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdEZpbGVUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2VkaXRGaWxlVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEUsT0FBTyxFQUF1SSxjQUFjLEVBQUUsMEJBQTBCLEVBQWdCLE1BQU0saUNBQWlDLENBQUM7QUFFaFAsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsaUJBQWlCLENBQUM7QUFDckQsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsMEJBQTBCLENBQUM7QUFDN0QsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFjO0lBQ3RDLEVBQUUsRUFBRSxrQkFBa0I7SUFDdEIsV0FBVyxFQUFFLEVBQUUsRUFBRSxXQUFXO0lBQzVCLGdCQUFnQixFQUFFLEVBQUUsRUFBRSxXQUFXO0lBQ2pDLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtDQUMvQixDQUFDO0FBUUssSUFBTSxRQUFRLEdBQWQsTUFB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