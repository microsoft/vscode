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
var AgentSessionsWelcomePage_1;
import './media/agentSessionsWelcome.css';
import { $, addDisposableListener, append, clearNode, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { getListStyles, getToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../chat/common/constants.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../chat/browser/agentSessions/agentSessions.js';
import { AgentSessionsWelcomeInput } from './agentSessionsWelcomeInput.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatViewId, IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatSessionPosition, getResourceForNewChatSession } from '../../chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { AgentSessionsControl } from '../../chat/browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter } from '../../chat/browser/agentSessions/agentSessionsFilter.js';
import { AgentSessionsListDelegate } from '../../chat/browser/agentSessions/agentSessionsViewer.js';
import { IWalkthroughsService } from '../../welcomeGettingStarted/browser/gettingStartedService.js';
import { GettingStartedInput } from '../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspacesService, isRecentFolder, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
const configurationKey = 'workbench.startupEditor';
const MAX_SESSIONS = 6;
const MAX_REPO_PICKS = 10;
const MAX_WALKTHROUGHS = 10;
const WELCOME_CHAT_INPUT_LAYOUT_HEIGHT = 150;
const WELCOME_CHAT_INPUT_RESERVED_LIST_HEIGHT = 50;
const WELCOME_CHAT_INPUT_RESERVED_CHROME_HEIGHT = 72;
// Mirror ChatWidget's compact-surface sizing so the hidden list reservation and input chrome do not collapse the editor.
const WELCOME_CHAT_INPUT_MAX_HEIGHT_OVERRIDE = WELCOME_CHAT_INPUT_LAYOUT_HEIGHT + WELCOME_CHAT_INPUT_RESERVED_LIST_HEIGHT + WELCOME_CHAT_INPUT_RESERVED_CHROME_HEIGHT;
let AgentSessionsWelcomePage = class AgentSessionsWelcomePage extends EditorPane {
    static { AgentSessionsWelcomePage_1 = this; }
    static { this.ID = 'agentSessionsWelcomePage'; }
    static { this.COMMAND_ID = 'workbench.action.openAgentSessionsWelcome'; }
    constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, layoutService, commandService, editorService, agentSessionsService, configurationService, productService, walkthroughsService, chatService, chatEntitlementService, markdownRendererService, workspaceContextService, workspacesService, hostService, workspaceTrustManagementService, viewDescriptorService, chatWidgetService, logService) {
        super(AgentSessionsWelcomePage_1.ID, group, telemetryService, themeService, storageService);
        this.storageService = storageService;
        this.instantiationService = instantiationService;
        this.layoutService = layoutService;
        this.commandService = commandService;
        this.editorService = editorService;
        this.agentSessionsService = agentSessionsService;
        this.configurationService = configurationService;
        this.productService = productService;
        this.walkthroughsService = walkthroughsService;
        this.chatService = chatService;
        this.chatEntitlementService = chatEntitlementService;
        this.markdownRendererService = markdownRendererService;
        this.workspaceContextService = workspaceContextService;
        this.workspacesService = workspacesService;
        this.hostService = hostService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.viewDescriptorService = viewDescriptorService;
        this.chatWidgetService = chatWidgetService;
        this.logService = logService;
        this.sessionsControlDisposables = this._register(new DisposableStore());
        this.contentDisposables = this._register(new DisposableStore());
        this.walkthroughs = [];
        this._selectedSessionProvider = AgentSessionProviders.Local;
        this._recentTrustedWorkspaces = [];
        this._isEmptyWorkspace = false;
        this._workspaceKind = 'empty';
        // Telemetry tracking
        this._openedAt = 0;
        this.container = $('.agentSessionsWelcome', {
            role: 'document',
            tabindex: 0,
            'aria-label': localize('agentSessionsWelcomeAriaLabel', "Overview of agent sessions and how to get started.")
        });
        this.contextService = this._register(contextKeyService.createScoped(this.container));
        ChatContextKeys.inAgentSessionsWelcome.bindTo(this.contextService).set(true);
        this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
            const input = this.input || this._storedInput;
            if (this.chatEntitlementService.sentiment.hidden && input) {
                this._closedBy = 'chatHidden';
                this.group.closeEditor(input);
            }
        }));
    }
    createEditor(parent) {
        parent.appendChild(this.container);
        // Create scrollable content
        this.contentContainer = $('.agentSessionsWelcome-content');
        this.scrollableElement = this._register(new DomScrollableElement(this.contentContainer, {
            className: 'agentSessionsWelcome-scrollable',
            vertical: 1 /* ScrollbarVisibility.Auto */
        }));
        this.container.appendChild(this.scrollableElement.getDomNode());
    }
    async setInput(input, options, context, token) {
        this._storedInput = input;
        this._openedAt = Date.now();
        await super.setInput(input, options, context, token);
        this._workspaceKind = input.workspaceKind ?? 'empty';
        await this.buildContent();
    }
    clearInput() {
        // Send closed telemetry when the editor is closed
        if (this._openedAt > 0) {
            const visibleDurationMs = Date.now() - this._openedAt;
            this.telemetryService.publicLog2('agentSessionsWelcome.closed', {
                visibleDurationMs,
                closedBy: this._closedBy ?? 'disposed'
            });
            this._openedAt = 0;
            this._closedBy = undefined;
        }
        super.clearInput();
    }
    async buildContent() {
        this.contentDisposables.clear();
        this.sessionsControlDisposables.clear();
        this.sessionsControl = undefined;
        clearNode(this.contentContainer);
        // Detect empty workspace and fetch recent workspaces
        this._isEmptyWorkspace = this.workspaceContextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */;
        if (this._isEmptyWorkspace) {
            const recentlyOpened = await this.getRecentlyOpenedWorkspaces(true);
            this._recentTrustedWorkspaces = recentlyOpened.slice(0, MAX_REPO_PICKS);
        }
        // Get walkthroughs
        this.walkthroughs = this.walkthroughsService.getWalkthroughs();
        // Header
        const header = append(this.contentContainer, $('.agentSessionsWelcome-header'));
        append(header, $('h1.product-name', {}, this.productService.nameLong));
        const startEntries = append(header, $('.agentSessionsWelcome-startEntries'));
        await this.buildStartEntries(startEntries);
        // Chat input section
        const chatSection = append(this.contentContainer, $('.agentSessionsWelcome-chatSection'));
        this.buildChatWidget(chatSection);
        // Sessions or walkthroughs
        const sessionsSection = append(this.contentContainer, $('.agentSessionsWelcome-sessionsSection'));
        this.buildSessionsOrPrompts(sessionsSection);
        // Footer
        const footer = append(this.contentContainer, $('.agentSessionsWelcome-footer'));
        this.buildFooter(footer);
        // Listen for session changes - store reference to avoid querySelector
        let originalSessions = this.agentSessionsService.model.sessions.length > 0;
        this.contentDisposables.add(this.agentSessionsService.model.onDidChangeSessions(() => {
            const hasSessions = this.agentSessionsService.model.sessions.length > 0;
            // Only rebuild if the amount of sessions changed, other updates should be managed by the control
            if (hasSessions !== originalSessions) {
                originalSessions = hasSessions;
                clearNode(sessionsSection);
                this.buildSessionsOrPrompts(sessionsSection);
            }
            this.layoutSessionsControl();
        }));
        this.scrollableElement?.scanDomNode();
    }
    async buildStartEntries(container) {
        const workspaces = await this.getRecentlyOpenedWorkspaces(false);
        const openEntry = workspaces.length > 0
            ? { icon: Codicon.folderOpened, label: localize('openRecent', "Open Recent..."), command: 'workbench.action.openRecent' }
            : { icon: Codicon.folderOpened, label: localize('openFolder', "Open Folder..."), command: 'workbench.action.files.openFolder' };
        const entries = [
            openEntry,
            { icon: Codicon.newFile, label: localize('newFile', "New file..."), command: 'welcome.showNewFileEntries' },
            { icon: Codicon.repoClone, label: localize('cloneRepo', "Clone Git Repository..."), command: 'git.clone' },
        ];
        for (const entry of entries) {
            const button = append(container, $('button.agentSessionsWelcome-startEntry'));
            button.appendChild(renderIcon(entry.icon));
            button.appendChild(document.createTextNode(entry.label));
            button.onclick = () => {
                this.telemetryService.publicLog2('agentSessionsWelcome.ActionExecuted', { welcomeKind: 'agentSessionsWelcomePage', action: 'executeCommand', actionId: entry.command });
                this.commandService.executeCommand(entry.command);
            };
        }
    }
    buildChatWidget(container) {
        const chatWidgetContainer = append(container, $('.agentSessionsWelcome-chatWidget'));
        // Create editor overflow widgets container
        const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatWidgetContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
        this.contentDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
        // Create ChatWidget with scoped services
        const scopedContextKeyService = this.contentDisposables.add(this.contextService.createScoped(chatWidgetContainer));
        const scopedInstantiationService = this.contentDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
        // Create a delegate for the session target picker with independent local state
        const onDidChangeActiveSessionProvider = this.contentDisposables.add(new Emitter());
        const recreateSessionForProvider = async (provider) => {
            if (this.chatWidget && this.chatModelRef) {
                this.chatWidget.setModel(undefined);
                this.chatModelRef.dispose();
                const newResource = getResourceForNewChatSession({
                    type: provider,
                    position: ChatSessionPosition.Sidebar,
                    displayName: ''
                });
                const ref = await this.chatService.acquireOrLoadSession(newResource, ChatAgentLocation.Chat, CancellationToken.None);
                this.chatModelRef = ref ?? this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
                this.contentDisposables.add(this.chatModelRef);
                if (this.chatModelRef.object) {
                    this.chatWidget.setModel(this.chatModelRef.object);
                }
            }
        };
        const sessionTypePickerDelegate = {
            getActiveSessionProvider: () => this._selectedSessionProvider,
            setActiveSessionProvider: (provider) => {
                this._selectedSessionProvider = provider;
                onDidChangeActiveSessionProvider.fire(provider);
                try {
                    recreateSessionForProvider(provider);
                }
                catch { /* Ignore errors */ }
            },
            onDidChangeActiveSessionProvider: onDidChangeActiveSessionProvider.event
        };
        // Create workspace picker delegate for empty workspace scenarios
        const onDidChangeSelectedWorkspace = this.contentDisposables.add(new Emitter());
        const onDidChangeWorkspaces = this.contentDisposables.add(new Emitter());
        const workspacePickerDelegate = this._isEmptyWorkspace ? {
            getWorkspaces: () => this._recentTrustedWorkspaces.map(w => ({
                uri: this.getWorkspaceUri(w),
                label: this.getWorkspaceLabel(w),
                isFolder: isRecentFolder(w),
            })),
            getSelectedWorkspace: () => this._selectedWorkspace,
            setSelectedWorkspace: (workspace) => {
                this._selectedWorkspace = workspace;
                onDidChangeSelectedWorkspace.fire(workspace);
            },
            onDidChangeSelectedWorkspace: onDidChangeSelectedWorkspace.event,
            onDidChangeWorkspaces: onDidChangeWorkspaces.event,
            openFolderCommand: 'workbench.action.files.openFolder',
        } : undefined;
        this.chatWidget = this.contentDisposables.add(scopedInstantiationService.createInstance(ChatWidget, ChatAgentLocation.Chat, 
        // TODO: @osortega should we have a completely different ID and check that context instead in chatInputPart?
        {}, // Empty resource view context
        {
            autoScroll: mode => mode !== ChatModeKind.Ask,
            renderFollowups: false,
            supportsFileReferences: true,
            renderInputOnTop: true,
            rendererOptions: {
                renderTextEditsAsSummary: () => true,
                referencesExpandedWhenEmptyResponse: false,
                progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
            },
            editorOverflowWidgetsDomNode,
            enableImplicitContext: true,
            enableWorkingSet: 'explicit',
            supportsChangingModes: true,
            sessionTypePickerDelegate,
            workspacePickerDelegate,
            submitHandler: this._isEmptyWorkspace ? (query, mode) => this.handleWorkspaceSubmission(query, mode) : undefined,
        }, {
            listForeground: SIDE_BAR_FOREGROUND,
            listBackground: editorBackground,
            overlayBackground: editorBackground,
            inputEditorBackground: editorBackground,
            resultEditorBackground: editorBackground,
        }));
        this.chatWidget.render(chatWidgetContainer);
        this.chatWidget.setVisible(true);
        // Schedule initial layout at next animation frame to ensure proper input sizing
        this.contentDisposables.add(scheduleAtNextAnimationFrame(getWindow(chatWidgetContainer), () => {
            this.layoutChatWidget();
        }));
        // Start a chat session so the widget has a viewModel
        // This is necessary for actions like mode switching to work properly
        this.chatModelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
        this.contentDisposables.add(this.chatModelRef);
        if (this.chatModelRef.object) {
            this.chatWidget.setModel(this.chatModelRef.object);
        }
        // Focus the input when clicking anywhere in the chat widget area
        // This ensures our widget becomes lastFocusedWidget for the chatWidgetService
        this.contentDisposables.add(addDisposableListener(chatWidgetContainer, 'mousedown', () => {
            this.chatWidget?.focusInput();
        }));
        // Automatically open the chat view when a request is submitted from this welcome view
        this.contentDisposables.add(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
            if (this.chatModelRef?.object?.sessionResource.toString() === chatSessionResource.toString()) {
                // Send chat submitted telemetry
                const mode = this.chatWidget?.input.currentModeObs.get().name.get() || 'unknown';
                this.telemetryService.publicLog2('agentSessionsWelcome.chatSubmitted', {
                    mode,
                    provider: this._selectedSessionProvider,
                    workspaceKind: this._workspaceKind,
                    selectedRecentWorkspace: this._selectedWorkspace !== undefined
                });
                this._closedBy = 'chatSubmission';
                this.openSessionInChat(chatSessionResource);
            }
        }));
        // Check for prefill data from a workspace transfer
        this.applyPrefillData();
    }
    getWorkspaceLabel(workspace) {
        if (isRecentFolder(workspace)) {
            return workspace.label || basename(workspace.folderUri);
        }
        else if (isRecentWorkspace(workspace)) {
            return workspace.label || basename(workspace.workspace.configPath);
        }
        return '';
    }
    getWorkspaceUri(workspace) {
        if (isRecentFolder(workspace)) {
            return workspace.folderUri;
        }
        else if (isRecentWorkspace(workspace)) {
            return workspace.workspace.configPath;
        }
        throw new Error('Invalid workspace type');
    }
    async handleWorkspaceSubmission(query, mode) {
        // Only handle if a workspace is selected
        if (!this._selectedWorkspace) {
            return false;
        }
        if (!query.trim()) {
            return false;
        }
        // Store the prefill data for the target workspace to read on startup
        const prefillData = {
            query,
            mode,
            timestamp: Date.now(),
        };
        this.storageService.store('chat.welcomeViewPrefill', JSON.stringify(prefillData), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        // Find the workspace to determine if it's a folder or workspace file
        const workspace = this._recentTrustedWorkspaces.find(w => this.getWorkspaceUri(w).toString() === this._selectedWorkspace?.uri.toString());
        if (workspace) {
            try {
                if (isRecentFolder(workspace)) {
                    await this.hostService.openWindow([{ folderUri: workspace.folderUri }]);
                }
                else if (isRecentWorkspace(workspace)) {
                    await this.hostService.openWindow([{ workspaceUri: workspace.workspace.configPath }]);
                }
                return true;
            }
            catch (e) {
                // Ignore errors
            }
        }
        this.storageService.remove('chat.welcomeViewPrefill', -1 /* StorageScope.APPLICATION */);
        return false;
    }
    /**
     * Reads and applies prefill data from storage (used when transferring chat input from another workspace).
     * This is called after the chat widget is created to populate it with any pending prefill data.
     */
    applyPrefillData() {
        const prefillData = this.storageService.get('chat.welcomeViewPrefill', -1 /* StorageScope.APPLICATION */);
        if (prefillData) {
            // Remove immediately to prevent re-application
            this.storageService.remove('chat.welcomeViewPrefill', -1 /* StorageScope.APPLICATION */);
            try {
                const { query, mode, timestamp } = JSON.parse(prefillData);
                // Invalidate entries older than 1 minute
                if (timestamp && Date.now() - timestamp > 60 * 1000) {
                    return;
                }
                if (query && this.chatWidget) {
                    this.chatWidget.setInput(query);
                }
                if (mode !== undefined && this.chatWidget) {
                    this.chatWidget.input.setChatMode(mode, false);
                }
                // Focus the input to make it clear we've prefilled
                this.chatWidget?.focusInput();
            }
            catch {
                // Ignore malformed prefill data
            }
        }
    }
    buildSessionsOrPrompts(container) {
        // Clear previous sessions control
        this.sessionsControlDisposables.clear();
        this.sessionsControl = undefined;
        const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
        if (sessions.length > 0) {
            this.buildSessionsGrid(container, sessions);
        }
        else {
            this.buildWalkthroughs(container);
        }
    }
    buildSessionsGrid(container, _sessions) {
        // Show cached sessions immediately if available, otherwise show loading skeleton
        this.sessionsControlContainer = append(container, $('.agentSessionsWelcome-sessionsGrid'));
        const options = {
            overrideStyles: getListStyles({
                listBackground: editorBackground,
            }),
            filter: this.sessionsControlDisposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {
                limitResults: () => MAX_SESSIONS,
                overrideExclude: (session) => session.isArchived() ? true : undefined,
            })),
            getHoverPosition: () => 2 /* HoverPosition.BELOW */,
            trackActiveEditorSession: () => false,
            source: 'welcomeView',
            notifySessionOpened: () => {
                const isProjectionEnabled = this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled);
                if (!isProjectionEnabled) {
                    this._closedBy = 'sessionClicked';
                    this.revealMaximizedChat();
                }
            }
        };
        this.sessionsControl = this.sessionsControlDisposables.add(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, options));
        // Listen for loading state changes to toggle skeleton visibility
        this.sessionsControlDisposables.add(this.agentSessionsService.model.onDidResolve(() => {
            this.layoutSessionsControl();
        }));
        if (this.agentSessionsService.model.resolved) {
            this.layoutSessionsControl();
        }
        // Schedule layout at next animation frame to ensure proper rendering
        this.sessionsControlDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.sessionsControlContainer), () => {
            this.layoutSessionsControl();
        }));
        // "View all sessions" link
        const openButton = append(container, $('button.agentSessionsWelcome-openSessionsButton'));
        openButton.textContent = localize('viewAllSessions', "View All Sessions");
        openButton.onclick = () => {
            this._closedBy = 'viewAllSessions';
            this.revealMaximizedChat();
        };
    }
    buildWalkthroughs(container) {
        const activeWalkthroughs = this.walkthroughs.filter(w => !w.when || this.contextService.contextMatchesRules(w.when)).slice(0, MAX_WALKTHROUGHS);
        if (activeWalkthroughs.length === 0) {
            return;
        }
        let currentIndex = 0;
        const card = append(container, $('.agentSessionsWelcome-walkthroughCard'));
        // Icon
        const iconContainer = append(card, $('.agentSessionsWelcome-walkthroughCard-icon'));
        // Content
        const content = append(card, $('.agentSessionsWelcome-walkthroughCard-content'));
        const title = append(content, $('.agentSessionsWelcome-walkthroughCard-title'));
        const desc = append(content, $('.agentSessionsWelcome-walkthroughCard-description'));
        // Navigation arrows container
        const navContainer = append(card, $('.agentSessionsWelcome-walkthroughCard-nav'));
        const prevButton = append(navContainer, $('button.nav-button'));
        prevButton.appendChild(renderIcon(Codicon.chevronLeft));
        prevButton.title = localize('previousWalkthrough', "Previous");
        const nextButton = append(navContainer, $('button.nav-button'));
        nextButton.appendChild(renderIcon(Codicon.chevronRight));
        nextButton.title = localize('nextWalkthrough', "Next");
        const updateContent = () => {
            const walkthrough = activeWalkthroughs[currentIndex];
            // Update icon
            clearNode(iconContainer);
            if (walkthrough.icon.type === 'icon') {
                iconContainer.appendChild(renderIcon(walkthrough.icon.icon));
            }
            // Update content
            title.textContent = walkthrough.title;
            desc.textContent = walkthrough.description || '';
            // Update navigation button states
            prevButton.disabled = currentIndex === 0;
            nextButton.disabled = currentIndex === activeWalkthroughs.length - 1;
        };
        // Initialize content
        updateContent();
        card.onclick = () => {
            const walkthrough = activeWalkthroughs[currentIndex];
            this.telemetryService.publicLog2('agentSessionsWelcome.ActionExecuted', { welcomeKind: 'agentSessionsWelcomePage', action: 'openWalkthrough', actionId: walkthrough.id });
            // Open walkthrough with returnToCommand so back button returns to agent sessions welcome
            const options = {
                selectedCategory: walkthrough.id,
                returnToCommand: AgentSessionsWelcomePage_1.COMMAND_ID,
            };
            this.editorService.openEditor({
                resource: GettingStartedInput.RESOURCE,
                options
            });
        };
        prevButton.onclick = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex--;
                updateContent();
            }
        };
        nextButton.onclick = (e) => {
            e.stopPropagation();
            if (currentIndex < activeWalkthroughs.length - 1) {
                currentIndex++;
                updateContent();
            }
        };
    }
    static { this.PRIVACY_NOTICE_DISMISSED_KEY = 'agentSessionsWelcome.privacyNoticeDismissed'; }
    buildPrivacyNotice(container) {
        // TOS/Privacy notice for users who are not signed in - reusing walkthrough card design
        if (!this.chatEntitlementService.anonymous) {
            return;
        }
        // Check if user has dismissed the notice
        if (this.storageService.getBoolean(AgentSessionsWelcomePage_1.PRIVACY_NOTICE_DISMISSED_KEY, -1 /* StorageScope.APPLICATION */, false)) {
            return;
        }
        const providers = this.productService.defaultChatAgent?.provider;
        if (!providers || !providers.default || !this.productService.defaultChatAgent?.termsStatementUrl || !this.productService.defaultChatAgent?.privacyStatementUrl) {
            return;
        }
        const tosCard = append(container, $('.agentSessionsWelcome-walkthroughCard.agentSessionsWelcome-tosCard'));
        const dismissNotice = () => {
            this.storageService.store(AgentSessionsWelcomePage_1.PRIVACY_NOTICE_DISMISSED_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            tosCard.remove();
        };
        // Dismiss the notice when a chat request is sent
        this.contentDisposables.add(this.chatService.onDidSubmitRequest(() => dismissNotice()));
        // Icon
        const iconContainer = append(tosCard, $('.agentSessionsWelcome-walkthroughCard-icon'));
        iconContainer.appendChild(renderIcon(Codicon.chatSparkle));
        // Content
        const content = append(tosCard, $('.agentSessionsWelcome-walkthroughCard-content'));
        const title = append(content, $('.agentSessionsWelcome-walkthroughCard-title'));
        title.textContent = localize('tosTitle', "Try GitHub Copilot for free, no sign-in required!");
        const desc = append(content, $('.agentSessionsWelcome-walkthroughCard-description'));
        const descriptionMarkdown = new MarkdownString(localize({ key: 'tosDescription', comment: ['{Locked="]({1})"}', '{Locked="]({2})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).", providers.default.name, this.productService.defaultChatAgent.termsStatementUrl, this.productService.defaultChatAgent.privacyStatementUrl), { isTrusted: true });
        const renderedMarkdown = this.markdownRendererService.render(descriptionMarkdown);
        desc.appendChild(renderedMarkdown.element);
        // Dismiss button
        const dismissButton = append(tosCard, $('button.agentSessionsWelcome-tosCard-dismiss'));
        dismissButton.appendChild(renderIcon(Codicon.close));
        dismissButton.title = localize('dismissPrivacyNotice', "Dismiss");
        dismissButton.onclick = (e) => {
            e.stopPropagation();
            dismissNotice();
        };
    }
    buildFooter(container) {
        // Privacy notice
        this.buildPrivacyNotice(container);
        // Show on startup checkbox
        const showOnStartupContainer = append(container, $('.agentSessionsWelcome-showOnStartup'));
        const showOnStartupCheckbox = this.contentDisposables.add(new Toggle({
            icon: Codicon.check,
            actionClassName: 'agentSessionsWelcome-checkbox',
            isChecked: this.configurationService.getValue(configurationKey) === 'agentSessionsWelcomePage',
            title: localize('checkboxTitle', "When checked, this page will be shown on startup."),
            ...getToggleStyles({
                inputActiveOptionBackground: 'var(--vscode-descriptionForeground)',
                inputActiveOptionForeground: 'var(--vscode-editor-background)',
                inputActiveOptionBorder: 'var(--vscode-descriptionForeground)',
            })
        }));
        showOnStartupCheckbox.domNode.id = 'showOnStartup';
        const showOnStartupLabel = $('label.caption', { for: 'showOnStartup' }, localize('showOnStartup', "Show welcome page on startup"));
        const onShowOnStartupChanged = () => {
            if (showOnStartupCheckbox.checked) {
                this.configurationService.updateValue(configurationKey, 'agentSessionsWelcomePage');
            }
            else {
                this.configurationService.updateValue(configurationKey, 'none');
            }
        };
        this.contentDisposables.add(showOnStartupCheckbox.onChange(() => onShowOnStartupChanged()));
        this.contentDisposables.add(addDisposableListener(showOnStartupLabel, 'click', () => {
            showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
            onShowOnStartupChanged();
        }));
        showOnStartupContainer.appendChild(showOnStartupCheckbox.domNode);
        showOnStartupContainer.appendChild(showOnStartupLabel);
    }
    layout(dimension) {
        this.lastDimension = dimension;
        this.container.style.height = `${dimension.height}px`;
        this.container.style.width = `${dimension.width}px`;
        // Layout chat widget
        this.layoutChatWidget();
        // Layout sessions control
        this.layoutSessionsControl();
        this.scrollableElement?.scanDomNode();
    }
    layoutChatWidget() {
        if (!this.chatWidget || !this.lastDimension) {
            return;
        }
        const chatWidth = Math.min(800, this.lastDimension.width - 80);
        this.chatWidget.setInputPartMaxHeightOverride(WELCOME_CHAT_INPUT_MAX_HEIGHT_OVERRIDE);
        this.chatWidget.layout(WELCOME_CHAT_INPUT_LAYOUT_HEIGHT, chatWidth);
    }
    layoutSessionsControl() {
        if (!this.sessionsControl || !this.sessionsControlContainer || !this.lastDimension) {
            return;
        }
        // TODO: @osortega this is a weird way of doing this, maybe we handle the 2-colum layout in the control itself?
        const sessionsWidth = Math.min(800, this.lastDimension.width - 80);
        // Calculate height based on actual visible sessions (capped at MAX_SESSIONS)
        // Use ITEM_HEIGHT per item from AgentSessionsListDelegate
        // Give the list FULL height so virtualization renders all items
        // CSS transforms handle the 2-column visual layout
        const visibleSessions = Math.min(this.agentSessionsService.model.sessions.filter(s => !s.isArchived()).length, MAX_SESSIONS);
        const sessionsHeight = visibleSessions * AgentSessionsListDelegate.ITEM_HEIGHT;
        this.sessionsControl.layout(sessionsHeight, sessionsWidth);
        // Set margin offset for 2-column layout: actual height - visual height
        // Visual height = ceil(n/2) * ITEM_HEIGHT, so offset = floor(n/2) * ITEM_HEIGHT
        const marginOffset = Math.floor(visibleSessions / 2) * AgentSessionsListDelegate.ITEM_HEIGHT;
        this.sessionsControl.element.style.marginBottom = `-${marginOffset}px`;
    }
    focus() {
        super.focus();
        this.chatWidget?.focusInput();
    }
    async revealMaximizedChat() {
        try {
            await this.closeEditorAndMaximizeAuxiliaryBar();
        }
        catch (error) {
            this.logService.error('Failed to open maximized chat: {0}', toErrorMessage(error));
        }
    }
    async openSessionInChat(sessionResource) {
        try {
            await this.closeEditorAndMaximizeAuxiliaryBar(sessionResource);
        }
        catch (error) {
            this.logService.error('Failed to open agent session: {0}', toErrorMessage(error));
        }
    }
    async closeEditorAndMaximizeAuxiliaryBar(sessionResource) {
        const editorToClose = this.input || this._storedInput;
        if (editorToClose && this.group.contains(editorToClose)) {
            // Wait until the active editor changed so that the chat doesn't toggle back
            await new Promise(resolve => {
                const disposable = this.group.onDidActiveEditorChange(e => {
                    disposable.dispose();
                    resolve();
                });
                this.group.closeEditor(editorToClose);
            });
        }
        // Now proceed with opening chat and maximizing
        if (sessionResource) {
            await this.chatWidgetService.openSession(sessionResource);
        }
        else {
            await this.commandService.executeCommand('workbench.action.chat.open');
        }
        const chatViewLocation = this.viewDescriptorService.getViewLocationById(ChatViewId);
        if (chatViewLocation === 2 /* ViewContainerLocation.AuxiliaryBar */) {
            this.layoutService.setAuxiliaryBarMaximized(true);
        }
    }
    async getRecentlyOpenedWorkspaces(onlyTrusted = false) {
        const workspaces = await this.workspacesService.getRecentlyOpened();
        const trustInfoPromises = workspaces.workspaces.map(async (ws) => {
            const uri = isRecentWorkspace(ws) ? ws.workspace.configPath : ws.folderUri;
            const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(uri);
            return { workspace: ws, trusted: trustInfo.trusted };
        });
        const trustInfoResults = await Promise.all(trustInfoPromises);
        const filteredWorkspaces = trustInfoResults
            .filter(result => onlyTrusted ? result.trusted : true)
            .map(result => result.workspace);
        return filteredWorkspaces;
    }
};
AgentSessionsWelcomePage = AgentSessionsWelcomePage_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService),
    __param(6, IWorkbenchLayoutService),
    __param(7, ICommandService),
    __param(8, IEditorService),
    __param(9, IAgentSessionsService),
    __param(10, IConfigurationService),
    __param(11, IProductService),
    __param(12, IWalkthroughsService),
    __param(13, IChatService),
    __param(14, IChatEntitlementService),
    __param(15, IMarkdownRendererService),
    __param(16, IWorkspaceContextService),
    __param(17, IWorkspacesService),
    __param(18, IHostService),
    __param(19, IWorkspaceTrustManagementService),
    __param(20, IViewDescriptorService),
    __param(21, IChatWidgetService),
    __param(22, ILogService)
], AgentSessionsWelcomePage);
export { AgentSessionsWelcomePage };
export class AgentSessionsWelcomeInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(editorInput) {
        return JSON.stringify({});
    }
    deserialize(instantiationService, serializedEditorInput) {
        return new AgentSessionsWelcomeInput({});
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1dlbGNvbWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lQWdlbnRTZXNzaW9ucy9icm93c2VyL2FnZW50U2Vzc2lvbnNXZWxjb21lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLGtDQUFrQyxDQUFDO0FBQzFDLE9BQU8sRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBYSxTQUFTLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsSixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFjLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFP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