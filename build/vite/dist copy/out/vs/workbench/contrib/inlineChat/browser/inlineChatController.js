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
var InlineChatController_1;
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IChatAttachmentResolveService } from '../../chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatEditingService } from '../../chat/common/editing/chatEditingService.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IDiagnosticVariableEntryFilterData } from '../../chat/common/attachments/chatVariableEntries.js';
import { isResponseVM } from '../../chat/common/model/chatViewModel.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService, isILanguageModelChatSelector } from '../../chat/common/languageModels.js';
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from '../../notebook/browser/notebookEditor.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_PENDING_CONFIRMATION, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE } from '../common/inlineChat.js';
import { InlineChatAffordance } from './inlineChatAffordance.js';
import { InlineChatInputWidget, InlineChatSessionOverlayWidget } from './inlineChatOverlayWidget.js';
import { continueInPanelChat, IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';
export class InlineChatRunOptions {
    static isInlineChatRunOptions(options) {
        if (typeof options !== 'object' || options === null) {
            return false;
        }
        const { initialSelection, initialRange, message, autoSend, position, attachments, modelSelector, resolveOnResponse, attachDiagnostics } = options;
        if (typeof message !== 'undefined' && typeof message !== 'string'
            || typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
            || typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)
            || typeof initialSelection !== 'undefined' && !Selection.isISelection(initialSelection)
            || typeof position !== 'undefined' && !Position.isIPosition(position)
            || typeof attachments !== 'undefined' && (!Array.isArray(attachments) || !attachments.every(item => item instanceof URI))
            || typeof modelSelector !== 'undefined' && !isILanguageModelChatSelector(modelSelector)
            || typeof resolveOnResponse !== 'undefined' && typeof resolveOnResponse !== 'boolean'
            || typeof attachDiagnostics !== 'undefined' && typeof attachDiagnostics !== 'boolean') {
            return false;
        }
        return true;
    }
}
// TODO@jrieken THIS should be shared with the code in MainThreadEditors
function getEditorId(editor, model) {
    return `${editor.getId()},${model.id}`;
}
let InlineChatController = class InlineChatController {
    static { InlineChatController_1 = this; }
    static { this.ID = 'editor.contrib.inlineChatController'; }
    static get(editor) {
        return editor.getContribution(InlineChatController_1.ID) ?? undefined;
    }
    get widget() {
        return this._zone.value.widget;
    }
    get isActive() {
        return Boolean(this._currentSession.get());
    }
    get inputWidget() {
        return this._inputWidget;
    }
    constructor(_editor, _instaService, _notebookEditorService, _inlineChatSessionService, codeEditorService, contextKeyService, _configurationService, _webContentExtractorService, _fileService, _chatAttachmentResolveService, _editorService, _markerDecorationsService, _languageModelService, _logService, _chatEditingService, _chatService) {
        this._editor = _editor;
        this._instaService = _instaService;
        this._notebookEditorService = _notebookEditorService;
        this._inlineChatSessionService = _inlineChatSessionService;
        this._configurationService = _configurationService;
        this._webContentExtractorService = _webContentExtractorService;
        this._fileService = _fileService;
        this._chatAttachmentResolveService = _chatAttachmentResolveService;
        this._editorService = _editorService;
        this._markerDecorationsService = _markerDecorationsService;
        this._languageModelService = _languageModelService;
        this._logService = _logService;
        this._chatEditingService = _chatEditingService;
        this._chatService = _chatService;
        this._store = new DisposableStore();
        this._isActiveController = observableValue(this, false);
        const editorObs = observableCodeEditor(_editor);
        const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
        const ctxFileBelongsToChat = CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.bindTo(contextKeyService);
        const ctxPendingConfirmation = CTX_INLINE_CHAT_PENDING_CONFIRMATION.bindTo(contextKeyService);
        const ctxTerminated = CTX_INLINE_CHAT_TERMINATED.bindTo(contextKeyService);
        const notebookAgentConfig = observableConfigValue("inlineChat.notebookAgent" /* InlineChatConfigKeys.notebookAgent */, false, this._configurationService);
        this._renderMode = observableConfigValue("inlineChat.renderMode" /* InlineChatConfigKeys.RenderMode */, 'zone', this._configurationService);
        // Track whether the current editor's file is being edited by any chat editing session
        this._store.add(autorun(r => {
            const model = editorObs.model.read(r);
            if (!model) {
                ctxFileBelongsToChat.set(false);
                return;
            }
            const sessions = this._chatEditingService.editingSessionsObs.read(r);
            let hasEdits = false;
            for (const session of sessions) {
                const entries = session.entries.read(r);
                for (const entry of entries) {
                    if (isEqual(entry.modifiedURI, model.uri)) {
                        hasEdits = true;
                        break;
                    }
                }
                if (hasEdits) {
                    break;
                }
            }
            ctxFileBelongsToChat.set(hasEdits);
        }));
        const overlayWidget = this._inputWidget = this._store.add(this._instaService.createInstance(InlineChatInputWidget, editorObs));
        const sessionOverlayWidget = this._store.add(this._instaService.createInstance(InlineChatSessionOverlayWidget, editorObs));
        this.inputOverlayWidget = this._store.add(this._instaService.createInstance(InlineChatAffordance, this._editor, overlayWidget));
        this._zone = new Lazy(() => {
            assertType(this._editor.hasModel(), '[Illegal State] widget should only be created when the editor has a model');
            const location = {
                location: ChatAgentLocation.EditorInline,
                resolveData: () => {
                    assertType(this._editor.hasModel());
                    const wholeRange = this._editor.getSelection();
                    const document = this._editor.getModel().uri;
                    return {
                        type: ChatAgentLocation.EditorInline,
                        id: getEditorId(this._editor, this._editor.getModel()),
                        selection: this._editor.getSelection(),
                        document,
                        wholeRange
                    };
                }
            };
            // inline chat in notebooks
            // check if this editor is part of a notebook editor
            // if so, update the location and use the notebook specific widget
            const notebookEditor = this._notebookEditorService.getNotebookForPossibleCell(this._editor);
            if (!!notebookEditor) {
                location.location = ChatAgentLocation.Notebook;
                if (notebookAgentConfig.get()) {
                    location.resolveData = () => {
                        assertType(this._editor.hasModel());
                        return {
                            type: ChatAgentLocation.Notebook,
                            sessionInputUri: this._editor.getModel().uri,
                        };
                    };
                }
            }
            const result = this._instaService.createInstance(InlineChatZoneWidget, location, {
                enableWorkingSet: 'implicit',
                enableImplicitContext: false,
                renderInputOnTop: false,
                renderInputToolbarBelowInput: true,
                filter: item => {
                    if (!isResponseVM(item)) {
                        return false;
                    }
                    return !!item.model.isPendingConfirmation.get();
                },
                menus: {
                    telemetrySource: 'inlineChatWidget',
                    executeToolbar: MenuId.ChatEditorInlineExecute,
                    inputSideToolbar: MenuId.ChatEditorInlineInputSide
                },
                defaultMode: ChatMode.Ask
            }, { editor: this._editor, notebookEditor }, () => Promise.resolve());
            this._store.add(result);
            result.domNode.classList.add('inline-chat-2');
            return result;
        });
        const sessionsSignal = observableSignalFromEvent(this, _inlineChatSessionService.onDidChangeSessions);
        this._currentSession = derived(r => {
            sessionsSignal.read(r);
            const model = editorObs.model.read(r);
            const session = model && _inlineChatSessionService.getSessionByTextModel(model.uri);
            return session ?? undefined;
        });
        let lastSession = undefined;
        this._store.add(autorun(r => {
            const session = this._currentSession.read(r);
            if (!session) {
                this._isActiveController.set(false, undefined);
                if (lastSession && !lastSession.chatModel.hasRequests) {
                    const state = lastSession.chatModel.inputModel.state.read(undefined);
                    if (!state || (!state.inputText && state.attachments.length === 0)) {
                        lastSession.dispose();
                        lastSession = undefined;
                    }
                }
                return;
            }
            lastSession = session;
            let foundOne = false;
            for (const editor of codeEditorService.listCodeEditors()) {
                if (Boolean(InlineChatController_1.get(editor)?._isActiveController.read(undefined))) {
                    foundOne = true;
                    break;
                }
            }
            if (!foundOne && editorObs.isFocused.read(r)) {
                this._isActiveController.set(true, undefined);
            }
        }));
        const visibleSessionObs = observableValue(this, undefined);
        this._store.add(autorun(r => {
            const model = editorObs.model.read(r);
            const session = this._currentSession.read(r);
            const isActive = this._isActiveController.read(r);
            if (!session || !isActive || !model) {
                visibleSessionObs.set(undefined, undefined);
            }
            else {
                visibleSessionObs.set(session, undefined);
            }
        }));
        const defaultPlaceholderObs = visibleSessionObs.map((session, r) => {
            return session?.initialSelection.isEmpty()
                ? localize('placeholder', "Generate code")
                : localize('placeholderWithSelection', "Modify selected code");
        });
        this._store.add(autorun(r => {
            const session = visibleSessionObs.read(r);
            ctxTerminated.set(!!session?.terminationState.read(r));
        }));
        this._store.add(autorun(r => {
            // HIDE/SHOW
            const session = visibleSessionObs.read(r);
            const renderMode = this._renderMode.read(r);
            if (!session) {
                this._zone.rawValue?.hide();
                this._zone.rawValue?.widget.chatWidget.setModel(undefined);
                _editor.focus();
                ctxInlineChatVisible.reset();
            }
            else if (renderMode === 'hover') {
                // hover mode: set model but don't show zone, keep focus in editor
                this._zone.value.widget.chatWidget.setModel(session.chatModel);
                this._zone.rawValue?.hide();
                ctxInlineChatVisible.set(true);
            }
            else {
                ctxInlineChatVisible.set(true);
                this._zone.value.widget.chatWidget.setModel(session.chatModel);
                if (!this._zone.value.position) {
                    this._zone.value.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
                    this._zone.value.widget.chatWidget.input.renderAttachedContext(); // TODO - fights layout bug
                    this._zone.value.show(session.initialPosition);
                }
                this._zone.value.reveal(this._zone.value.position);
                this._zone.value.widget.focus();
            }
        }));
        // Show progress overlay widget in hover mode when a request is in progress or edits are not yet settled
        this._store.add(autorun(r => {
            const session = visibleSessionObs.read(r);
            const renderMode = this._renderMode.read(r);
            if (!session || renderMode !== 'hover') {
                ctxPendingConfirmation.set(false);
                sessionOverlayWidget.hide();
                return;
            }
            const lastRequest = session.chatModel.lastRequestObs.read(r);
            const isInProgress = lastRequest?.response?.isInProgress.read(r);
            const isPendingConfirmation = !!lastRequest?.response?.isPendingConfirmation.read(r);
            const isError = !!lastRequest?.response?.result?.errorDetails;
            const isTerminated = !!session.terminationState.read(r);
            ctxPendingConfirmation.set(isPendingConfirmation);
            const entry = session.editingSession.readEntry(session.uri, r);
            // When there's no entry (no changes made) and the response is complete, the widget should be hidden.
            // When there's an entry in Modified state, it needs to be settled (accepted/rejected).
            const isNotSettled = entry ? entry.state.read(r) === 0 /* ModifiedFileEntryState.Modified */ : false;
            if (isInProgress || isNotSettled || isPendingConfirmation || isError || isTerminated) {
                sessionOverlayWidget.show(session);
            }
            else {
                sessionOverlayWidget.hide();
            }
        }));
        this._store.add(autorun(r => {
            const session = visibleSessionObs.read(r);
            if (session) {
                const entries = session.editingSession.entries.read(r);
                const sessionCellUri = CellUri.parse(session.uri);
                const otherEntries = entries.filter(entry => {
                    if (isEqual(entry.modifiedURI, session.uri)) {
                        return false;
                    }
                    // Don't count notebooks that include the session's cell
                    if (!!sessionCellUri && isEqual(sessionCellUri.notebook, entry.modifiedURI)) {
                        return false;
                    }
                    return true;
                });
                for (const entry of otherEntries) {
                    // OPEN other modified files in side group. This is a workaround, temp-solution until we have no more backend
                    // that modifies other files
                    this._editorService.openEditor({ resource: entry.modifiedURI }, SIDE_GROUP).catch(onUnexpectedError);
                }
            }
        }));
        const lastResponseObs = visibleSessionObs.map((session, r) => {
            if (!session) {
                return;
            }
            const lastRequest = observableFromEvent(this, session.chatModel.onDidChange, () => session.chatModel.getRequests().at(-1)).read(r);
            return lastRequest?.response;
        });
        const lastResponseProgressObs = lastResponseObs.map((response, r) => {
            if (!response) {
                return;
            }
            return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast(part => part.kind === 'progressMessage')).read(r);
        });
        this._store.add(autorun(r => {
            const session = visibleSessionObs.read(r);
            const response = lastResponseObs.read(r);
            const terminationState = session?.terminationState.read(r);
            this._zone.rawValue?.widget.updateInfo('');
            if (!response?.isInProgress.read(r)) {
                if (response?.result?.errorDetails) {
                    // ERROR case
                    this._zone.rawValue?.widget.updateInfo(`$(error) ${response.result.errorDetails.message}`);
                    alert(response.result.errorDetails.message);
                }
                else if (terminationState) {
                    this._zone.rawValue?.widget.updateInfo(`$(info) ${renderAsPlaintext(terminationState)}`);
                }
                // no response or not in progress
                this._zone.rawValue?.widget.domNode.classList.toggle('request-in-progress', false);
                this._zone.rawValue?.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
            }
            else {
                this._zone.rawValue?.widget.domNode.classList.toggle('request-in-progress', true);
                let placeholder = response.request?.message.text;
                const lastProgress = lastResponseProgressObs.read(r);
                if (lastProgress) {
                    placeholder = renderAsPlaintext(lastProgress.content);
                }
                this._zone.rawValue?.widget.chatWidget.setInputPlaceholder(placeholder || localize('loading', "Working..."));
            }
        }));
        this._store.add(autorun(r => {
            const session = visibleSessionObs.read(r);
            if (!session) {
                return;
            }
            const entry = session.editingSession.readEntry(session.uri, r);
            if (entry?.state.read(r) === 0 /* ModifiedFileEntryState.Modified */) {
                entry?.enableReviewModeUntilSettled();
            }
        }));
        this._store.add(autorun(r => {
            const session = visibleSessionObs.read(r);
            const entry = session?.editingSession.readEntry(session.uri, r);
            // make sure there is an editor integration
            const pane = this._editorService.visibleEditorPanes.find(candidate => candidate.getControl() === this._editor || isNotebookWithCellEditor(candidate, this._editor));
            if (pane && entry) {
                entry?.getEditorIntegration(pane);
            }
            // make sure the ZONE isn't inbetween a diff and move above if so
            if (entry?.diffInfo && this._zone.value.position) {
                const { position } = this._zone.value;
                const diff = entry.diffInfo.read(r);
                for (const change of diff.changes) {
                    if (change.modified.contains(position.lineNumber)) {
                        this._zone.value.updatePositionAndHeight(new Position(change.modified.startLineNumber - 1, 1));
                        break;
                    }
                }
            }
        }));
    }
    dispose() {
        this._store.dispose();
    }
    getWidgetPosition() {
        return this._zone.rawValue?.position;
    }
    focus() {
        this._zone.rawValue?.widget.focus();
    }
    async run(arg) {
        assertType(this._editor.hasModel());
        const uri = this._editor.getModel().uri;
        const existingSession = this._inlineChatSessionService.getSessionByTextModel(uri);
        if (existingSession) {
            await existingSession.editingSession.accept();
            existingSession.dispose();
        }
        this._isActiveController.set(true, undefined);
        const session = this._inlineChatSessionService.createSession(this._editor);
        // Store for tracking model changes during this session
        const sessionStore = new DisposableStore();
        try {
            await this._applyModelDefaults(session, sessionStore);
            if (arg) {
                arg.attachDiagnostics ??= this._configurationService.getValue("inlineChat.renderMode" /* InlineChatConfigKeys.RenderMode */) === 'zone';
            }
            // ADD diagnostics (only when explicitly requested)
            if (arg?.attachDiagnostics) {
                const entries = [];
                for (const [range, marker] of this._markerDecorationsService.getLiveMarkers(uri)) {
                    if (range.intersectRanges(this._editor.getSelection())) {
                        const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
                        entries.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
                    }
                }
                if (entries.length > 0) {
                    this._zone.value.widget.chatWidget.attachmentModel.addContext(...entries);
                    const msg = entries.length > 1
                        ? localize('fixN', "Fix the attached problems")
                        : localize('fix1', "Fix the attached problem");
                    this._zone.value.widget.chatWidget.input.setValue(msg, true);
                    arg.message = msg;
                    this._zone.value.widget.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
                }
            }
            // Check args
            if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
                if (arg.initialRange) {
                    this._editor.revealRange(arg.initialRange);
                }
                if (arg.initialSelection) {
                    this._editor.setSelection(arg.initialSelection);
                }
                if (arg.attachments) {
                    await Promise.all(arg.attachments.map(async (attachment) => {
                        await this._zone.value.widget.chatWidget.attachmentModel.addFile(attachment);
                    }));
                    delete arg.attachments;
                }
                if (arg.modelSelector) {
                    const id = (await this._languageModelService.selectLanguageModels(arg.modelSelector)).sort().at(0);
                    if (!id) {
                        throw new Error(`No language models found matching selector: ${JSON.stringify(arg.modelSelector)}.`);
                    }
                    const model = this._languageModelService.lookupLanguageModel(id);
                    if (!model) {
                        throw new Error(`Language model not loaded: ${id}.`);
                    }
                    this._zone.value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id });
                }
                if (arg.message) {
                    this._zone.value.widget.chatWidget.setInput(arg.message);
                    if (arg.autoSend) {
                        await this._zone.value.widget.chatWidget.acceptInput();
                    }
                }
            }
            if (!arg?.resolveOnResponse) {
                // DEFAULT: wait for the session to be accepted or rejected
                await Event.toPromise(session.editingSession.onDidDispose);
                const rejected = session.editingSession.getEntry(uri)?.state.get() === 2 /* ModifiedFileEntryState.Rejected */;
                return !rejected;
            }
            else {
                // resolveOnResponse: ONLY wait for the file to be modified
                const modifiedObs = derived(r => {
                    const entry = session.editingSession.readEntry(uri, r);
                    return entry?.state.read(r) === 0 /* ModifiedFileEntryState.Modified */ && !entry?.isCurrentlyBeingModifiedBy.read(r);
                });
                await waitForState(modifiedObs, state => state === true);
                return true;
            }
        }
        finally {
            sessionStore.dispose();
        }
    }
    async acceptSession() {
        const session = this._currentSession.get();
        if (!session) {
            return;
        }
        await session.editingSession.accept();
        session.dispose();
    }
    async rejectSession() {
        const session = this._currentSession.get();
        if (!session) {
            return;
        }
        await this._chatService.cancelCurrentRequestForSession(session.chatModel.sessionResource, 'inlineChatReject');
        await session.editingSession.reject();
        session.dispose();
    }
    async continueSessionInChat() {
        const session = this._currentSession.get();
        if (!session) {
            return;
        }
        await this._instaService.invokeFunction(continueInPanelChat, session);
    }
    async rephraseSession() {
        const session = this._currentSession.get();
        if (!session) {
            return;
        }
        const requestText = session.chatModel.getRequests().at(-1)?.message.text;
        session.dispose();
        if (!requestText) {
            return;
        }
        const selection = this._editor.getSelection();
        const placeholder = selection && !selection.isEmpty()
            ? localize('placeholderWithSelectionHover', "Describe how to change this")
            : localize('placeholderNoSelectionHover', "Describe what to generate");
        await this.inputOverlayWidget.showMenuAtSelection(placeholder, requestText);
    }
    async _selectVendorDefaultModel(session) {
        const model = this._zone.value.widget.chatWidget.input.selectedLanguageModel.get();
        if (model && !model.metadata.isDefaultForLocation[session.chatModel.initialLocation]) {
            const ids = await this._languageModelService.selectLanguageModels({ vendor: model.metadata.vendor });
            for (const identifier of ids) {
                const candidate = this._languageModelService.lookupLanguageModel(identifier);
                if (candidate?.isDefaultForLocation[session.chatModel.initialLocation]) {
                    this._zone.value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: candidate, identifier });
                    break;
                }
            }
        }
    }
    /**
     * Applies model defaults based on settings and tracks user model changes.
     * Prioritization: user session choice > inlineChat.defaultModel setting > vendor default
     */
    async _applyModelDefaults(session, sessionStore) {
        const userSelectedModel = InlineChatController_1._userSelectedModel;
        const defaultModelSetting = this._configurationService.getValue("inlineChat.defaultModel" /* InlineChatConfigKeys.DefaultModel */);
        let modelApplied = false;
        // 1. Try user's explicitly chosen model from a previous inline chat in the same session
        if (userSelectedModel) {
            modelApplied = this._zone.value.widget.chatWidget.input.switchModelByQualifiedName([userSelectedModel]);
            if (!modelApplied) {
                // User's previously selected model is no longer available, clear it
                InlineChatController_1._userSelectedModel = undefined;
            }
        }
        // 2. Try inlineChat.defaultModel setting
        if (!modelApplied && defaultModelSetting) {
            modelApplied = this._zone.value.widget.chatWidget.input.switchModelByQualifiedName([defaultModelSetting]);
            if (!modelApplied) {
                this._logService.warn(`inlineChat.defaultModel setting value '${defaultModelSetting}' did not match any available model. Falling back to vendor default.`);
            }
        }
        // 3. Fall back to vendor default
        if (!modelApplied) {
            await this._selectVendorDefaultModel(session);
        }
        // Track model changes - store user's explicit choice in the given sessions.
        // NOTE: This currently detects any model change, not just user-initiated ones.
        let initialModelId;
        sessionStore.add(autorun(r => {
            const newModel = this._zone.value.widget.chatWidget.input.selectedLanguageModel.read(r);
            if (!newModel) {
                return;
            }
            if (!initialModelId) {
                initialModelId = newModel.identifier;
                return;
            }
            if (initialModelId !== newModel.identifier) {
                // User explicitly changed model, store their choice as qualified name
                InlineChatController_1._userSelectedModel = ILanguageModelChatMetadata.asQualifiedName(newModel.metadata);
                initialModelId = newModel.identifier;
            }
        }));
    }
    async createImageAttachment(attachment) {
        const value = this._currentSession.get();
        if (!value) {
            return undefined;
        }
        if (attachment.scheme === Schemas.file) {
            if (await this._fileService.canHandleResource(attachment)) {
                return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment);
            }
        }
        else if (attachment.scheme === Schemas.http || attachment.scheme === Schemas.https) {
            const extractedImages = await this._webContentExtractorService.readImage(attachment, CancellationToken.None);
            if (extractedImages) {
                return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment, extractedImages);
            }
        }
        return undefined;
    }
};
InlineChatController = InlineChatController_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, INotebookEditorService),
    __param(3, IInlineChatSessionService),
    __param(4, ICodeEditorService),
    __param(5, IContextKeyService),
    __param(6, IConfigurationService),
    __param(7, ISharedWebContentExtractorService),
    __param(8, IFileService),
    __param(9, IChatAttachmentResolveService),
    __param(10, IEditorService),
    __param(11, IMarkerDecorationsService),
    __param(12, ILanguageModelsService),
    __param(13, ILogService),
    __param(14, IChatEditingService),
    __param(15, IChatService)
], InlineChatController);
export { InlineChatController };
export async function reviewEdits(accessor, editor, stream, token, applyCodeBlockSuggestionId) {
    if (!editor.hasModel()) {
        return false;
    }
    const chatService = accessor.get(IChatService);
    const uri = editor.getModel().uri;
    const chatModelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
    const chatModel = chatModelRef.object;
    chatModel.startEditingSession(true);
    const store = new DisposableStore();
    store.add(chatModelRef);
    // STREAM
    const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0, {
        kind: undefined,
        modeId: 'applyCodeBlock',
        modeInstructions: undefined,
        isBuiltin: true,
        applyCodeBlockSuggestionId,
    });
    assertType(chatRequest.response);
    chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
    for await (const chunk of stream) {
        if (token.isCancellationRequested) {
            chatRequest.response.cancel();
            break;
        }
        chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: chunk, done: false });
    }
    chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });
    if (!token.isCancellationRequested) {
        chatRequest.response.complete();
    }
    const isSettled = derived(r => {
        const entry = chatModel.editingSession?.readEntry(uri, r);
        if (!entry) {
            return false;
        }
        const state = entry.state.read(r);
        return state === 1 /* ModifiedFileEntryState.Accepted */ || state === 2 /* ModifiedFileEntryState.Rejected */;
    });
    const whenDecided = waitForState(isSettled, Boolean);
    await raceCancellation(whenDecided, token);
    store.dispose();
    return true;
}
export async function reviewNotebookEdits(accessor, uri, stream, token) {
    const chatService = accessor.get(IChatService);
    const notebookService = accessor.get(INotebookService);
    const isNotebook = notebookService.hasSupportedNotebooks(uri);
    const chatModelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
    const chatModel = chatModelRef.object;
    chatModel.startEditingSession(true);
    const store = new DisposableStore();
    store.add(chatModelRef);
    // STREAM
    const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
    assertType(chatRequest.response);
    if (isNotebook) {
        chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: false });
    }
    else {
        chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
    }
    for await (const chunk of stream) {
        if (token.isCancellationRequested) {
            chatRequest.response.cancel();
            break;
        }
        if (chunk.every(isCellEditOperation)) {
            chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: chunk, done: false });
        }
        else {
            chatRequest.response.updateContent({ kind: 'textEdit', uri: chunk[0], edits: chunk[1], done: false });
        }
    }
    if (isNotebook) {
        chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: true });
    }
    else {
        chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });
    }
    if (!token.isCancellationRequested) {
        chatRequest.response.complete();
    }
    const isSettled = derived(r => {
        const entry = chatModel.editingSession?.readEntry(uri, r);
        if (!entry) {
            return false;
        }
        const state = entry.state.read(r);
        return state === 1 /* ModifiedFileEntryState.Accepted */ || state === 2 /* ModifiedFileEntryState.Rejected */;
    });
    const whenDecided = waitForState(isSettled, Boolean);
    await raceCancellation(whenDecided, token);
    store.dispose();
    return true;
}
function isCellEditOperation(edit) {
    if (URI.isUri(edit)) {
        return false;
    }
    if (Array.isArray(edit)) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdENvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdENvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQWUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JLLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzFGLE9B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