var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InlineChatEscapeToolContribution_1;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, dispose, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isCodeEditor, isCompositeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { CTX_INLINE_CHAT_HAS_AGENT2, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT, CTX_INLINE_CHAT_POSSIBLE } from '../common/inlineChat.js';
import { continueInPanelChat, IInlineChatSessionService, rephraseInlineChat } from './inlineChatSessionService.js';
export class InlineChatError extends Error {
    static { this.code = 'InlineChatError'; }
    constructor(message) {
        super(message);
        this.name = InlineChatError.code;
    }
}
let InlineChatSessionServiceImpl = class InlineChatSessionServiceImpl {
    constructor(_chatService, chatAgentService) {
        this._chatService = _chatService;
        this._store = new DisposableStore();
        this._sessions = new ResourceMap();
        this._onWillStartSession = this._store.add(new Emitter());
        this.onWillStartSession = this._onWillStartSession.event;
        this._onDidChangeSessions = this._store.add(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        // Listen for agent changes and dispose all sessions when there is no agent
        const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
        this._store.add(autorun(r => {
            const agent = agentObs.read(r);
            if (!agent) {
                // No agent available, dispose all sessions
                dispose(this._sessions.values());
                this._sessions.clear();
            }
        }));
    }
    dispose() {
        this._store.dispose();
    }
    createSession(editor) {
        const uri = editor.getModel().uri;
        if (this._sessions.has(uri)) {
            throw new Error('Session already exists');
        }
        this._onWillStartSession.fire(editor);
        const chatModelRef = this._chatService.startNewLocalSession(ChatAgentLocation.EditorInline, { canUseTools: false /* SEE https://github.com/microsoft/vscode/issues/279946 */ });
        const chatModel = chatModelRef.object;
        chatModel.startEditingSession(false);
        const terminationState = observableValue(this, undefined);
        const store = new DisposableStore();
        store.add(toDisposable(() => {
            void this._chatService.cancelCurrentRequestForSession(chatModel.sessionResource, 'inlineChatSession');
            chatModel.editingSession?.reject();
            this._sessions.delete(uri);
            this._onDidChangeSessions.fire(this);
        }));
        store.add(chatModelRef);
        store.add(autorun(r => {
            const entries = chatModel.editingSession?.entries.read(r);
            if (!entries?.length) {
                return;
            }
            const state = entries.find(entry => isEqual(entry.modifiedURI, uri))?.state.read(r);
            if (state === 1 /* ModifiedFileEntryState.Accepted */ || state === 2 /* ModifiedFileEntryState.Rejected */) {
                const response = chatModel.getRequests().at(-1)?.response;
                if (response) {
                    this._chatService.notifyUserAction({
                        sessionResource: response.session.sessionResource,
                        requestId: response.requestId,
                        agentId: response.agent?.id,
                        command: response.slashCommand?.name,
                        result: response.result,
                        action: {
                            kind: 'inlineChat',
                            action: state === 1 /* ModifiedFileEntryState.Accepted */ ? 'accepted' : 'discarded'
                        }
                    });
                }
            }
            const allSettled = entries.every(entry => {
                const state = entry.state.read(r);
                return (state === 1 /* ModifiedFileEntryState.Accepted */ || state === 2 /* ModifiedFileEntryState.Rejected */)
                    && !entry.isCurrentlyBeingModifiedBy.read(r);
            });
            if (allSettled && !chatModel.requestInProgress.read(undefined)) {
                // self terminate
                store.dispose();
            }
        }));
        const result = {
            uri,
            initialPosition: editor.getSelection().getStartPosition().delta(-1), /* one line above selection start */
            initialSelection: editor.getSelection(),
            chatModel,
            editingSession: chatModel.editingSession,
            terminationState,
            setTerminationState: state => {
                terminationState.set(state, undefined);
                this._onDidChangeSessions.fire(this);
            },
            dispose: store.dispose.bind(store)
        };
        this._sessions.set(uri, result);
        this._onDidChangeSessions.fire(this);
        return result;
    }
    getSessionByTextModel(uri) {
        let result = this._sessions.get(uri);
        if (!result) {
            // no direct session, try to find an editing session which has a file entry for the uri
            for (const [_, candidate] of this._sessions) {
                const entry = candidate.editingSession.getEntry(uri);
                if (entry) {
                    result = candidate;
                    break;
                }
            }
        }
        return result;
    }
    getSessionBySessionUri(sessionResource) {
        for (const session of this._sessions.values()) {
            if (isEqual(session.chatModel.sessionResource, sessionResource)) {
                return session;
            }
        }
        return undefined;
    }
};
InlineChatSessionServiceImpl = __decorate([
    __param(0, IChatService),
    __param(1, IChatAgentService)
], InlineChatSessionServiceImpl);
export { InlineChatSessionServiceImpl };
let InlineChatEnabler = class InlineChatEnabler {
    static { this.Id = 'inlineChat.enabler'; }
    constructor(contextKeyService, chatAgentService, editorService, configService) {
        this._store = new DisposableStore();
        this._ctxHasProvider2 = CTX_INLINE_CHAT_HAS_AGENT2.bindTo(contextKeyService);
        this._ctxHasNotebookProvider = CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT.bindTo(contextKeyService);
        this._ctxPossible = CTX_INLINE_CHAT_POSSIBLE.bindTo(contextKeyService);
        const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
        const notebookAgentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
        const notebookAgentConfigObs = observableConfigValue("inlineChat.notebookAgent" /* InlineChatConfigKeys.notebookAgent */, false, configService);
        this._store.add(autorun(r => {
            const agent = agentObs.read(r);
            if (!agent) {
                this._ctxHasProvider2.reset();
            }
            else {
                this._ctxHasProvider2.set(true);
            }
        }));
        this._store.add(autorun(r => {
            this._ctxHasNotebookProvider.set(notebookAgentConfigObs.read(r) && !!notebookAgentObs.read(r));
        }));
        const updateEditor = () => {
            const ctrl = editorService.activeEditorPane?.getControl();
            const isCodeEditorLike = isCodeEditor(ctrl) || isDiffEditor(ctrl) || isCompositeEditor(ctrl);
            this._ctxPossible.set(isCodeEditorLike);
        };
        this._store.add(editorService.onDidActiveEditorChange(updateEditor));
        updateEditor();
    }
    dispose() {
        this._ctxPossible.reset();
        this._ctxHasProvider2.reset();
        this._store.dispose();
    }
};
InlineChatEnabler = __decorate([
    __param(0, IContextKeyService),
    __param(1, IChatAgentService),
    __param(2, IEditorService),
    __param(3, IConfigurationService)
], InlineChatEnabler);
export { InlineChatEnabler };
let InlineChatEscapeToolContribution = class InlineChatEscapeToolContribution extends Disposable {
    static { InlineChatEscapeToolContribution_1 = this; }
    static { this.Id = 'inlineChat.escapeTool'; }
    static { this.DONT_ASK_AGAIN_KEY = 'inlineChat.dontAskMoveToPanelChat'; }
    static { this._data = {
        id: 'inline_chat_exit',
        source: ToolDataSource.Internal,
        canBeReferencedInPrompt: false,
        alwaysDisplayInputOutput: false,
        displayName: localize('name', "Inline Chat to Panel Chat"),
        modelDescription: 'Show a short textual response when not being able to make code changes and when not having been asked for code changes. Can also be used to move the request to the richer panel chat which supports edits across files, creating and deleting files, multi-turn conversations between the user and the assistant, and access to more IDE tools, like retrieve problems, interact with source control, run terminal commands etc.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                response: {
                    type: 'string',
                    description: localize('response.description', "Optional brief response for inline chat. Keep it at 10 words or fewer."),
                    maxLength: 200,
                }
            }
        }
    }; }
    constructor(lmTools, inlineChatSessionService, dialogService, codeEditorService, configurationService, chatService, logService, storageService, instaService) {
        super();
        this._store.add(lmTools.registerTool(InlineChatEscapeToolContribution_1._data, {
            invoke: async (invocation, _tokenCountFn, _progress, _token) => {
                const sessionResource = invocation.context?.sessionResource;
                if (!sessionResource) {
                    logService.warn('InlineChatEscapeToolContribution: no sessionId in tool invocation context');
                    return { content: [{ kind: 'text', value: 'Cancel' }] };
                }
                const session = inlineChatSessionService.getSessionBySessionUri(sessionResource);
                if (!session) {
                    logService.warn(`InlineChatEscapeToolContribution: no session found for id ${sessionResource}`);
                    return { content: [{ kind: 'text', value: 'Cancel' }] };
                }
                const lastRequest = session.chatModel.getRequests().at(-1);
                if (!lastRequest) {
                    logService.warn(`InlineChatEscapeToolContribution: no request found for id ${sessionResource}`);
                    return { content: [{ kind: 'text', value: 'Cancel' }], toolResultMessage: localize('tool.cancel', "Cancel") };
                }
                if (configurationService.getValue("inlineChat.renderMode" /* InlineChatConfigKeys.RenderMode */) === 'hover') {
                    const response = typeof invocation.parameters?.response === 'string' && invocation.parameters.response.trim().length > 0
                        ? invocation.parameters.response.trim()
                        : localize('terminated.message', "Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat.");
                    session.setTerminationState(response);
                    return { content: [{ kind: 'text', value: 'Success' }] };
                }
                const dontAskAgain = storageService.getBoolean(InlineChatEscapeToolContribution_1.DONT_ASK_AGAIN_KEY, 0 /* StorageScope.PROFILE */);
                let result;
                if (dontAskAgain !== undefined) {
                    // Use previously stored user preference: true = 'Continue in Chat view', false = 'Rephrase' (Cancel)
                    result = { confirmed: dontAskAgain, checkboxChecked: false };
                }
                else {
                    result = await dialogService.confirm({
                        type: 'question',
                        title: localize('confirm.title', "Do you want to continue in Chat view?"),
                        message: localize('confirm', "Do you want to continue in Chat view?"),
                        detail: localize('confirm.detail', "Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat."),
                        primaryButton: localize('confirm.yes', "Continue in Chat view"),
                        cancelButton: localize('confirm.cancel', "Cancel"),
                        checkbox: { label: localize('chat.remove.confirmation.checkbox', "Don't ask again"), checked: false },
                    });
                }
                const editor = codeEditorService.getFocusedCodeEditor();
                if (!editor || result.confirmed) {
                    logService.trace('InlineChatEscapeToolContribution: moving session to panel chat');
                    await instaService.invokeFunction(continueInPanelChat, session);
                }
                else {
                    logService.trace('InlineChatEscapeToolContribution: rephrase prompt');
                    instaService.invokeFunction(rephraseInlineChat, session);
                }
                if (result.checkboxChecked) {
                    storageService.store(InlineChatEscapeToolContribution_1.DONT_ASK_AGAIN_KEY, result.confirmed, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
                    logService.trace('InlineChatEscapeToolContribution: stored don\'t ask again preference');
                }
                return { content: [{ kind: 'text', value: 'Success' }] };
            }
        }));
    }
};
InlineChatEscapeToolContribution = InlineChatEscapeToolContribution_1 = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IInlineChatSessionService),
    __param(2, IDialogService),
    __param(3, ICodeEditorService),
    __param(4, IConfigurationService),
    __param(5, IChatService),
    __param(6, ILogService),
    __param(7, IStorageService),
    __param(8, IInstantiationService)
], InlineChatEscapeToolContribution);
export { InlineChatEscapeToolContribution };
registerAction2(class ResetMoveToPanelChatChoice extends Action2 {
    constructor() {
        super({
            id: 'inlineChat.resetMoveToPanelChatChoice',
            precondition: ChatContextKeys.Setup.hidden.negate(),
            title: localize2('resetChoice.label', "Reset Choice for 'Move Inline Chat to Panel Chat'"),
            f1: true
        });
    }
    run(accessor) {
        accessor.get(IStorageService).remove(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, 0 /* StorageScope.PROFILE */);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxPQUFPLEVBQXFCLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQs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