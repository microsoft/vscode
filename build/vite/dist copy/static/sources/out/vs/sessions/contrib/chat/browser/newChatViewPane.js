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
import './media/chatWidget.css';
import './media/chatWelcomePart.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';
import { SessionTypePicker } from './sessionTypePicker.js';
import { WorkspacePicker } from './sessionWorkspacePicker.js';
import { Menus } from '../../../browser/menus.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { SlashCommandHandler } from './slashCommands.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ChatHistoryNavigator } from '../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
const STORAGE_KEY_DRAFT_STATE = 'sessions.draftState';
const MIN_EDITOR_HEIGHT = 50;
const MAX_EDITOR_HEIGHT = 200;
// #region --- Chat Welcome Widget ---
/**
 * A self-contained new-session chat widget with a welcome view (mascot, target
 * buttons, option pickers), an input editor, model picker, and send button.
 *
 * This widget is shown only in the empty/welcome state. Once the user sends
 * a message, a session is created and the workbench ChatViewPane takes over.
 */
let NewChatWidget = class NewChatWidget extends Disposable {
    get element() { return this._editorContainer; }
    constructor(instantiationService, modelService, configurationService, contextKeyService, logService, hoverService, sessionsManagementService, sessionsProvidersService, storageService, workspaceTrustRequestService) {
        super();
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.configurationService = configurationService;
        this.contextKeyService = contextKeyService;
        this.logService = logService;
        this.hoverService = hoverService;
        this.sessionsManagementService = sessionsManagementService;
        this.sessionsProvidersService = sessionsProvidersService;
        this.storageService = storageService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        // IHistoryNavigationWidget
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlur = this._register(new Emitter());
        this.onDidBlur = this._onDidBlur.event;
        this._sending = false;
        this._loadingDelayDisposable = this._register(new MutableDisposable());
        // Input state
        this._draftState = {
            inputText: '',
            attachments: [],
        };
        this._history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
        this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
        this._workspacePicker = this._register(this.instantiationService.createInstance(WorkspacePicker));
        this._sessionTypePicker = this._register(this.instantiationService.createInstance(SessionTypePicker));
        // When a workspace is selected, create a new session
        this._register(this._workspacePicker.onDidChangeSelection(() => {
            this._renderOptionGroupPickers();
        }));
        this._register(this._workspacePicker.onDidSelectWorkspace(async (workspace) => {
            await this._onWorkspaceSelected(workspace);
            this._focusEditor();
        }));
        // Update send button and loading state when active session changes or loads
        this._register(autorun(reader => {
            const session = this.sessionsManagementService.activeSession.read(reader);
            const isLoading = session?.loading.read(reader) ?? false;
            this._loadingSpinner?.classList.toggle('visible', isLoading);
            this._updateSendButtonState();
        }));
        this._register(this._contextAttachments.onDidChangeContext(() => {
            this._updateDraftState();
            this._focusEditor();
        }));
    }
    // --- Rendering ---
    render(container) {
        const wrapper = dom.append(container, dom.$('.sessions-chat-widget'));
        // Overflow widget DOM node at the top level so the suggest widget
        // is not clipped by any overflow:hidden ancestor.
        const editorOverflowWidgetsDomNode = dom.append(container, dom.$('.sessions-chat-editor-overflow.monaco-editor'));
        this._register({ dispose: () => editorOverflowWidgetsDomNode.remove() });
        const welcomeElement = dom.append(wrapper, dom.$('.chat-full-welcome'));
        // Main empty-state content area (folder picker, input, local mode controls)
        const welcomeContent = dom.append(welcomeElement, dom.$('.chat-full-welcome-content'));
        // Option group pickers (above the input)
        this._pickersContainer = dom.append(welcomeContent, dom.$('.chat-full-welcome-pickers-container'));
        // Input slot
        this._inputSlot = dom.append(welcomeContent, dom.$('.chat-full-welcome-inputSlot'));
        // Input area inside the input slot
        const inputArea = dom.$('.sessions-chat-input-area');
        this._contextAttachments.registerDropTarget(wrapper);
        this._contextAttachments.registerPasteHandler(inputArea);
        // Attachments row (pills only) inside input area, above editor
        const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
        const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
        this._contextAttachments.renderAttachedContext(attachedContextContainer);
        this._createEditor(inputArea, editorOverflowWidgetsDomNode);
        this._createBottomToolbar(inputArea);
        this._inputSlot.appendChild(inputArea);
        // Below-input row: session type picker, permission control, spacer, repository config (right)
        const belowInputRow = dom.append(welcomeContent, dom.$('.chat-full-welcome-local-mode'));
        this._sessionTypePicker.render(belowInputRow);
        const controlContainer = dom.append(belowInputRow, dom.$('.sessions-chat-control-toolbar'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, controlContainer, Menus.NewSessionControl, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
        }));
        dom.append(belowInputRow, dom.$('.sessions-chat-local-mode-spacer'));
        const repoConfigContainer = dom.append(belowInputRow, dom.$('.sessions-chat-local-mode-right'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, repoConfigContainer, Menus.NewSessionRepositoryConfig, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
        }));
        // Render project picker & extension pickers
        this._renderOptionGroupPickers();
        // Restore draft input state from storage
        this._restoreState();
        // Create initial session — wait for providers if none registered yet
        const restoredProject = this._workspacePicker.selectedProject;
        if (restoredProject) {
            if (this.sessionsProvidersService.getProviders().length > 0) {
                this._createNewSession(restoredProject);
            }
            else {
                // Providers not yet registered (startup race) — wait for first registration
                const sub = this.sessionsProvidersService.onDidChangeProviders(() => {
                    sub.dispose();
                    this._createNewSession(restoredProject);
                });
                this._register(sub);
            }
        }
        // Reveal
        welcomeElement.classList.add('revealed');
        // Layout editor after the input slot fade-in animation completes
        this._register(dom.addDisposableListener(this._inputSlot, 'animationend', () => {
            this._editor?.layout();
        }, { once: true }));
    }
    _createNewSession(selection) {
        this.sessionsManagementService.createNewSession(selection.providerId, selection.workspace);
    }
    _updateInputLoadingState() {
        const loading = this._sending;
        if (loading) {
            if (!this._loadingDelayDisposable.value) {
                const timer = setTimeout(() => {
                    this._loadingDelayDisposable.clear();
                    if (this._sending) {
                        this._loadingSpinner?.classList.add('visible');
                    }
                }, 500);
                this._loadingDelayDisposable.value = toDisposable(() => clearTimeout(timer));
            }
        }
        else {
            this._loadingDelayDisposable.clear();
            this._loadingSpinner?.classList.remove('visible');
        }
    }
    // --- Editor ---
    _createEditor(container, overflowWidgetsDomNode) {
        const editorContainer = this._editorContainer = dom.append(container, dom.$('.sessions-chat-editor'));
        editorContainer.style.height = `${MIN_EDITOR_HEIGHT}px`;
        // Create scoped context key service and register history navigation
        // BEFORE creating the editor, so the editor's context key scope is a child
        const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
        const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
        this._historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
        this._historyNavigationForwardsEnablement = historyNavigationForwardsEnablement;
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));
        const uri = URI.from({ scheme: 'sessions-chat', path: `input-${Date.now()}` });
        const textModel = this._register(this.modelService.createModel('', null, uri, true));
        const editorOptions = {
            ...getSimpleEditorOptions(this.configurationService),
            readOnly: false,
            ariaLabel: localize('chatInput', "Chat input"),
            placeholder: localize('chatPlaceholder', "Run tasks in the background, type '#' for adding context"),
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 13,
            lineHeight: 20,
            cursorWidth: 1,
            padding: { top: 8, bottom: 2 },
            wrappingStrategy: 'advanced',
            stickyScroll: { enabled: false },
            renderWhitespace: 'none',
            overflowWidgetsDomNode,
            suggest: {
                showIcons: false,
                showSnippets: false,
                showWords: true,
                showStatusBar: false,
                insertMode: 'insert',
            },
        };
        const widgetOptions = {
            isSimpleWidget: true,
            contributions: EditorExtensionsRegistry.getSomeEditorContributions([
                ContextMenuController.ID,
                SuggestController.ID,
                SnippetController2.ID,
            ]),
        };
        this._editor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorContainer, editorOptions, widgetOptions));
        this._editor.setModel(textModel);
        // Ensure suggest widget renders above the input (not clipped by container)
        SuggestController.get(this._editor)?.forceRenderingAbove();
        this._register(this._editor.onDidFocusEditorWidget(() => this._onDidFocus.fire()));
        this._register(this._editor.onDidBlurEditorWidget(() => this._onDidBlur.fire()));
        this._register(this._editor.onKeyDown(e => {
            if (e.keyCode === 3 /* KeyCode.Enter */ && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                // Don't send if the suggest widget is visible (let it accept the completion)
                if (this._editor.contextKeyService.getContextKeyValue('suggestWidgetVisible')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                this._send();
            }
            if (e.keyCode === 3 /* KeyCode.Enter */ && !e.shiftKey && !e.ctrlKey && e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                this._send();
            }
        }));
        // Update history navigation enablement based on cursor position
        const updateHistoryNavigationEnablement = () => {
            const model = this._editor.getModel();
            const position = this._editor.getPosition();
            if (!model || !position) {
                return;
            }
            this._historyNavigationBackwardsEnablement.set(position.lineNumber === 1 && position.column === 1);
            this._historyNavigationForwardsEnablement.set(position.lineNumber === model.getLineCount() && position.column === model.getLineMaxColumn(position.lineNumber));
        };
        this._register(this._editor.onDidChangeCursorPosition(() => updateHistoryNavigationEnablement()));
        updateHistoryNavigationEnablement();
        let previousHeight = -1;
        this._register(this._editor.onDidContentSizeChange(e => {
            if (!e.contentHeightChanged) {
                return;
            }
            const contentHeight = this._editor.getContentHeight();
            const clampedHeight = Math.min(MAX_EDITOR_HEIGHT, Math.max(MIN_EDITOR_HEIGHT, contentHeight));
            if (clampedHeight === previousHeight) {
                return;
            }
            previousHeight = clampedHeight;
            this._editorContainer.style.height = `${clampedHeight}px`;
            this._editor.layout();
        }));
        // Slash commands
        this._slashCommandHandler = this._register(this.instantiationService.createInstance(SlashCommandHandler, this._editor));
        this._register(this._editor.onDidChangeModelContent(() => {
            this._updateDraftState();
            this._updateSendButtonState();
        }));
    }
    _focusEditor() {
        this._editor?.focus();
    }
    _createAttachButton(container) {
        const attachButton = dom.append(container, dom.$('.sessions-chat-attach-button'));
        const attachButtonLabel = localize('addContext', "Add Context...");
        attachButton.tabIndex = 0;
        attachButton.role = 'button';
        attachButton.ariaLabel = attachButtonLabel;
        this._register(this.hoverService.setupDelayedHover(attachButton, {
            content: attachButtonLabel,
            position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
            appearance: { showPointer: true }
        }));
        dom.append(attachButton, renderIcon(Codicon.add));
        this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
            this._contextAttachments.showPicker(this._getContextFolderUri());
        }));
    }
    /**
     * Returns the workspace URI for the context picker based on the current workspace selection.
     */
    _getContextFolderUri() {
        return this._workspacePicker.selectedProject?.workspace.repositories[0]?.uri;
    }
    _createBottomToolbar(container) {
        const toolbar = dom.append(container, dom.$('.sessions-chat-toolbar'));
        this._createAttachButton(toolbar);
        // Session config pickers (mode, model) — rendered via MenuWorkbenchToolBar
        // Visibility controlled by context keys (isActiveSessionBackgroundProvider, isNewChatSession)
        const configContainer = dom.append(toolbar, dom.$('.sessions-chat-config-toolbar'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, configContainer, Menus.NewSessionConfig, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
        }));
        dom.append(toolbar, dom.$('.sessions-chat-toolbar-spacer'));
        this._loadingSpinner = dom.append(toolbar, dom.$('.sessions-chat-loading-spinner'));
        this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._loadingSpinner, localize('loading', "Loading...")));
        const sendButtonContainer = dom.append(toolbar, dom.$('.sessions-chat-send-button'));
        const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
            secondary: true,
            title: localize('send', "Send"),
            ariaLabel: localize('send', "Send"),
        }));
        sendButton.icon = Codicon.send;
        this._register(sendButton.onDidClick(() => this._send()));
        this._updateSendButtonState();
    }
    // --- Welcome: Target & option pickers (dropdown row below input) ---
    _renderOptionGroupPickers() {
        if (!this._pickersContainer) {
            return;
        }
        dom.clearNode(this._pickersContainer);
        const pickersRow = dom.append(this._pickersContainer, dom.$('.chat-full-welcome-pickers'));
        const pickersLabel = dom.append(pickersRow, dom.$('.chat-full-welcome-pickers-label'));
        pickersLabel.textContent = this._workspacePicker.selectedProject
            ? localize('newSessionIn', "New session in")
            : localize('newSessionChooseWorkspace', "Start by picking a");
        // Project picker (unified folder + repo picker)
        this._workspacePicker.render(pickersRow);
    }
    // --- Input History (IHistoryNavigationWidget) ---
    showPreviousValue() {
        if (this._history.isAtStart()) {
            return;
        }
        if (this._draftState?.inputText || this._draftState?.attachments.length) {
            this._history.overlay(this._toHistoryEntry(this._draftState));
        }
        this._navigateHistory(true);
    }
    showNextValue() {
        if (this._history.isAtEnd()) {
            return;
        }
        if (this._draftState?.inputText || this._draftState?.attachments.length) {
            this._history.overlay(this._toHistoryEntry(this._draftState));
        }
        this._navigateHistory(false);
    }
    _updateDraftState() {
        this._draftState = {
            inputText: this._editor?.getModel()?.getValue() ?? '',
            attachments: [...this._contextAttachments.attachments],
        };
    }
    _toHistoryEntry(draft) {
        return {
            ...draft,
            mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
            selectedModel: undefined,
            selections: [],
            contrib: {},
        };
    }
    _navigateHistory(previous) {
        const entry = previous ? this._history.previous() : this._history.next();
        const inputText = entry?.inputText ?? '';
        if (entry) {
            this._editor?.getModel()?.setValue(inputText);
            this._contextAttachments.setAttachments(entry.attachments);
        }
        aria.status(inputText);
        if (previous) {
            this._editor.setPosition({ lineNumber: 1, column: 1 });
        }
        else {
            const model = this._editor.getModel();
            if (model) {
                const lastLine = model.getLineCount();
                this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
            }
        }
    }
    // --- Send ---
    _updateSendButtonState() {
        if (!this._sendButton) {
            return;
        }
        const hasText = !!this._editor?.getModel()?.getValue().trim();
        const session = this.sessionsManagementService.activeSession.get();
        const hasActiveSession = !!session;
        const isLoading = session?.loading.get() ?? false;
        this._sendButton.enabled = !this._sending && hasText && hasActiveSession && !isLoading;
    }
    async _send() {
        let query = this._editor.getModel()?.getValue().trim();
        if (!query || this._sending) {
            return;
        }
        // If no workspace is selected, open the picker
        if (!this._hasRequiredRepoOrFolderSelection()) {
            this._openRepoOrFolderPicker();
            return;
        }
        // Check for slash commands first
        if (this._slashCommandHandler?.tryExecuteSlashCommand(query)) {
            this._editor.getModel()?.setValue('');
            return;
        }
        // Expand prompt/skill slash commands into a CLI-friendly reference
        const expanded = this._slashCommandHandler?.tryExpandPromptSlashCommand(query);
        if (expanded) {
            query = expanded;
        }
        const attachedContext = this._contextAttachments.attachments.length > 0
            ? [...this._contextAttachments.attachments]
            : undefined;
        if (this._draftState) {
            this._history.append(this._toHistoryEntry(this._draftState));
        }
        this._clearDraftState();
        this._sending = true;
        this._editor.updateOptions({ readOnly: true });
        this._updateSendButtonState();
        this._updateInputLoadingState();
        try {
            const session = this.sessionsManagementService.activeSession.get();
            if (!session) {
                return;
            }
            await this.sessionsManagementService.sendAndCreateChat(session, { query, attachedContext });
            this._contextAttachments.clear();
            this._editor.getModel()?.setValue('');
        }
        catch (e) {
            this.logService.error('Failed to send request:', e);
        }
        this._sending = false;
        this._editor.updateOptions({ readOnly: false });
        this._updateSendButtonState();
        this._updateInputLoadingState();
    }
    /**
     * Checks whether the required folder/repo selection exists for the given session type.
     * For Local/Background targets, checks the folder picker.
     * For other targets, checks extension-contributed repo/folder option groups.
     */
    _hasRequiredRepoOrFolderSelection() {
        return !!this._workspacePicker.selectedProject;
    }
    _openRepoOrFolderPicker() {
        this._workspacePicker.showPicker();
    }
    async _requestFolderTrust(folderUri) {
        const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
            uri: folderUri,
            message: localize('trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
        });
        if (!trusted) {
            this._workspacePicker.removeFromRecents(folderUri);
        }
        return !!trusted;
    }
    _restoreState() {
        const draft = this._getDraftState();
        if (draft) {
            this._editor?.getModel()?.setValue(draft.inputText);
            if (draft.attachments?.length) {
                this._contextAttachments.setAttachments(draft.attachments.map(IChatRequestVariableEntry.fromExport));
            }
        }
    }
    _getDraftState() {
        const raw = this.storageService.get(STORAGE_KEY_DRAFT_STATE, 1 /* StorageScope.WORKSPACE */);
        if (!raw) {
            return undefined;
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    _clearDraftState() {
        this._draftState = { inputText: '', attachments: [] };
        this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(this._draftState), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    saveState() {
        if (this._draftState) {
            const state = {
                ...this._draftState,
                attachments: this._draftState.attachments.map(IChatRequestVariableEntry.toExport),
            };
            this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(state), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    layout(_height, _width) {
        this._editor?.layout();
    }
    focusInput() {
        this._editor?.focus();
    }
    /**
     * Handles a workspace selection from the workspace picker.
     * Requests folder trust if needed and creates a new session.
     */
    async _onWorkspaceSelected(selection) {
        if (selection.workspace.requiresWorkspaceTrust) {
            const workspaceUri = selection.workspace.repositories[0]?.uri;
            if (workspaceUri && !await this._requestFolderTrust(workspaceUri)) {
                return;
            }
        }
        this._createNewSession(selection);
    }
    prefillInput(text) {
        const editor = this._editor;
        const model = editor?.getModel();
        if (editor && model) {
            model.setValue(text);
            const lastLine = model.getLineCount();
            const maxColumn = model.getLineMaxColumn(lastLine);
            editor.setPosition({ lineNumber: lastLine, column: maxColumn });
            editor.focus();
        }
    }
    sendQuery(text) {
        const model = this._editor?.getModel();
        if (model) {
            model.setValue(text);
            this._send();
        }
    }
    selectWorkspace(workspace) {
        this._workspacePicker.setSelectedWorkspace(workspace);
    }
};
NewChatWidget = __decorate([
    __param(0, IInstantiationService),
    __param(1, IModelService),
    __param(2, IConfigurationService),
    __param(3, IContextKeyService),
    __param(4, ILogService),
    __param(5, IHoverService),
    __param(6, ISessionsManagementService),
    __param(7, ISessionsProvidersService),
    __param(8, IStorageService),
    __param(9, IWorkspaceTrustRequestService)
], NewChatWidget);
// #endregion
// #region --- New Chat View Pane ---
export const SessionsViewId = 'workbench.view.sessions.chat';
/**
 * A view pane that hosts the new-session welcome widget.
 */
let NewChatViewPane = class NewChatViewPane extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    }
    renderBody(container) {
        super.renderBody(container);
        this._widget = this._register(this.instantiationService.createInstance(NewChatWidget));
        this._widget.render(container);
        this._widget.focusInput();
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this._widget?.layout(height, width);
    }
    focus() {
        super.focus();
        this._widget?.focusInput();
    }
    prefillInput(text) {
        this._widget?.prefillInput(text);
    }
    sendQuery(text) {
        this._widget?.sendQuery(text);
    }
    selectWorkspace(workspace) {
        this._widget?.selectWorkspace(workspace);
    }
    setVisible(visible) {
        super.setVisible(visible);
        if (visible) {
            this._widget?.focusInput();
        }
    }
    saveState() {
        this._widget?.saveState();
    }
    dispose() {
        this._widget?.saveState();
        super.dispose();
    }
};
NewChatViewPane = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService)
], NewChatViewPane);
export { NewChatViewPane };
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3Q2hhdFZpZXdQYW5lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGF0L2Jyb3dzZXIvbmV3Q2hhdFZpZXdQYW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sd0JBQXdCLENBQUM7QUFDaEMsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQTRCLE1BQU0sa0VBQWtFLENBQUM7QUFDOUgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFB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