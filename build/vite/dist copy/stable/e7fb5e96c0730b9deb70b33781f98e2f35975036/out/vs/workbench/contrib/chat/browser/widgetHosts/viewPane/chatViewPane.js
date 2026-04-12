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
var ChatViewPane_1;
import './media/chatViewPane.css';
import { $, addDisposableListener, append, EventHelper, EventType, getWindow, setVisibility } from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Sash } from '../../../../../../base/browser/ui/sash/sash.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { editorBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { ChatViewTitleControl } from './chatViewTitleControl.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../../../common/theme.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { CHAT_PROVIDER_ID } from '../../../common/participants/chatParticipantContribTypes.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { LocalChatSessionUri, getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { AgentSessionsControl } from '../../agentSessions/agentSessionsControl.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { ChatWidget } from '../../widget/chatWidget.js';
import { ChatViewWelcomeController } from '../../viewsWelcome/chatViewWelcomeController.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from '../../agentSessions/agentSessions.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { ChatViewId } from '../../chat.js';
import { IActivityService, ProgressBadge } from '../../../../../services/activity/common/activity.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { AgentSessionsFilter, AgentSessionsGrouping } from '../../agentSessions/agentSessionsFilter.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
let ChatViewPane = class ChatViewPane extends ViewPane {
    static { ChatViewPane_1 = this; }
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, storageService, chatService, chatAgentService, logService, notificationService, layoutService, chatSessionsService, telemetryService, lifecycleService, progressService, agentSessionsService, chatEntitlementService, commandService, activityService, workbenchEnvironmentService, hostService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.storageService = storageService;
        this.chatService = chatService;
        this.chatAgentService = chatAgentService;
        this.logService = logService;
        this.notificationService = notificationService;
        this.layoutService = layoutService;
        this.chatSessionsService = chatSessionsService;
        this.telemetryService = telemetryService;
        this.progressService = progressService;
        this.agentSessionsService = agentSessionsService;
        this.chatEntitlementService = chatEntitlementService;
        this.commandService = commandService;
        this.activityService = activityService;
        this.workbenchEnvironmentService = workbenchEnvironmentService;
        this.hostService = hostService;
        this.lastDimensionsPerOrientation = new Map();
        this.loadSessionCts = this._register(new MutableDisposable());
        this.modelRef = this._register(new MutableDisposable());
        this._previousModelRef = this._register(new MutableDisposable());
        this.activityBadge = this._register(new MutableDisposable());
        this.sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
        this.sessionsViewerOrientationConfiguration = 'sideBySide';
        this.sessionsViewerSashDisposables = this._register(new MutableDisposable());
        //#region Layout
        this.layoutingBody = false;
        // View state for the ViewPane is currently global per-provider basically,
        // but some other strictly per-model state will require a separate memento.
        this.memento = new Memento(`interactive-session-view-${CHAT_PROVIDER_ID}`, this.storageService);
        this.viewState = this.memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        if (lifecycleService.startupKind !== 3 /* StartupKind.ReloadedWindow */ &&
            this.configurationService.getValue(ChatConfiguration.RestoreLastPanelSession) === false) {
            // clear persisted session on fresh start
            this.viewState.sessionId = undefined;
            this.viewState.sessionResource = undefined;
        }
        this.sessionsViewerVisible = false; // will be updated from layout code
        this.sessionsViewerSidebarWidth = Math.max(ChatViewPane_1.SESSIONS_SIDEBAR_MIN_WIDTH, this.viewState.sessionsSidebarWidth ?? ChatViewPane_1.SESSIONS_SIDEBAR_DEFAULT_WIDTH);
        // Contextkeys
        this.chatViewLocationContext = ChatContextKeys.panelLocation.bindTo(contextKeyService);
        this.sessionsViewerOrientationContext = ChatContextKeys.agentSessionsViewerOrientation.bindTo(contextKeyService);
        this.sessionsViewerPositionContext = ChatContextKeys.agentSessionsViewerPosition.bindTo(contextKeyService);
        this.sessionsViewerVisibilityContext = ChatContextKeys.agentSessionsViewerVisible.bindTo(contextKeyService);
        this.updateContextKeys();
        this.registerListeners();
    }
    updateContextKeys() {
        const { position, location } = this.getViewPositionAndLocation();
        this.chatViewLocationContext.set(location ?? 2 /* ViewContainerLocation.AuxiliaryBar */);
        this.sessionsViewerOrientationContext.set(this.sessionsViewerOrientation);
        this.sessionsViewerPositionContext.set(position === 1 /* Position.RIGHT */ ? AgentSessionsViewerPosition.Right : AgentSessionsViewerPosition.Left);
    }
    getViewPositionAndLocation() {
        const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
        const sideBarPosition = this.layoutService.getSideBarPosition();
        const panelPosition = this.layoutService.getPanelPosition();
        let sideSessionsOnRightPosition;
        switch (viewLocation) {
            case 0 /* ViewContainerLocation.Sidebar */:
                sideSessionsOnRightPosition = sideBarPosition === 1 /* Position.RIGHT */;
                break;
            case 1 /* ViewContainerLocation.Panel */:
                sideSessionsOnRightPosition = panelPosition !== 0 /* Position.LEFT */;
                break;
            default:
                sideSessionsOnRightPosition = sideBarPosition === 0 /* Position.LEFT */;
                break;
        }
        return {
            position: sideSessionsOnRightPosition ? 1 /* Position.RIGHT */ : 0 /* Position.LEFT */,
            location: viewLocation ?? 2 /* ViewContainerLocation.AuxiliaryBar */,
        };
    }
    getSessionHoverPosition() {
        const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
        const sideBarPosition = this.layoutService.getSideBarPosition();
        if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
            return viewLocation === 0 /* ViewContainerLocation.Sidebar */ && sideBarPosition === 1 /* Position.RIGHT */ ? 0 /* HoverPosition.LEFT */ : 1 /* HoverPosition.RIGHT */;
        }
        return {
            [0 /* Position.LEFT */]: 1 /* HoverPosition.RIGHT */,
            [1 /* Position.RIGHT */]: 0 /* HoverPosition.LEFT */,
            [3 /* Position.TOP */]: 2 /* HoverPosition.BELOW */,
            [2 /* Position.BOTTOM */]: 3 /* HoverPosition.ABOVE */
        }[viewLocation === 1 /* ViewContainerLocation.Panel */ ? this.layoutService.getPanelPosition() : sideBarPosition];
    }
    updateViewPaneClasses(fromEvent) {
        const activityBarLocationDefault = this.configurationService.getValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */) === 'default';
        this.viewPaneContainer?.classList.toggle('activity-bar-location-default', activityBarLocationDefault);
        this.viewPaneContainer?.classList.toggle('activity-bar-location-other', !activityBarLocationDefault);
        const { position, location } = this.getViewPositionAndLocation();
        this.viewPaneContainer?.classList.toggle('chat-view-location-auxiliarybar', location === 2 /* ViewContainerLocation.AuxiliaryBar */);
        this.viewPaneContainer?.classList.toggle('chat-view-location-sidebar', location === 0 /* ViewContainerLocation.Sidebar */);
        this.viewPaneContainer?.classList.toggle('chat-view-location-panel', location === 1 /* ViewContainerLocation.Panel */);
        this.viewPaneContainer?.classList.toggle('chat-view-position-left', position === 0 /* Position.LEFT */);
        this.viewPaneContainer?.classList.toggle('chat-view-position-right', position === 1 /* Position.RIGHT */);
        if (fromEvent) {
            this.relayout();
        }
    }
    registerListeners() {
        // Agent changes
        this._register(this.chatAgentService.onDidChangeAgents(() => this.onDidChangeAgents()));
        // Layout changes
        this._register(Event.any(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sideBar.location')), this.layoutService.onDidChangePanelPosition, Event.filter(this.viewDescriptorService.onDidChangeContainerLocation, e => e.viewContainer === this.viewDescriptorService.getViewContainerByViewId(this.id)))(() => {
            this.updateContextKeys();
            this.updateViewPaneClasses(true /* layout here */);
        }));
        // Settings changes
        this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => {
            return e.affectsConfiguration("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */);
        })(() => this.updateViewPaneClasses(true)));
    }
    onDidChangeAgents() {
        if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
            if (!this._widget?.viewModel && !this.restoringSession) {
                const sessionResource = this.getTransferredOrPersistedSessionInfo();
                this.restoringSession =
                    (sessionResource ? this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatViewPane#onDidChangeAgents') : Promise.resolve(undefined)).then(async (modelRef) => {
                        if (!this._widget) {
                            return; // renderBody has not been called yet
                        }
                        // The widget may be hidden at this point, because welcome views were allowed. Use setVisible to
                        // avoid doing a render while the widget is hidden. This is changing the condition in `shouldShowWelcome`
                        // so it should fire onDidChangeViewWelcomeState.
                        const wasVisible = this._widget.visible;
                        try {
                            this._widget.setVisible(false);
                            await this.showModel(CancellationToken.None, modelRef);
                        }
                        finally {
                            this._widget.setVisible(wasVisible);
                        }
                    });
                this.restoringSession.finally(() => this.restoringSession = undefined);
            }
        }
        this._onDidChangeViewWelcomeState.fire();
    }
    getTransferredOrPersistedSessionInfo() {
        if (this.chatService.transferredSessionResource) {
            return this.chatService.transferredSessionResource;
        }
        if (this.viewState.sessionResource) {
            return this.viewState.sessionResource;
        }
        return this.viewState.sessionId ? LocalChatSessionUri.forSession(this.viewState.sessionId) : undefined;
    }
    renderBody(parent) {
        super.renderBody(parent);
        this.telemetryService.publicLog2('chatViewPaneOpened');
        this.viewPaneContainer = parent;
        this.viewPaneContainer.classList.add('chat-viewpane');
        this.updateViewPaneClasses(false);
        this.createControls(parent);
        this.setupContextMenu(parent);
        this.applyModel();
    }
    createControls(parent) {
        // Sessions Control
        const sessionsControl = this.createSessionsControl(parent);
        // Welcome Control (used to show chat specific extension provided welcome views via `chatViewsWelcome` contribution point)
        const welcomeController = this.welcomeController = this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, ChatAgentLocation.Chat));
        // Chat Control
        const chatWidget = this.createChatControl(parent);
        // Controls Listeners
        this.registerControlsListeners(sessionsControl, chatWidget, welcomeController);
        // Update sessions control visibility when all controls are created
        this.updateSessionsControlVisibility();
    }
    //#region Sessions Control
    static { this.SESSIONS_SIDEBAR_MIN_WIDTH = 200; }
    static { this.SESSIONS_SIDEBAR_SNAP_THRESHOLD = this.SESSIONS_SIDEBAR_MIN_WIDTH / 2; } // snap to hide when dragged below half of minimum width
    static { this.SESSIONS_SIDEBAR_DEFAULT_WIDTH = 300; }
    static { this.CHAT_WIDGET_DEFAULT_WIDTH = 300; }
    static { this.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH = this.CHAT_WIDGET_DEFAULT_WIDTH + this.SESSIONS_SIDEBAR_DEFAULT_WIDTH; }
    createSessionsControl(parent) {
        const sessionsContainer = this.sessionsContainer = parent.appendChild($('.agent-sessions-container'));
        // Sessions Title
        const sessionsTitleContainer = this.sessionsTitleContainer = append(sessionsContainer, $('.agent-sessions-title-container'));
        const sessionsTitle = this.sessionsTitle = append(sessionsTitleContainer, $('span.agent-sessions-title'));
        sessionsTitle.textContent = localize('sessions', "Sessions");
        this._register(addDisposableListener(sessionsTitle, EventType.CLICK, () => {
            this.sessionsControl?.scrollToTop();
            this.sessionsControl?.focus();
        }));
        // Sessions Toolbar
        const sessionsToolbarContainer = append(sessionsTitleContainer, $('.agent-sessions-toolbar'));
        const sessionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionsToolbarContainer, MenuId.AgentSessionsToolbar, {
            menuOptions: { shouldForwardArgs: true }
        }));
        // Sessions Filter
        const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
            filterMenuId: MenuId.AgentSessionsViewerFilterSubMenu,
            groupResults: () => this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? AgentSessionsGrouping.Capped : AgentSessionsGrouping.Date
        }));
        this._register(Event.runAndSubscribe(sessionsFilter.onDidChange, () => {
            sessionsToolbarContainer.classList.toggle('filtered', !sessionsFilter.isDefault());
        }));
        // New Session Button
        const newSessionButtonContainer = this.sessionsNewButtonContainer = append(sessionsContainer, $('.agent-sessions-new-button-container'));
        const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
        newSessionButton.label = localize('newSession', "New Session");
        this._register(newSessionButton.onDidClick(() => this.commandService.executeCommand(ACTION_ID_NEW_CHAT)));
        // Sessions Control
        this.sessionsControlContainer = append(sessionsContainer, $('.agent-sessions-control-container'));
        const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
            source: 'chatViewPane',
            filter: sessionsFilter,
            overrideStyles: this.getLocationBasedColors().listOverrideStyles,
            getHoverPosition: () => this.getSessionHoverPosition(),
            trackActiveEditorSession: () => {
                return !this._widget || this._widget.isEmpty(); // only track and reveal if chat widget is empty
            },
            overrideSessionOpenOptions: openEvent => {
                if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked && !openEvent.sideBySide) {
                    return { ...openEvent, editorOptions: { ...openEvent.editorOptions, preserveFocus: false /* focus the chat widget when opening from stacked sessions viewer since this closes the stacked viewer */ } };
                }
                return openEvent;
            },
        }));
        this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));
        sessionsToolbar.context = sessionsControl;
        // Refresh sessions when window gets focus to compensate for missing events
        this._register(this.hostService.onDidChangeFocus(hasFocus => {
            if (hasFocus) {
                sessionsControl.refresh();
            }
        }));
        // Deal with orientation configuration
        this._register(Event.runAndSubscribe(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsOrientation)), e => {
            const newSessionsViewerOrientationConfiguration = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
            this.doUpdateConfiguredSessionsViewerOrientation(newSessionsViewerOrientationConfiguration, { updateConfiguration: false, layout: !!e });
        }));
        return sessionsControl;
    }
    getSessionsViewerOrientation() {
        return this.sessionsViewerOrientation;
    }
    updateConfiguredSessionsViewerOrientation(orientation) {
        return this.doUpdateConfiguredSessionsViewerOrientation(orientation, { updateConfiguration: true, layout: true });
    }
    doUpdateConfiguredSessionsViewerOrientation(orientation, options) {
        const oldSessionsViewerOrientationConfiguration = this.sessionsViewerOrientationConfiguration;
        let validatedOrientation;
        if (orientation === 'stacked' || orientation === 'sideBySide') {
            validatedOrientation = orientation;
        }
        else {
            validatedOrientation = 'sideBySide'; // default
        }
        this.sessionsViewerOrientationConfiguration = validatedOrientation;
        if (oldSessionsViewerOrientationConfiguration === this.sessionsViewerOrientationConfiguration) {
            return; // no change from our existing config
        }
        if (options.updateConfiguration) {
            this.configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, validatedOrientation);
        }
        if (options.layout) {
            this.relayout();
        }
    }
    updateSessionsControlVisibility() {
        if (!this.sessionsContainer || !this.viewPaneContainer) {
            return { changed: false, visible: false };
        }
        let newSessionsContainerVisible;
        if (!this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled)) {
            newSessionsContainerVisible = false; // disabled in settings
        }
        else {
            // Sessions control: stacked
            if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
                newSessionsContainerVisible =
                    !!this.chatEntitlementService.sentiment.completed && // chat is setup (otherwise make room for terms and welcome)
                        (!this._widget || (this._widget.isEmpty() && !!this._widget.viewModel && !this._widget.viewModel.model.title)) && // chat widget empty (but not when model is loading or has a title)
                        !this.welcomeController?.isShowingWelcome.get(); // welcome not showing
            }
            // Sessions control: sidebar
            else {
                newSessionsContainerVisible =
                    !this.welcomeController?.isShowingWelcome.get() && // welcome not showing
                        !!this.lastDimensions && this.lastDimensions.width >= ChatViewPane_1.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH; // has sessions or is showing all sessions
            }
        }
        this.viewPaneContainer.classList.toggle('has-sessions-control', newSessionsContainerVisible);
        const sessionsContainerVisible = this.sessionsContainer.style.display !== 'none';
        setVisibility(newSessionsContainerVisible, this.sessionsContainer);
        this.sessionsViewerVisible = newSessionsContainerVisible;
        this.sessionsViewerVisibilityContext.set(newSessionsContainerVisible);
        return {
            changed: sessionsContainerVisible !== newSessionsContainerVisible,
            visible: newSessionsContainerVisible
        };
    }
    getFocusedSessions() {
        return this.sessionsControl?.getFocus() ?? [];
    }
    //#endregion
    //#region Chat Control
    static { this.MIN_CHAT_WIDGET_HEIGHT = 116; }
    get widget() { return this._widget; }
    createChatControl(parent) {
        const chatControlsContainer = append(parent, $('.chat-controls-container'));
        const locationBasedColors = this.getLocationBasedColors();
        const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatControlsContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
        this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
        // Chat Title (unless we are hosted in the chat bar)
        if (this.viewDescriptorService.getViewLocationById(this.id) !== 3 /* ViewContainerLocation.ChatBar */) {
            this.createChatTitleControl(chatControlsContainer);
        }
        // Chat Widget
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
        this._widget = this._register(scopedInstantiationService.createInstance(ChatWidget, ChatAgentLocation.Chat, { viewId: this.id }, {
            autoScroll: mode => mode !== ChatModeKind.Ask,
            renderFollowups: true,
            supportsFileReferences: true,
            clear: () => this.clear(),
            rendererOptions: {
                renderTextEditsAsSummary: (uri) => {
                    return true;
                },
                referencesExpandedWhenEmptyResponse: false,
                progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
            },
            editorOverflowWidgetsDomNode,
            enableImplicitContext: true,
            enableWorkingSet: this.workbenchEnvironmentService.isSessionsWindow
                ? 'implicit'
                : 'explicit',
            supportsChangingModes: true,
            dndContainer: parent,
            inputEditorMinLines: this.workbenchEnvironmentService.isSessionsWindow ? 2 : undefined,
            isSessionsWindow: this.workbenchEnvironmentService.isSessionsWindow,
        }, {
            listForeground: SIDE_BAR_FOREGROUND,
            listBackground: locationBasedColors.background,
            overlayBackground: locationBasedColors.overlayBackground,
            inputEditorBackground: locationBasedColors.background,
            resultEditorBackground: editorBackground,
        }));
        this._widget.render(chatControlsContainer);
        const updateWidgetVisibility = (reader) => this._widget.setVisible(this.isBodyVisible() && !this.welcomeController?.isShowingWelcome.read(reader));
        this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
        this._register(autorun(reader => updateWidgetVisibility(reader)));
        return this._widget;
    }
    createChatTitleControl(parent) {
        this.titleControl = this._register(this.instantiationService.createInstance(ChatViewTitleControl, parent, {
            focusChat: () => this._widget.focusInput()
        }));
        this._register(this.titleControl.onDidChangeHeight(() => {
            this.relayout();
        }));
    }
    //#endregion
    registerControlsListeners(sessionsControl, chatWidget, welcomeController) {
        // Sessions control visibility is impacted by multiple things:
        // - chat widget being in empty state or showing a chat
        // - extensions provided welcome view showing or not
        // - configuration setting
        this._register(Event.any(chatWidget.onDidChangeEmptyState, Event.fromObservable(welcomeController.isShowingWelcome), Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)))(() => {
            if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
                sessionsControl.clearFocus(); // improve visual appearance when switching visibility by clearing focus
            }
            const { changed: visibilityChanged } = this.updateSessionsControlVisibility();
            if (visibilityChanged) {
                this.relayout();
            }
        }));
        // Track the active chat model and reveal it in the sessions control if side-by-side
        this._register(chatWidget.onDidChangeViewModel(() => {
            if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
                return; // only reveal in side-by-side mode
            }
            const sessionResource = chatWidget.viewModel?.sessionResource;
            if (sessionResource) {
                const revealed = sessionsControl.reveal(sessionResource);
                if (!revealed) {
                    // Session doesn't exist in the list yet (e.g., new untitled session),
                    // clear the selection so the list doesn't show stale selection
                    sessionsControl.clearFocus();
                }
            }
        }));
        // When sessions change (e.g., after first message in a new session)
        // reveal it unless the user is interacting with the list already
        this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
            if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
                return; // only reveal in side-by-side mode
            }
            if (sessionsControl.hasFocusOrSelection()) {
                return; // do not reveal if user is interacting with sessions control
            }
            const sessionResource = chatWidget.viewModel?.sessionResource;
            if (sessionResource) {
                sessionsControl.reveal(sessionResource);
            }
        }));
        // When the currently displayed session is archived, start a new session
        this._register(this.agentSessionsService.model.onDidChangeSessionArchivedState(e => {
            if (e.isArchived()) {
                const currentSessionResource = chatWidget.viewModel?.sessionResource;
                if (currentSessionResource && isEqual(currentSessionResource, e.resource)) {
                    this.clear();
                }
            }
        }));
        // When showing sessions stacked, adjust the height of the sessions list to make room for chat input
        this._register(autorun(reader => {
            chatWidget.inputPart.height.read(reader);
            if (this.sessionsViewerVisible && this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
                this.relayout();
            }
        }));
        // Show progress badge when the current session is in progress
        const progressBadgeDisposables = this._register(new MutableDisposable());
        const updateProgressBadge = () => {
            progressBadgeDisposables.value = new DisposableStore();
            if (!this.configurationService.getValue(ChatConfiguration.ChatViewProgressBadgeEnabled)) {
                this.activityBadge.clear();
                return;
            }
            const model = chatWidget.viewModel?.model;
            if (model) {
                progressBadgeDisposables.value.add(autorun(reader => {
                    if (model.requestInProgress.read(reader)) {
                        this.activityBadge.value = this.activityService.showViewActivity(this.id, {
                            badge: new ProgressBadge(() => localize('sessionInProgress', "Agent Session in Progress"))
                        });
                    }
                    else {
                        this.activityBadge.clear();
                    }
                }));
            }
            else {
                this.activityBadge.clear();
            }
        };
        this._register(chatWidget.onDidChangeViewModel(() => updateProgressBadge()));
        this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewProgressBadgeEnabled))(() => updateProgressBadge()));
        updateProgressBadge();
    }
    setupContextMenu(parent) {
        this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, e => {
            EventHelper.stop(e, true);
            this.contextMenuService.showContextMenu({
                menuId: MenuId.ChatWelcomeContext,
                contextKeyService: this.contextKeyService,
                getAnchor: () => new StandardMouseEvent(getWindow(parent), e)
            });
        }));
    }
    //#region Model Management
    applyModel() {
        this.restoringSession = this._applyModel();
        this.restoringSession.finally(() => this.restoringSession = undefined);
    }
    async _applyModel() {
        const sessionResource = this.getTransferredOrPersistedSessionInfo();
        const modelRef = sessionResource ? await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatViewPane#applyModel') : undefined;
        await this.showModel(CancellationToken.None, modelRef);
    }
    async showModel(token, modelRef, startNewSession = true) {
        const oldModelResource = this.modelRef.value?.object.sessionResource;
        // Keep the previous model reference alive so its InputModel state (permission level, etc.)
        // survives until the next session switch. Only the most recent previous session is kept.
        this._previousModelRef.value = this.modelRef.value;
        this.modelRef.value = undefined;
        let ref;
        if (startNewSession) {
            ref = modelRef ?? (this.chatService.transferredSessionResource
                ? await this.chatService.acquireOrLoadSession(this.chatService.transferredSessionResource, ChatAgentLocation.Chat, token, 'ChatViewPane#showModel')
                : this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'ChatViewPane#showModel' }));
            if (!ref) {
                throw new Error('Could not start chat session');
            }
        }
        if (token.isCancellationRequested) {
            ref?.dispose();
            return undefined;
        }
        this.modelRef.value = ref;
        const model = ref?.object;
        // If we're switching back to the previously cached model, clear the cache
        if (model && this._previousModelRef.value?.object.sessionResource.toString() === model.sessionResource.toString()) {
            this._previousModelRef.value = undefined;
        }
        if (model) {
            await this.updateWidgetLockState(getChatSessionType(model.sessionResource)); // Update widget lock state based on session type
            if (token.isCancellationRequested) {
                this.modelRef.value = undefined;
                return undefined;
            }
            // remember as model to restore in view state
            this.viewState.sessionResource = model.sessionResource;
        }
        this._widget.setModel(model);
        // Update title control
        this.titleControl?.update(model);
        // Update the toolbar context with new sessionId
        this.updateActions();
        // Mark the old model as read when closing unless explicitly marked unread
        if (oldModelResource) {
            const oldSession = this.agentSessionsService.model.getSession(oldModelResource);
            if (oldSession && !oldSession.isMarkedUnread()) {
                oldSession.setRead(true);
            }
        }
        return model;
    }
    async updateWidgetLockState(sessionType) {
        if (sessionType === localChatSessionType) {
            this._widget.unlockFromCodingAgent();
            return;
        }
        let canResolve = false;
        try {
            canResolve = await this.chatSessionsService.canResolveChatSession(sessionType);
        }
        catch (error) {
            this.logService.warn(`Failed to resolve chat session type '${sessionType}' for locking`, error);
        }
        if (!canResolve) {
            this._widget.unlockFromCodingAgent();
            return;
        }
        const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
        if (contribution) {
            this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType);
        }
        else {
            this._widget.unlockFromCodingAgent();
        }
    }
    async clear() {
        // Cancel any in-flight loadSession call to prevent it from
        // overwriting the fresh session we are about to create.
        this.loadSessionCts.value?.cancel();
        // Grab the widget's latest view state because it will be loaded back into the widget
        this.updateViewState();
        await this.showModel(CancellationToken.None);
        // Update the toolbar context with new sessionId
        this.updateActions();
    }
    async loadSession(sessionResource) {
        // Cancel any in-flight loadSession call so the last one always wins
        this.loadSessionCts.value?.cancel();
        const cts = this.loadSessionCts.value = new CancellationTokenSource();
        const token = cts.token;
        // Wait for any in-progress session restore (e.g. from onDidChangeAgents)
        // to finish first, so our showModel call is guaranteed to be the last one.
        if (this.restoringSession) {
            await this.restoringSession;
        }
        if (token.isCancellationRequested) {
            return undefined;
        }
        return this.progressService.withProgress({ location: ChatViewId, delay: 200 }, async () => {
            let queue = Promise.resolve();
            // A delay here to avoid blinking because only Cloud sessions are slow, most others are fast
            const clearWidget = disposableTimeout(() => {
                // Only clear the current model if this loadSession call is still the active one
                // and has not been cancelled. This preserves the "last call wins" behavior.
                if (token.isCancellationRequested || this.loadSessionCts.value !== cts) {
                    return;
                }
                // clear current model without starting a new one
                queue = this.showModel(token, undefined, false).then(() => { });
            }, 100);
            const clearWidgetCancellationListener = token.onCancellationRequested(() => clearWidget.dispose());
            try {
                const newModelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, 'ChatViewPane#loadSession');
                clearWidget.dispose();
                await queue;
                if (token.isCancellationRequested) {
                    newModelRef?.dispose();
                    return undefined;
                }
                return this.showModel(token, newModelRef);
            }
            catch (err) {
                clearWidget.dispose();
                await queue;
                if (token.isCancellationRequested) {
                    return undefined;
                }
                // Recover by starting a fresh empty session so the widget
                // is not left in a broken state without title or back button.
                this.logService.error(`Failed to load chat session '${sessionResource.toString()}'`, err);
                this.notificationService.error(localize('chat.loadSessionFailed', "Failed to open chat session: {0}", toErrorMessage(err)));
                return this.showModel(token, undefined);
            }
            finally {
                clearWidgetCancellationListener.dispose();
            }
        });
    }
    //#endregion
    focus() {
        super.focus();
        this.focusInput();
    }
    focusInput() {
        this._widget.focusInput();
    }
    focusSessions() {
        if (this.sessionsContainer?.style.display === 'none') {
            return false; // not visible
        }
        this.sessionsControl?.focus();
        return true;
    }
    relayout() {
        if (this.lastDimensions) {
            this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
        }
    }
    layoutBody(height, width) {
        if (this.layoutingBody) {
            return; // prevent re-entrancy
        }
        this.layoutingBody = true;
        try {
            this.doLayoutBody(height, width);
        }
        finally {
            this.layoutingBody = false;
        }
    }
    doLayoutBody(height, width) {
        super.layoutBody(height, width);
        this.lastDimensions = { height, width };
        let remainingHeight = height;
        const remainingWidth = width;
        // Title Control
        const titleHeight = this.titleControl?.getHeight() ?? 0;
        remainingHeight -= titleHeight;
        // Sessions Control
        const { heightReduction, widthReduction } = this.layoutSessionsControl(remainingHeight, remainingWidth);
        // In stacked mode the sessions viewer sits above the chat widget, so the
        // widget's layout height is reduced by `heightReduction`. However, the input
        // part's max-height needs to be based on the full `remainingHeight` (before
        // the sessions viewer deduction) so the input can grow freely. As the input
        // grows, an autorun triggers relayout which shrinks the sessions viewer,
        // giving the widget more space and converging to the right sizes.
        this._widget.setInputPartMaxHeightOverride(this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? remainingHeight : undefined);
        // Chat Widget
        this._widget.layout(remainingHeight - heightReduction, remainingWidth - widthReduction);
        // Remember last dimensions per orientation
        this.lastDimensionsPerOrientation.set(this.sessionsViewerOrientation, { height, width });
    }
    layoutSessionsControl(height, width) {
        let heightReduction = 0;
        let widthReduction = 0;
        if (!this.sessionsContainer || !this.sessionsControlContainer || !this.sessionsControl || !this.viewPaneContainer || !this.sessionsTitleContainer || !this.sessionsTitle) {
            return { heightReduction, widthReduction };
        }
        const oldSessionsViewerOrientation = this.sessionsViewerOrientation;
        let newSessionsViewerOrientation;
        switch (this.sessionsViewerOrientationConfiguration) {
            // Stacked
            case 'stacked':
                newSessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
                break;
            // Update orientation based on available width
            default:
                newSessionsViewerOrientation = width >= ChatViewPane_1.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH ? AgentSessionsViewerOrientation.SideBySide : AgentSessionsViewerOrientation.Stacked;
        }
        this.sessionsViewerOrientation = newSessionsViewerOrientation;
        if (newSessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
            this.viewPaneContainer.classList.toggle('sessions-control-orientation-sidebyside', true);
            this.viewPaneContainer.classList.toggle('sessions-control-orientation-stacked', false);
            this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.SideBySide);
        }
        else {
            this.viewPaneContainer.classList.toggle('sessions-control-orientation-sidebyside', false);
            this.viewPaneContainer.classList.toggle('sessions-control-orientation-stacked', true);
            this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.Stacked);
        }
        if (oldSessionsViewerOrientation !== this.sessionsViewerOrientation) {
            const updatePromise = this.sessionsControl.update(); // Changing orientation has an impact to grouping, so we need to update
            // Switching to side-by-side, reveal the current session after elements have loaded
            if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
                updatePromise.then(() => {
                    const sessionResource = this._widget?.viewModel?.sessionResource;
                    if (sessionResource) {
                        this.sessionsControl?.reveal(sessionResource);
                    }
                });
            }
        }
        // Ensure visibility is in sync before we layout
        const { visible: sessionsContainerVisible } = this.updateSessionsControlVisibility();
        // Handle Sash (only visible in side-by-side)
        if (!sessionsContainerVisible || this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
            this.sessionsViewerSashDisposables.clear();
            this.sessionsViewerSash = undefined;
        }
        else if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
            if (!this.sessionsViewerSashDisposables.value && this.viewPaneContainer) {
                this.createSessionsViewerSash(this.viewPaneContainer, height, width);
            }
        }
        if (!sessionsContainerVisible) {
            return { heightReduction: 0, widthReduction: 0 };
        }
        let availableSessionsHeight = height - this.sessionsTitleContainer.offsetHeight;
        if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
            availableSessionsHeight -= Math.max(ChatViewPane_1.MIN_CHAT_WIDGET_HEIGHT, this._widget?.input?.height.get() ?? 0);
        }
        else {
            availableSessionsHeight -= this.sessionsNewButtonContainer?.offsetHeight ?? 0;
        }
        // Show as sidebar
        if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
            const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(width);
            this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
            this.sessionsControlContainer.style.width = `${sessionsViewerSidebarWidth}px`;
            this.sessionsControl.layout(availableSessionsHeight, sessionsViewerSidebarWidth);
            this.sessionsViewerSash?.layout();
            heightReduction = 0; // side by side to chat widget
            widthReduction = this.sessionsContainer.offsetWidth;
        }
        // Show stacked
        else {
            this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
            this.sessionsControlContainer.style.width = ``;
            this.sessionsControl.layout(availableSessionsHeight, width);
            heightReduction = this.sessionsContainer.offsetHeight;
            widthReduction = 0; // stacked on top of the chat widget
        }
        return { heightReduction, widthReduction };
    }
    computeEffectiveSideBySideSessionsSidebarWidth(width, sessionsViewerSidebarWidth = this.sessionsViewerSidebarWidth) {
        return Math.max(ChatViewPane_1.SESSIONS_SIDEBAR_MIN_WIDTH, // never smaller than min width for side by side sessions
        Math.min(sessionsViewerSidebarWidth, width - ChatViewPane_1.CHAT_WIDGET_DEFAULT_WIDTH // never so wide that chat widget is smaller than default width
        ));
    }
    getLastDimensions(orientation) {
        return this.lastDimensionsPerOrientation.get(orientation);
    }
    createSessionsViewerSash(container, height, width) {
        const disposables = this.sessionsViewerSashDisposables.value = new DisposableStore();
        const sash = this.sessionsViewerSash = disposables.add(new Sash(container, {
            getVerticalSashLeft: () => {
                const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions?.width ?? width);
                const { position } = this.getViewPositionAndLocation();
                if (position === 1 /* Position.RIGHT */) {
                    return (this.lastDimensions?.width ?? width) - sessionsViewerSidebarWidth;
                }
                return sessionsViewerSidebarWidth;
            }
        }, { orientation: 0 /* Orientation.VERTICAL */ }));
        let sashStartWidth;
        disposables.add(sash.onDidStart(() => sashStartWidth = this.sessionsViewerSidebarWidth));
        disposables.add(sash.onDidEnd(() => sashStartWidth = undefined));
        disposables.add(sash.onDidChange(e => {
            if (sashStartWidth === undefined || !this.lastDimensions) {
                return;
            }
            const { position } = this.getViewPositionAndLocation();
            const delta = e.currentX - e.startX;
            const newWidth = position === 1 /* Position.RIGHT */ ? sashStartWidth - delta : sashStartWidth + delta;
            if (newWidth < ChatViewPane_1.SESSIONS_SIDEBAR_SNAP_THRESHOLD) {
                this.updateConfiguredSessionsViewerOrientation('stacked'); // snap to stacked when sized small enough
                return;
            }
            this.sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions.width, newWidth);
            this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;
            this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
        }));
        disposables.add(sash.onDidReset(() => {
            this.sessionsViewerSidebarWidth = ChatViewPane_1.SESSIONS_SIDEBAR_DEFAULT_WIDTH;
            this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;
            this.relayout();
        }));
    }
    //#endregion
    saveState() {
        // Don't do saveState when no widget, or no viewModel in which case
        // the state has not yet been restored - in that case the default
        // state would overwrite the real state
        if (this._widget?.viewModel) {
            this._widget.saveState();
            this.updateViewState();
            this.memento.saveMemento();
        }
        super.saveState();
    }
    updateViewState(viewState) {
        const newViewState = viewState ?? this._widget.getViewState();
        if (newViewState) {
            for (const [key, value] of Object.entries(newViewState)) {
                this.viewState[key] = value; // Assign all props to the memento so they get saved
            }
        }
    }
    shouldShowWelcome() {
        const noPersistedSessions = !this.chatService.hasSessions();
        const hasCoreAgent = this.chatAgentService.getAgents().some(agent => agent.isCore && agent.locations.includes(ChatAgentLocation.Chat));
        const hasDefaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat) !== undefined; // only false when Hide AI Features has run and unregistered the setup agents
        const shouldShow = !hasCoreAgent && (!hasDefaultAgent || !this._widget?.viewModel && noPersistedSessions);
        this.logService.trace(`ChatViewPane#shouldShowWelcome() = ${shouldShow}: hasCoreAgent=${hasCoreAgent} hasDefaultAgent=${hasDefaultAgent} || noViewModel=${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions}`);
        return !!shouldShow;
    }
    getMatchingWelcomeView() {
        return this.welcomeController?.getMatchingWelcomeView();
    }
    getActionsContext() {
        return this._widget?.viewModel ? {
            sessionResource: this._widget.viewModel.sessionResource,
            $mid: 19 /* MarshalledId.ChatViewContext */
        } : undefined;
    }
};
ChatViewPane = ChatViewPane_1 = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, IStorageService),
    __param(11, IChatService),
    __param(12, IChatAgentService),
    __param(13, ILogService),
    __param(14, INotificationService),
    __param(15, IWorkbenchLayoutService),
    __param(16, IChatSessionsService),
    __param(17, ITelemetryService),
    __param(18, ILifecycleService),
    __param(19, IProgressService),
    __param(20, IAgentSessionsService),
    __param(21, IChatEntitlementService),
    __param(22, ICommandService),
    __param(23, IActivityService),
    __param(24, IWorkbenchEnvironmentService),
    __param(25, IHostService)
], ChatViewPane);
export { ChatViewPane };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZpZXdQYW5lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL3ZpZXdQYW5lL2NoYXRWaWV3UGFuZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTywwQkFBMEIsQ0FBQztBQUNsQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMzSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDNUUsT0FBTyxFQUFlLElBQUksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTlHLE9BQU8sRUFBRSxPQUFPLEVBQVcsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RB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