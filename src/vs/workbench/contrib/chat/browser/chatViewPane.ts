/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewPane.css';
import { $, addDisposableListener, append, EventHelper, EventType, getWindow, setVisibility } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { ChatViewTitleControl } from './chatViewTitleControl.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { ILifecycleService, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatViewTitleActionContext } from '../common/chatActions.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatModel, IChatModelInputState } from '../common/chatModel.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IChatModelReference, IChatService } from '../common/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../common/chatSessionsService.js';
import { LocalChatSessionUri, getChatSessionType } from '../common/chatUri.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { AgentSessionsControl } from './agentSessions/agentSessionsControl.js';
import { AgentSessionsListDelegate } from './agentSessions/agentSessionsViewer.js';
import { ChatWidget } from './chatWidget.js';
import { ChatViewWelcomeController, IViewWelcomeDelegate } from './viewsWelcome/chatViewWelcomeController.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from './agentSessions/agentSessions.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ChatViewId } from './chat.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { AgentSessionsFilter } from './agentSessions/agentSessionsFilter.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';

interface IChatViewPaneState extends Partial<IChatModelInputState> {
	sessionId?: string;
}

type ChatViewPaneOpenedClassification = {
	owner: 'sbatten';
	comment: 'Event fired when the chat view pane is opened';
};

export class ChatViewPane extends ViewPane implements IViewWelcomeDelegate {

	private readonly memento: Memento<IChatViewPaneState>;
	private readonly viewState: IChatViewPaneState;

	private viewPaneContainer: HTMLElement | undefined;
	private readonly chatViewLocationContext: IContextKey<ViewContainerLocation>;
	private lastDimensions: { height: number; width: number } | undefined;

	private welcomeController: ChatViewWelcomeController | undefined;

	private restoringSession: Promise<void> | undefined;
	private readonly modelRef = this._register(new MutableDisposable<IChatModelReference>());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IProgressService private readonly progressService: IProgressService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// View state for the ViewPane is currently global per-provider basically,
		// but some other strictly per-model state will require a separate memento.
		this.memento = new Memento(`interactive-session-view-${CHAT_PROVIDER_ID}`, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		if (
			lifecycleService.startupKind !== StartupKind.ReloadedWindow &&
			this.configurationService.getValue<boolean>(ChatConfiguration.RestoreLastPanelSession) === false
		) {
			this.viewState.sessionId = undefined; // clear persisted session on fresh start
		}

		// Contextkeys
		this.chatViewLocationContext = ChatContextKeys.panelLocation.bindTo(contextKeyService);
		this.sessionsViewerLimitedContext = ChatContextKeys.agentSessionsViewerLimited.bindTo(contextKeyService);
		this.sessionsViewerOrientationContext = ChatContextKeys.agentSessionsViewerOrientation.bindTo(contextKeyService);
		this.sessionsViewerPositionContext = ChatContextKeys.agentSessionsViewerPosition.bindTo(contextKeyService);

		this.updateContextKeys(false);

		this.registerListeners();
	}

	private updateContextKeys(fromEvent: boolean): void {
		const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
		const sideBarPosition = this.layoutService.getSideBarPosition();

		let sideSessionsOnRightPosition: boolean;
		if (viewLocation === ViewContainerLocation.AuxiliaryBar) {
			sideSessionsOnRightPosition = sideBarPosition === Position.LEFT;
		} else if (viewLocation === ViewContainerLocation.Sidebar) {
			sideSessionsOnRightPosition = sideBarPosition === Position.RIGHT;
		} else {
			sideSessionsOnRightPosition = true;
		}

		this.sessionsViewerPosition = sideSessionsOnRightPosition ? AgentSessionsViewerPosition.Right : AgentSessionsViewerPosition.Left;

		this.sessionsViewerLimitedContext.set(this.sessionsViewerLimited);
		this.chatViewLocationContext.set(viewLocation ?? ViewContainerLocation.AuxiliaryBar);
		this.sessionsViewerOrientationContext.set(this.sessionsViewerOrientation);
		this.sessionsViewerPositionContext.set(this.sessionsViewerPosition);

		if (fromEvent && this.lastDimensions) {
			this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
		}
	}

	private updateViewPaneClasses(fromEvent: boolean): void {
		const welcomeEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewWelcomeEnabled) !== false;
		this.viewPaneContainer?.classList.toggle('chat-view-welcome-enabled', welcomeEnabled);

		if (fromEvent && this.lastDimensions) {
			this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
		}
	}

	private registerListeners(): void {

		// Agent changes
		this._register(this.chatAgentService.onDidChangeAgents(() => this.onDidChangeAgents()));

		// Layout changes
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sideBar.location'))(() => this.updateContextKeys(true)));
		this._register(Event.filter(this.viewDescriptorService.onDidChangeContainerLocation, e => e.viewContainer === this.viewDescriptorService.getViewContainerByViewId(this.id))(() => this.updateContextKeys(true)));

		// Settings changes
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewWelcomeEnabled))(() => this.updateViewPaneClasses(true)));
	}

	private onDidChangeAgents(): void {
		if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
			if (!this._widget?.viewModel && !this.restoringSession) {
				const info = this.getTransferredOrPersistedSessionInfo();
				this.restoringSession =
					(info.sessionId ? this.chatService.getOrRestoreSession(LocalChatSessionUri.forSession(info.sessionId)) : Promise.resolve(undefined)).then(async modelRef => {
						if (!this._widget) {
							return; // renderBody has not been called yet
						}

						// The widget may be hidden at this point, because welcome views were allowed. Use setVisible to
						// avoid doing a render while the widget is hidden. This is changing the condition in `shouldShowWelcome`
						// so it should fire onDidChangeViewWelcomeState.
						const wasVisible = this._widget.visible;
						try {
							this._widget.setVisible(false);
							if (info.inputState && modelRef) {
								modelRef.object.inputModel.setState(info.inputState);
							}

							await this.showModel(modelRef);
						} finally {
							this._widget.setVisible(wasVisible);
						}
					});

				this.restoringSession.finally(() => this.restoringSession = undefined);
			}
		}

		this._onDidChangeViewWelcomeState.fire();
	}

	private getTransferredOrPersistedSessionInfo(): { sessionId?: string; inputState?: IChatModelInputState; mode?: ChatModeKind } {
		if (this.chatService.transferredSessionData?.location === ChatAgentLocation.Chat) {
			const sessionId = this.chatService.transferredSessionData.sessionId;
			return {
				sessionId,
				inputState: this.chatService.transferredSessionData.inputState,
			};
		}

		return { sessionId: this.viewState.sessionId };
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.telemetryService.publicLog2<{}, ChatViewPaneOpenedClassification>('chatViewPaneOpened');

		this.viewPaneContainer = parent;
		this.viewPaneContainer.classList.add('chat-viewpane');
		this.updateViewPaneClasses(false);

		this.createControls(parent);

		this.setupContextMenu(parent);

		this.applyModel();
	}

	private createControls(parent: HTMLElement): void {

		// Sessions Control
		const sessionsControl = this.createSessionsControl(parent);

		// Welcome Control
		const welcomeController = this.welcomeController = this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, ChatAgentLocation.Chat));

		// Chat Control
		const chatWidget = this.createChatControl(parent);

		// Controls Listeners
		this.registerControlsListeners(sessionsControl, chatWidget, welcomeController);

		// Update sessions control visibility when all controls are created
		this.updateSessionsControlVisibility();
	}

	//#region Sessions Control

	private static readonly SESSIONS_LIMIT = 3;
	private static readonly SESSIONS_SIDEBAR_WIDTH = 300;
	private static readonly SESSIONS_SIDEBAR_VIEW_MIN_WIDTH = 300 /* default chat width */ + this.SESSIONS_SIDEBAR_WIDTH;

	private sessionsContainer: HTMLElement | undefined;
	private sessionsTitleContainer: HTMLElement | undefined;
	private sessionsTitle: HTMLElement | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	private sessionsControl: AgentSessionsControl | undefined;
	private sessionsLinkContainer: HTMLElement | undefined;
	private sessionsLink: Link | undefined;
	private sessionsCount = 0;
	private sessionsViewerLimited = true;
	private sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
	private sessionsViewerOrientationContext: IContextKey<AgentSessionsViewerOrientation>;
	private sessionsViewerLimitedContext: IContextKey<boolean>;
	private sessionsViewerPosition = AgentSessionsViewerPosition.Right;
	private sessionsViewerPositionContext: IContextKey<AgentSessionsViewerPosition>;

	private createSessionsControl(parent: HTMLElement): AgentSessionsControl {
		const that = this;
		const sessionsContainer = this.sessionsContainer = parent.appendChild($('.agent-sessions-container'));

		// Sessions Title
		const sessionsTitleContainer = this.sessionsTitleContainer = append(sessionsContainer, $('.agent-sessions-title-container'));
		const sessionsTitle = this.sessionsTitle = append(sessionsTitleContainer, $('span.agent-sessions-title'));
		sessionsTitle.textContent = this.sessionsViewerLimited ? localize('recentSessions', "Recent Sessions") : localize('allSessions', "All Sessions");

		// Sessions Toolbar
		const sessionsToolbarContainer = append(sessionsTitleContainer, $('.agent-sessions-toolbar'));
		const sessionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionsToolbarContainer, MenuId.AgentSessionsToolbar, {
			menuOptions: { shouldForwardArgs: true }
		}));

		// Sessions Filter
		const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
			filterMenuId: MenuId.AgentSessionsViewerFilterSubMenu,
			limitResults: () => {
				return that.sessionsViewerLimited ? ChatViewPane.SESSIONS_LIMIT : undefined;
			},
			overrideExclude(session) {
				if (that.sessionsViewerLimited) {
					if (session.isArchived()) {
						return true; // exclude archived sessions when limited
					}

					return false;
				}

				return undefined; // leave up to the filter settings
			},
			notifyResults(count: number) {
				that.notifySessionsControlCountChanged(count);
			}
		}));
		this._register(Event.runAndSubscribe(sessionsFilter.onDidChange, () => {
			sessionsToolbarContainer.classList.toggle('filtered', !sessionsFilter.isDefault());
		}));

		// Sessions Control
		this.sessionsControlContainer = append(sessionsContainer, $('.agent-sessions-control-container'));
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
			allowOpenSessionsInPanel: true,
			filter: sessionsFilter
		}));
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));

		sessionsToolbar.context = sessionsControl;

		// Link to Sessions View
		this.sessionsLinkContainer = append(sessionsContainer, $('.agent-sessions-link-container'));
		this.sessionsLink = this._register(this.instantiationService.createInstance(Link, this.sessionsLinkContainer, {
			label: this.sessionsViewerLimited ? localize('showAllSessions', "Show All Sessions") : localize('showRecentSessions', "Show Recent Sessions"),
			href: '',
		}, {
			opener: () => {
				this.sessionsViewerLimited = !this.sessionsViewerLimited;

				this.notifySessionsControlLimitedChanged(true);

				sessionsControl.focus();
			}
		}));

		return sessionsControl;
	}

	private notifySessionsControlLimitedChanged(triggerLayout: boolean): void {
		this.sessionsViewerLimitedContext.set(this.sessionsViewerLimited);

		if (this.sessionsTitle) {
			this.sessionsTitle.textContent = this.sessionsViewerLimited ? localize('recentSessions', "Recent Sessions") : localize('allSessions', "All Sessions");
		}

		if (this.sessionsLink) {
			this.sessionsLink.link = {
				label: this.sessionsViewerLimited ? localize('showAllSessions', "Show All Sessions") : localize('showRecentSessions', "Show Recent Sessions"),
				href: ''
			};
		}

		this.sessionsControl?.update();

		if (triggerLayout && this.lastDimensions) {
			this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
		}
	}

	private notifySessionsControlCountChanged(newSessionsCount?: number): void {
		const countChanged = typeof newSessionsCount === 'number' && newSessionsCount !== this.sessionsCount;
		this.sessionsCount = newSessionsCount ?? this.sessionsCount;

		const { changed: visibilityChanged, visible } = this.updateSessionsControlVisibility();

		if (visibilityChanged || (countChanged && visible)) {
			if (this.lastDimensions) {
				this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
			}
		}
	}

	private updateSessionsControlVisibility(): { changed: boolean; visible: boolean } {
		if (!this.sessionsContainer || !this.viewPaneContainer) {
			return { changed: false, visible: false };
		}

		let newSessionsContainerVisible: boolean;
		if (!this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled)) {
			newSessionsContainerVisible = false; // disabled in settings
		} else {

			// Sessions control: stacked
			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				newSessionsContainerVisible =
					(!this._widget || this._widget?.isEmpty()) &&				// chat widget empty
					!this.welcomeController?.isShowingWelcome.get() &&			// welcome not showing
					(this.sessionsCount > 0 || !this.sessionsViewerLimited);	// has sessions or is showing all sessions
			}

			// Sessions control: sidebar
			else {
				newSessionsContainerVisible = !!this.lastDimensions && this.lastDimensions.width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH; // enough space
			}
		}

		this.viewPaneContainer.classList.toggle('has-sessions-control', newSessionsContainerVisible);

		const sessionsContainerVisible = this.sessionsContainer.style.display !== 'none';
		setVisibility(newSessionsContainerVisible, this.sessionsContainer);
		this.sessionsControl?.setVisible(newSessionsContainerVisible);

		return {
			changed: sessionsContainerVisible !== newSessionsContainerVisible,
			visible: newSessionsContainerVisible
		};
	}

	//#endregion

	//#region Chat Control

	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private titleControl: ChatViewTitleControl | undefined;

	private createChatControl(parent: HTMLElement): ChatWidget {
		const chatControlsContainer = append(parent, $('.chat-controls-container'));

		const locationBasedColors = this.getLocationBasedColors();

		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatControlsContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		// Chat Title
		this.createChatTitleControl(chatControlsContainer);

		// Chat Widget
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ viewId: this.id },
			{
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
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: locationBasedColors.background,
				overlayBackground: locationBasedColors.overlayBackground,
				inputEditorBackground: locationBasedColors.background,
				resultEditorBackground: editorBackground,
			}));
		this._widget.render(chatControlsContainer);

		const updateWidgetVisibility = (reader?: IReader) => this._widget.setVisible(this.isBodyVisible() && !this.welcomeController?.isShowingWelcome.read(reader));
		this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
		this._register(autorun(reader => updateWidgetVisibility(reader)));

		return this._widget;
	}

	private createChatTitleControl(parent: HTMLElement): void {
		this.titleControl = this._register(this.instantiationService.createInstance(ChatViewTitleControl,
			parent,
			{
				updateTitle: title => this.updateTitle(title),
				focusChat: () => this._widget.focusInput()
			}
		));

		this._register(this.titleControl.onDidChangeHeight(() => {
			if (this.lastDimensions) {
				this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
			}
		}));
	}

	//#endregion

	private registerControlsListeners(sessionsControl: AgentSessionsControl, chatWidget: ChatWidget, welcomeController: ChatViewWelcomeController): void {

		// Sessions control visibility is impacted by multiple things:
		// - chat widget being in empty state or showing a chat
		// - extensions provided welcome view showing or not
		// - configuration setting
		this._register(Event.any(
			chatWidget.onDidChangeEmptyState,
			Event.fromObservable(welcomeController.isShowingWelcome),
			Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled))
		)(() => {
			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				sessionsControl.clearFocus(); // improve visual appearance when switching visibility by clearing focus
			}
			this.notifySessionsControlCountChanged();
		}));

		// Layout when orientation configuration changes
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsOrientation))(() => {
			if (this.lastDimensions) {
				this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
			}
		}));
	}

	private setupContextMenu(parent: HTMLElement): void {
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

	private async applyModel(): Promise<void> {
		const info = this.getTransferredOrPersistedSessionInfo();
		const modelRef = info.sessionId ? await this.chatService.getOrRestoreSession(LocalChatSessionUri.forSession(info.sessionId)) : undefined;
		if (modelRef && info.inputState) {
			modelRef.object.inputModel.setState(info.inputState);
		}

		await this.showModel(modelRef);
	}

	private async showModel(modelRef?: IChatModelReference | undefined, startNewSession = true): Promise<IChatModel | undefined> {
		const oldModelResource = this.modelRef.value?.object.sessionResource;
		this.modelRef.value = undefined;

		let ref: IChatModelReference | undefined;
		if (startNewSession) {
			ref = modelRef ?? (this.chatService.transferredSessionData?.sessionId && this.chatService.transferredSessionData?.location === ChatAgentLocation.Chat
				? await this.chatService.getOrRestoreSession(LocalChatSessionUri.forSession(this.chatService.transferredSessionData.sessionId))
				: this.chatService.startSession(ChatAgentLocation.Chat));
			if (!ref) {
				throw new Error('Could not start chat session');
			}
		}

		this.modelRef.value = ref;
		const model = ref?.object;

		if (model) {
			await this.updateWidgetLockState(model.sessionResource); // Update widget lock state based on session type

			this.viewState.sessionId = model.sessionId; // remember as model to restore in view state
		}

		this._widget.setModel(model);

		// Update title control
		this.titleControl?.update(model);

		// Update the toolbar context with new sessionId
		this.updateActions();

		// Mark the old model as read when closing
		if (oldModelResource) {
			this.agentSessionsService.model.getSession(oldModelResource)?.setRead(true);
		}

		return model;
	}

	private async updateWidgetLockState(sessionResource: URI): Promise<void> {
		const sessionType = getChatSessionType(sessionResource);
		if (sessionType === localChatSessionType) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		let canResolve = false;
		try {
			canResolve = await this.chatSessionsService.canResolveChatSession(sessionResource);
		} catch (error) {
			this.logService.warn(`Failed to resolve chat session '${sessionResource.toString()}' for locking`, error);
		}

		if (!canResolve) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	private async clear(): Promise<void> {

		// Grab the widget's latest view state because it will be loaded back into the widget
		this.updateViewState();
		await this.showModel(undefined);

		// Update the toolbar context with new sessionId
		this.updateActions();
	}

	async loadSession(sessionResource: URI): Promise<IChatModel | undefined> {
		return this.progressService.withProgress({ location: ChatViewId, delay: 200 }, async () => {
			let queue: Promise<void> = Promise.resolve();

			// A delay here to avoid blinking because only Cloud sessions are slow, most others are fast
			const clearWidget = disposableTimeout(() => {
				// clear current model without starting a new one
				queue = this.showModel(undefined, false).then(() => { });
			}, 100);

			const sessionType = getChatSessionType(sessionResource);
			if (sessionType !== localChatSessionType) {
				await this.chatSessionsService.canResolveChatSession(sessionResource);
			}

			const newModelRef = await this.chatService.loadSessionForResource(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
			clearWidget.dispose();
			await queue;
			return this.showModel(newModelRef);
		});
	}

	//#endregion

	override focus(): void {
		super.focus();

		this.focusInput();
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	focusSessions(): boolean {
		if (!this.sessionsControl?.isVisible()) {
			return false;
		}

		this.sessionsControl.focus();

		return true;
	}

	//#region Layout

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.lastDimensions = { height, width };

		let remainingHeight = height;
		let remainingWidth = width;

		// Sessions Control
		const { heightReduction, widthReduction } = this.layoutSessionsControl(remainingHeight, remainingWidth);
		remainingHeight -= heightReduction;
		remainingWidth -= widthReduction;

		// Title Control
		remainingHeight -= this.titleControl?.getHeight() ?? 0;

		// Chat Widget
		this._widget.layout(remainingHeight, remainingWidth);
	}

	private layoutSessionsControl(height: number, width: number): { heightReduction: number; widthReduction: number } {
		let heightReduction = 0;
		let widthReduction = 0;

		if (!this.sessionsContainer || !this.sessionsControlContainer || !this.sessionsControl || !this.viewPaneContainer || !this.sessionsTitleContainer || !this.sessionsLinkContainer || !this.sessionsTitle || !this.sessionsLink) {
			return { heightReduction, widthReduction };
		}

		const configuredSessionsViewerOrientation = this.configurationService.getValue<'auto' | 'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
		const oldSessionsViewerOrientation = this.sessionsViewerOrientation;
		let newSessionsViewerOrientation: AgentSessionsViewerOrientation;
		switch (configuredSessionsViewerOrientation) {
			// Stacked
			case 'stacked':
				newSessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
				break;
			// Side by side
			case 'sideBySide':
				newSessionsViewerOrientation = AgentSessionsViewerOrientation.SideBySide;
				break;
			// Update orientation based on available width
			default:
				newSessionsViewerOrientation = width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH ? AgentSessionsViewerOrientation.SideBySide : AgentSessionsViewerOrientation.Stacked;
		}

		this.sessionsViewerOrientation = newSessionsViewerOrientation;

		if (newSessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
			this.viewPaneContainer.classList.add('sessions-control-orientation-sidebyside');
			this.viewPaneContainer.classList.toggle('sessions-control-position-left', this.sessionsViewerPosition === AgentSessionsViewerPosition.Left);
			this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.SideBySide);
		} else {
			this.viewPaneContainer.classList.remove('sessions-control-orientation-sidebyside');
			this.viewPaneContainer.classList.remove('sessions-control-position-left');
			this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.Stacked);
		}

		// Update limited state based on orientation change
		if (oldSessionsViewerOrientation !== this.sessionsViewerOrientation) {
			const oldSessionsViewerLimited = this.sessionsViewerLimited;
			this.sessionsViewerLimited = this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked;
			if (oldSessionsViewerLimited !== this.sessionsViewerLimited) {
				this.notifySessionsControlLimitedChanged(false /* already in layout */);
			}
		}

		// Ensure visibility is in sync before we layout
		this.updateSessionsControlVisibility();

		const availableSessionsHeight = height - this.sessionsTitleContainer.offsetHeight - this.sessionsLinkContainer.offsetHeight;

		// Show as sidebar
		if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
			this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
			this.sessionsControlContainer.style.width = `${ChatViewPane.SESSIONS_SIDEBAR_WIDTH}px`;
			this.sessionsControl.layout(availableSessionsHeight, ChatViewPane.SESSIONS_SIDEBAR_WIDTH);

			heightReduction = 0; // side by side to chat widget
			widthReduction = this.sessionsContainer.offsetWidth;
		}

		// Show stacked (grows with the number of items displayed)
		else {
			let sessionsHeight: number;
			if (this.sessionsViewerLimited) {
				sessionsHeight = this.sessionsCount * AgentSessionsListDelegate.ITEM_HEIGHT;
			} else {
				sessionsHeight = (ChatViewPane.SESSIONS_LIMIT + 2 /* expand a bit to indicate more items */) * AgentSessionsListDelegate.ITEM_HEIGHT;
			}

			sessionsHeight = Math.min(availableSessionsHeight, sessionsHeight);

			this.sessionsControlContainer.style.height = `${sessionsHeight}px`;
			this.sessionsControlContainer.style.width = ``;
			this.sessionsControl.layout(sessionsHeight, width);

			heightReduction = this.sessionsContainer.offsetHeight;
			widthReduction = 0; // stacked on top of the chat widget
		}

		return { heightReduction, widthReduction };
	}

	//#endregion

	override saveState(): void {

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

	private updateViewState(viewState?: IChatModelInputState): void {
		const newViewState = viewState ?? this._widget.getViewState();
		if (newViewState) {
			for (const [key, value] of Object.entries(newViewState)) {
				(this.viewState as Record<string, unknown>)[key] = value; // Assign all props to the memento so they get saved
			}
		}
	}

	override shouldShowWelcome(): boolean {
		const noPersistedSessions = !this.chatService.hasSessions();
		const hasCoreAgent = this.chatAgentService.getAgents().some(agent => agent.isCore && agent.locations.includes(ChatAgentLocation.Chat));
		const hasDefaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat) !== undefined; // only false when Hide AI Features has run and unregistered the setup agents
		const shouldShow = !hasCoreAgent && (!hasDefaultAgent || !this._widget?.viewModel && noPersistedSessions);

		this.logService.trace(`ChatViewPane#shouldShowWelcome() = ${shouldShow}: hasCoreAgent=${hasCoreAgent} hasDefaultAgent=${hasDefaultAgent} || noViewModel=${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions}`);

		return !!shouldShow;
	}

	override getActionsContext(): IChatViewTitleActionContext | undefined {
		return this._widget?.viewModel ? {
			sessionResource: this._widget.viewModel.sessionResource,
			$mid: MarshalledId.ChatViewContext
		} : undefined;
	}

	override get singleViewPaneContainerTitle(): string | undefined {
		if (this.titleControl) {
			const titleControlTitle = this.titleControl.getSingleViewPaneContainerTitle();
			if (titleControlTitle) {
				return titleControlTitle;
			}
		}

		return super.singleViewPaneContainerTitle;
	}
}
