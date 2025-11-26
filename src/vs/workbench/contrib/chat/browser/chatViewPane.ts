/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewPane.css';
import { $, append, getWindow, setVisibility } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IChatViewTitleActionContext } from '../common/chatActions.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatModel, IChatModelInputState } from '../common/chatModel.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IChatModelReference, IChatService } from '../common/chatService.js';
import { IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../common/chatUri.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { showCloseActiveChatNotification } from './actions/chatCloseNotification.js';
import { openAgentSessionsView } from './agentSessions/agentSessions.js';
import { AgentSessionsControl } from './agentSessions/agentSessionsControl.js';
import { ChatWidget } from './chatWidget.js';
import { ChatViewWelcomeController, IViewWelcomeDelegate } from './viewsWelcome/chatViewWelcomeController.js';
import { AgentSessionsListDelegate } from './agentSessions/agentSessionsViewer.js';
import { Event } from '../../../../base/common/event.js';

interface IChatViewPaneState extends Partial<IChatModelInputState> {
	sessionId?: string;
	hasMigratedCurrentSession?: boolean;
}

type ChatViewPaneOpenedClassification = {
	owner: 'sbatten';
	comment: 'Event fired when the chat view pane is opened';
};

export class ChatViewPane extends ViewPane implements IViewWelcomeDelegate {

	private static readonly SESSIONS_LIMIT = 3;

	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private readonly modelRef = this._register(new MutableDisposable<IChatModelReference>());

	private readonly memento: Memento<IChatViewPaneState>;
	private readonly viewState: IChatViewPaneState;

	private sessionsContainer: HTMLElement | undefined;
	private sessionsControl: AgentSessionsControl | undefined;
	private sessionsCount: number = 0;
	private sessionsLinkContainer: HTMLElement | undefined;

	private welcomeController: ChatViewWelcomeController | undefined;

	private restoringSession: Promise<void> | undefined;

	private lastDimensions: { height: number; width: number } | undefined;

	constructor(
		private readonly chatOptions: { location: ChatAgentLocation.Chat },
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
		@ILayoutService private readonly layoutService: ILayoutService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// View state for the ViewPane is currently global per-provider basically,
		// but some other strictly per-model state will require a separate memento.
		this.memento = new Memento(`interactive-session-view-${CHAT_PROVIDER_ID}`, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);

		// Location context key
		ChatContextKeys.panelLocation.bindTo(contextKeyService).set(viewDescriptorService.getViewLocationById(options.id) ?? ViewContainerLocation.AuxiliaryBar);

		this.maybeMigrateCurrentSession();

		this.registerListeners();
	}

	private maybeMigrateCurrentSession(): void {
		if (this.chatOptions.location === ChatAgentLocation.Chat && !this.viewState.hasMigratedCurrentSession) {
			const editsMemento = new Memento<IChatViewPaneState>(`interactive-session-view-${CHAT_PROVIDER_ID}-edits`, this.storageService);
			const lastEditsState = editsMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
			if (lastEditsState.sessionId) {
				this.logService.trace(`ChatViewPane: last edits session was ${lastEditsState.sessionId}`);
				if (!this.chatService.isPersistedSessionEmpty(LocalChatSessionUri.forSession(lastEditsState.sessionId))) {
					this.logService.info(`ChatViewPane: migrating ${lastEditsState.sessionId} to unified view`);
					this.viewState.sessionId = lastEditsState.sessionId;
					// Migrate old inputValue to new inputText, and old chatMode to new mode structure
					if (lastEditsState.inputText) {
						this.viewState.inputText = lastEditsState.inputText;
					}
					if (lastEditsState.mode) {
						this.viewState.mode = lastEditsState.mode;
					} else {
						// Default to Edit mode for migrated edits sessions
						this.viewState.mode = { id: ChatModeKind.Edit, kind: ChatModeKind.Edit };
					}
					this.viewState.hasMigratedCurrentSession = true;
				}
			}
		}
	}

	private registerListeners(): void {
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			if (this.chatAgentService.getDefaultAgent(this.chatOptions?.location)) {
				if (!this._widget?.viewModel && !this.restoringSession) {
					const info = this.getTransferredOrPersistedSessionInfo();
					this.restoringSession =
						(info.sessionId ? this.chatService.getOrRestoreSession(LocalChatSessionUri.forSession(info.sessionId)) : Promise.resolve(undefined)).then(async modelRef => {
							if (!this._widget) {
								// renderBody has not been called yet
								return;
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
								await this.updateModel(modelRef);
							} finally {
								this._widget.setVisible(wasVisible);
							}
						});
					this.restoringSession.finally(() => this.restoringSession = undefined);
				}
			}

			this._onDidChangeViewWelcomeState.fire();
		}));
	}

	private getTransferredOrPersistedSessionInfo(): { sessionId?: string; inputState?: IChatModelInputState; mode?: ChatModeKind } {
		if (this.chatService.transferredSessionData?.location === this.chatOptions.location) {
			const sessionId = this.chatService.transferredSessionData.sessionId;
			return {
				sessionId,
				inputState: this.chatService.transferredSessionData.inputState,
			};
		}

		return { sessionId: this.viewState.sessionId };
	}

	override getActionsContext(): IChatViewTitleActionContext | undefined {
		return this._widget?.viewModel ? {
			sessionResource: this._widget.viewModel.sessionResource,
			$mid: MarshalledId.ChatViewContext
		} : undefined;
	}

	private async updateModel(modelRef?: IChatModelReference | undefined) {

		// Check if we're disposing a model with an active request
		if (this.modelRef.value?.object.requestInProgress.get()) {
			const closingSessionResource = this.modelRef.value.object.sessionResource;
			this.instantiationService.invokeFunction(showCloseActiveChatNotification, closingSessionResource);
		}

		this.modelRef.value = undefined;

		const ref = modelRef ?? (this.chatService.transferredSessionData?.sessionId && this.chatService.transferredSessionData?.location === this.chatOptions.location
			? await this.chatService.getOrRestoreSession(LocalChatSessionUri.forSession(this.chatService.transferredSessionData.sessionId))
			: this.chatService.startSession(this.chatOptions.location, CancellationToken.None));
		if (!ref) {
			throw new Error('Could not start chat session');
		}
		this.modelRef.value = ref;
		const model = ref.object;

		this.viewState.sessionId = model.sessionId;
		this._widget.setModel(model);

		// Update the toolbar context with new sessionId
		this.updateActions();

		return model;
	}

	override shouldShowWelcome(): boolean {
		const noPersistedSessions = !this.chatService.hasSessions();
		const hasCoreAgent = this.chatAgentService.getAgents().some(agent => agent.isCore && agent.locations.includes(this.chatOptions.location));
		const hasDefaultAgent = this.chatAgentService.getDefaultAgent(this.chatOptions.location) !== undefined; // only false when Hide AI Features has run and unregistered the setup agents
		const shouldShow = !hasCoreAgent && (!hasDefaultAgent || !this._widget?.viewModel && noPersistedSessions);

		this.logService.trace(`ChatViewPane#shouldShowWelcome(${this.chatOptions.location}) = ${shouldShow}: hasCoreAgent=${hasCoreAgent} hasDefaultAgent=${hasDefaultAgent} || noViewModel=${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions}`);

		return !!shouldShow;
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.telemetryService.publicLog2<{}, ChatViewPaneOpenedClassification>('chatViewPaneOpened');

		this.createControls(parent);

		this.applyModel();
	}

	private createControls(parent: HTMLElement): void {
		parent.classList.add('chat-viewpane');

		// Sessions Control
		this.createSessionsControl(parent);

		// Welcome Control
		this.welcomeController = this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, this.chatOptions.location));

		// Chat Widget
		this.createChatWidget(parent);

		// Sessions control visibility is impacted by chat widget empty state and welcome view
		this._register(Event.any(
			this._widget.onDidChangeEmptyState,
			Event.fromObservable(this.welcomeController.isShowingWelcome)
		)(() => {
			this.sessionsControl?.clearFocus();
			this.updateSessionsControlVisibility(true);
		}));
	}

	private createSessionsControl(parent: HTMLElement): void {
		const that = this;

		// Sessions Control
		const sessionsContainer = this.sessionsContainer = parent.appendChild($('.agent-sessions-container'));
		this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsContainer, {
			allowOpenSessionsInPanel: true,
			filter: {
				limitResults: ChatViewPane.SESSIONS_LIMIT,
				exclude(session) {
					if (session.isArchived()) {
						return true; // exclude archived sessions
					}

					return false;
				},
				notifyResults(count: number) {
					if (that.sessionsCount !== count) {
						that.sessionsCount = count;
						that.updateSessionsControlVisibility(true, true /* forced layout because count changed */);
					}
				}
			}
		}));

		// Link to Sessions View
		this.sessionsLinkContainer = append(sessionsContainer, $('.agent-sessions-link-container'));
		this._register(this.instantiationService.createInstance(Link, this.sessionsLinkContainer, { label: localize('openAgentSessionsView', "Show All Sessions"), href: '', }, {
			opener: () => this.instantiationService.invokeFunction(openAgentSessionsView)
		}));

		this.updateSessionsControlVisibility(false, true);

		this._register(this.onDidChangeBodyVisibility(() => this.updateSessionsControlVisibility(true)));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EmptyChatViewSessionsEnabled)) {
				this.updateSessionsControlVisibility(true);
			}
		}));
	}

	private updateSessionsControlVisibility(fromEvent: boolean, force?: boolean): void {
		if (!this.sessionsContainer || !this.sessionsControl) {
			return;
		}

		const sessionsControlVisible =
			this.configurationService.getValue<boolean>(ChatConfiguration.EmptyChatViewSessionsEnabled) &&	// enabled in settings
			this.isBodyVisible() &&																			// view expanded
			(!this._widget || this._widget?.isEmpty()) &&													// chat widget empty
			!this.welcomeController?.isShowingWelcome.get() &&												// welcome not showing
			this.sessionsCount > 0;																			// has sessions

		if (!force && sessionsControlVisible === this.sessionsControl.isVisible()) {
			return; // no change and not enforced
		}

		setVisibility(sessionsControlVisible, this.sessionsContainer);
		this.sessionsControl.setVisible(sessionsControlVisible);

		if (fromEvent && this.lastDimensions) {
			this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
		}
	}

	private createChatWidget(parent: HTMLElement): void {
		const locationBasedColors = this.getLocationBasedColors();

		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(parent)).appendChild($('.chat-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			this.chatOptions.location,
			{ viewId: this.id },
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: this.chatOptions.location === ChatAgentLocation.Chat,
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
				enableImplicitContext: this.chatOptions.location === ChatAgentLocation.Chat,
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
		this._widget.render(parent);

		const updateWidgetVisibility = (reader?: IReader) => this._widget.setVisible(this.isBodyVisible() && !this.welcomeController?.isShowingWelcome.read(reader));
		this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
		this._register(autorun(reader => updateWidgetVisibility(reader)));
	}

	private async applyModel(): Promise<void> {
		const info = this.getTransferredOrPersistedSessionInfo();
		const modelRef = info.sessionId ? await this.chatService.getOrRestoreSession(LocalChatSessionUri.forSession(info.sessionId)) : undefined;
		if (modelRef && info.inputState) {
			modelRef.object.inputModel.setState(info.inputState);
		}

		await this.updateModel(modelRef);
	}

	private async clear(): Promise<void> {

		// Grab the widget's latest view state because it will be loaded back into the widget
		this.updateViewState();
		await this.updateModel(undefined);

		// Update the toolbar context with new sessionId
		this.updateActions();
	}

	async loadSession(sessionId: URI): Promise<IChatModel | undefined> {

		// Handle locking for contributed chat sessions
		// TODO: Is this logic still correct with sessions from different schemes?
		const local = LocalChatSessionUri.parseLocalSessionId(sessionId);
		if (local) {
			await this.chatSessionsService.canResolveChatSession(sessionId);
			const contributions = this.chatSessionsService.getAllChatSessionContributions();
			const contribution = contributions.find((c: IChatSessionsExtensionPoint) => c.type === localChatSessionType);
			if (contribution) {
				this._widget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
			}
		}

		const newModelRef = await this.chatService.loadSessionForResource(sessionId, ChatAgentLocation.Chat, CancellationToken.None);
		return this.updateModel(newModelRef);
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	override focus(): void {
		super.focus();

		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.lastDimensions = { height, width };

		let remainingHeight = height;

		// Sessions Control (grows witht the number of items displayed)
		this.sessionsControl?.layout(this.sessionsCount * AgentSessionsListDelegate.ITEM_HEIGHT, width);
		const sessionsContainerHeight = this.sessionsContainer?.offsetHeight ?? 0;
		remainingHeight -= sessionsContainerHeight;

		// Chat Widget
		this._widget.layout(remainingHeight, width);
	}

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
}
