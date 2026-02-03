/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentSessionsWelcome.css';
import { $, addDisposableListener, append, clearNode, Dimension, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { getListStyles, getToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../chat/common/constants.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../chat/browser/agentSessions/agentSessions.js';
import { IAgentSession } from '../../chat/browser/agentSessions/agentSessionsModel.js';
import { AgentSessionsWelcomeEditorOptions, AgentSessionsWelcomeInput, AgentSessionsWelcomeWorkspaceKind } from './agentSessionsWelcomeInput.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IChatModel } from '../../chat/common/model/chatModel.js';
import { ChatViewId, IChatWidgetService, ISessionTypePickerDelegate, IWorkspacePickerDelegate, IWorkspacePickerItem } from '../../chat/browser/chat.js';
import { ChatSessionPosition, getResourceForNewChatSession } from '../../chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { AgentSessionsControl, IAgentSessionsControlOptions } from '../../chat/browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter } from '../../chat/browser/agentSessions/agentSessionsFilter.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IResolvedWalkthrough, IWalkthroughsService } from '../../welcomeGettingStarted/browser/gettingStartedService.js';
import { GettingStartedEditorOptions, GettingStartedInput } from '../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspacesService, IRecentFolder, IRecentWorkspace, isRecentFolder, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const configurationKey = 'workbench.startupEditor';
const MAX_SESSIONS = 6;
const MAX_REPO_PICKS = 10;
const MAX_WALKTHROUGHS = 10;

/**
 * - visibleDurationMs: Do they close it right away or leave it open (#3)
 * - closedBy: Track what action caused the close (viewAllSessions, chatSubmission, sessionClicked, etc.) (#5)
 */
type AgentSessionsWelcomeClosedClassification = {
	visibleDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the welcome page was visible in milliseconds.' };
	closedBy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What action caused the welcome page to close.' };
	owner: 'osortega';
	comment: 'Tracks when the agent sessions welcome page is closed to understand engagement.';
};

type AgentSessionsWelcomeClosedEvent = {
	visibleDurationMs: number;
	closedBy: string;
};

/**
 * - mode/provider/workspaceKind: Track agent type, session provider, and workspace state (#4)
 * - selectedRecentWorkspace: Do users select a recent workspace before submitting chat (#8)
 */
type AgentSessionsWelcomeChatSubmittedClassification = {
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat mode used (ask, agent, edit).' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session provider (local, cloud).' };
	workspaceKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of workspace - empty, folder, or workspace.' };
	selectedRecentWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a recent workspace was selected before submitting.' };
	owner: 'osortega';
	comment: 'Tracks chat submissions from the welcome page to understand session creation patterns.';
};

type AgentSessionsWelcomeChatSubmittedEvent = {
	mode: string;
	provider: string;
	workspaceKind: AgentSessionsWelcomeWorkspaceKind;
	selectedRecentWorkspace: boolean;
};

type AgentSessionsWelcomeActionClassification = {
	action: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The action being executed on the agent sessions welcome page.' };
	actionId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Identifier of the action being executed, such as command ID or walkthrough ID.' };
	welcomeKind: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The kind of welcome page' };
	owner: 'osortega';
	comment: 'Help understand what actions are most commonly taken on the agent sessions welcome page';
};

type AgentSessionsWelcomeActionEvent = {
	action: string;
	welcomeKind: 'agentSessionsWelcomePage';
	actionId: string | undefined;
};

export class AgentSessionsWelcomePage extends EditorPane {

	static readonly ID = 'agentSessionsWelcomePage';
	static readonly COMMAND_ID = 'workbench.action.openAgentSessionsWelcome';

	private container!: HTMLElement;
	private contentContainer!: HTMLElement;
	private scrollableElement: DomScrollableElement | undefined;
	private chatWidget: ChatWidget | undefined;
	private chatModelRef: IReference<IChatModel> | undefined;
	private sessionsControl: AgentSessionsControl | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	private sessionsLoadingContainer: HTMLElement | undefined;
	private readonly sessionsControlDisposables = this._register(new DisposableStore());
	private readonly contentDisposables = this._register(new DisposableStore());
	private contextService: IContextKeyService;
	private walkthroughs: IResolvedWalkthrough[] = [];
	private _selectedSessionProvider: AgentSessionProviders = AgentSessionProviders.Local;
	private _selectedWorkspace: IWorkspacePickerItem | undefined;
	private _recentTrustedWorkspaces: Array<IRecentWorkspace | IRecentFolder> = [];
	private _isEmptyWorkspace: boolean = false;
	private _workspaceKind: AgentSessionsWelcomeWorkspaceKind = 'empty';

	// Telemetry tracking
	private _openedAt: number = 0;
	private _closedBy?: string;
	private _storedInput: AgentSessionsWelcomeInput | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IWalkthroughsService private readonly walkthroughsService: IWalkthroughsService,
		@IChatService private readonly chatService: IChatService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ILogService private readonly logService: ILogService,
	) {
		super(AgentSessionsWelcomePage.ID, group, telemetryService, themeService, storageService);

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

	protected createEditor(parent: HTMLElement): void {
		parent.appendChild(this.container);

		// Create scrollable content
		this.contentContainer = $('.agentSessionsWelcome-content');
		this.scrollableElement = this._register(new DomScrollableElement(this.contentContainer, {
			className: 'agentSessionsWelcome-scrollable',
			vertical: ScrollbarVisibility.Auto
		}));
		this.container.appendChild(this.scrollableElement.getDomNode());
	}

	override async setInput(input: AgentSessionsWelcomeInput, options: AgentSessionsWelcomeEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this._storedInput = input;
		this._openedAt = Date.now();
		await super.setInput(input, options, context, token);
		this._workspaceKind = input.workspaceKind ?? 'empty';
		await this.buildContent();
	}

	override clearInput(): void {
		// Send closed telemetry when the editor is closed
		if (this._openedAt > 0) {
			const visibleDurationMs = Date.now() - this._openedAt;
			this.telemetryService.publicLog2<AgentSessionsWelcomeClosedEvent, AgentSessionsWelcomeClosedClassification>(
				'agentSessionsWelcome.closed',
				{
					visibleDurationMs,
					closedBy: this._closedBy ?? 'disposed'
				}
			);
			this._openedAt = 0;
			this._closedBy = undefined;
		}
		super.clearInput();
	}

	private async buildContent(): Promise<void> {
		this.contentDisposables.clear();
		this.sessionsControlDisposables.clear();
		this.sessionsControl = undefined;
		clearNode(this.contentContainer);

		// Detect empty workspace and fetch recent workspaces
		this._isEmptyWorkspace = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
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

	private async buildStartEntries(container: HTMLElement): Promise<void> {
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
				this.telemetryService.publicLog2<AgentSessionsWelcomeActionEvent, AgentSessionsWelcomeActionClassification>(
					'gettingStarted.ActionExecuted',
					{ welcomeKind: 'agentSessionsWelcomePage', action: 'executeCommand', actionId: entry.command }
				);
				this.commandService.executeCommand(entry.command);
			};
		}
	}

	private buildChatWidget(container: HTMLElement): void {
		const chatWidgetContainer = append(container, $('.agentSessionsWelcome-chatWidget'));

		// Create editor overflow widgets container
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatWidgetContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
		this.contentDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		// Create ChatWidget with scoped services
		const scopedContextKeyService = this.contentDisposables.add(this.contextService.createScoped(chatWidgetContainer));
		const scopedInstantiationService = this.contentDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		// Create a delegate for the session target picker with independent local state
		const onDidChangeActiveSessionProvider = this.contentDisposables.add(new Emitter<AgentSessionProviders>());
		const recreateSessionForProvider = async (provider: AgentSessionProviders) => {
			if (this.chatWidget && this.chatModelRef) {
				this.chatWidget.setModel(undefined);
				this.chatModelRef.dispose();
				const newResource = getResourceForNewChatSession({
					type: provider,
					position: ChatSessionPosition.Sidebar,
					displayName: ''
				});
				const ref = await this.chatService.loadSessionForResource(newResource, ChatAgentLocation.Chat, CancellationToken.None);
				this.chatModelRef = ref ?? this.chatService.startSession(ChatAgentLocation.Chat);
				this.contentDisposables.add(this.chatModelRef);
				if (this.chatModelRef.object) {
					this.chatWidget.setModel(this.chatModelRef.object);
				}
			}
		};
		const sessionTypePickerDelegate: ISessionTypePickerDelegate = {
			getActiveSessionProvider: () => this._selectedSessionProvider,
			setActiveSessionProvider: (provider: AgentSessionProviders) => {
				this._selectedSessionProvider = provider;
				onDidChangeActiveSessionProvider.fire(provider);
				try {
					recreateSessionForProvider(provider);
				} catch { /* Ignore errors */ }
			},
			onDidChangeActiveSessionProvider: onDidChangeActiveSessionProvider.event
		};

		// Create workspace picker delegate for empty workspace scenarios
		const onDidChangeSelectedWorkspace = this.contentDisposables.add(new Emitter<IWorkspacePickerItem | undefined>());
		const onDidChangeWorkspaces = this.contentDisposables.add(new Emitter<void>());
		const workspacePickerDelegate: IWorkspacePickerDelegate | undefined = this._isEmptyWorkspace ? {
			getWorkspaces: () => this._recentTrustedWorkspaces.map(w => ({
				uri: this.getWorkspaceUri(w),
				label: this.getWorkspaceLabel(w),
				isFolder: isRecentFolder(w),
			})),
			getSelectedWorkspace: () => this._selectedWorkspace,
			setSelectedWorkspace: (workspace: IWorkspacePickerItem | undefined) => {
				this._selectedWorkspace = workspace;
				onDidChangeSelectedWorkspace.fire(workspace);
			},
			onDidChangeSelectedWorkspace: onDidChangeSelectedWorkspace.event,
			onDidChangeWorkspaces: onDidChangeWorkspaces.event,
			openFolderCommand: 'workbench.action.files.openFolder',
		} : undefined;

		this.chatWidget = this.contentDisposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
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
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: editorBackground,
				overlayBackground: editorBackground,
				inputEditorBackground: editorBackground,
				resultEditorBackground: editorBackground,
			}
		));

		this.chatWidget.render(chatWidgetContainer);
		this.chatWidget.setVisible(true);

		// Schedule initial layout at next animation frame to ensure proper input sizing
		this.contentDisposables.add(scheduleAtNextAnimationFrame(getWindow(chatWidgetContainer), () => {
			this.layoutChatWidget();
		}));

		// Start a chat session so the widget has a viewModel
		// This is necessary for actions like mode switching to work properly
		this.chatModelRef = this.chatService.startSession(ChatAgentLocation.Chat);
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
				this.telemetryService.publicLog2<AgentSessionsWelcomeChatSubmittedEvent, AgentSessionsWelcomeChatSubmittedClassification>(
					'agentSessionsWelcome.chatSubmitted',
					{
						mode,
						provider: this._selectedSessionProvider,
						workspaceKind: this._workspaceKind,
						selectedRecentWorkspace: this._selectedWorkspace !== undefined
					}
				);

				this._closedBy = 'chatSubmission';
				this.openSessionInChat(chatSessionResource);
			}
		}));

		// Check for prefill data from a workspace transfer
		this.applyPrefillData();
	}

	private getWorkspaceLabel(workspace: IRecentWorkspace | IRecentFolder): string {
		if (isRecentFolder(workspace)) {
			return workspace.label || basename(workspace.folderUri);
		} else if (isRecentWorkspace(workspace)) {
			return workspace.label || basename(workspace.workspace.configPath);
		}
		return '';
	}

	private getWorkspaceUri(workspace: IRecentWorkspace | IRecentFolder): URI {
		if (isRecentFolder(workspace)) {
			return workspace.folderUri;
		} else if (isRecentWorkspace(workspace)) {
			return workspace.workspace.configPath;
		}
		throw new Error('Invalid workspace type');
	}

	private async handleWorkspaceSubmission(query: string, mode: ChatModeKind): Promise<boolean> {
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
		this.storageService.store(
			'chat.welcomeViewPrefill',
			JSON.stringify(prefillData),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);

		// Find the workspace to determine if it's a folder or workspace file
		const workspace = this._recentTrustedWorkspaces.find(w =>
			this.getWorkspaceUri(w).toString() === this._selectedWorkspace?.uri.toString());

		if (workspace) {
			try {
				if (isRecentFolder(workspace)) {
					await this.hostService.openWindow([{ folderUri: workspace.folderUri }]);
				} else if (isRecentWorkspace(workspace)) {
					await this.hostService.openWindow([{ workspaceUri: workspace.workspace.configPath }]);
				}
				return true;
			} catch (e) {
				// Ignore errors
			}
		}
		this.storageService.remove('chat.welcomeViewPrefill', StorageScope.APPLICATION);
		return false;
	}

	/**
	 * Reads and applies prefill data from storage (used when transferring chat input from another workspace).
	 * This is called after the chat widget is created to populate it with any pending prefill data.
	 */
	private applyPrefillData(): void {
		const prefillData = this.storageService.get('chat.welcomeViewPrefill', StorageScope.APPLICATION);
		if (prefillData) {
			// Remove immediately to prevent re-application
			this.storageService.remove('chat.welcomeViewPrefill', StorageScope.APPLICATION);
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
			} catch {
				// Ignore malformed prefill data
			}
		}
	}

	private buildSessionsOrPrompts(container: HTMLElement): void {
		// Clear previous sessions control
		this.sessionsControlDisposables.clear();
		this.sessionsControl = undefined;
		this.sessionsLoadingContainer = undefined;

		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());

		if (sessions.length > 0) {
			this.buildSessionsGrid(container, sessions);
		} else {
			this.buildWalkthroughs(container);
		}
	}

	private buildLoadingSkeleton(container: HTMLElement): HTMLElement {
		const loadingContainer = append(container, $('.agentSessionsWelcome-sessionsLoading', {
			'role': 'status',
			'aria-busy': 'true',
			'aria-label': localize('loadingSessions', "Loading sessions...")
		}));

		// Create skeleton items to match MAX_SESSIONS (6 items, arranged in 2 columns)
		for (let i = 0; i < MAX_SESSIONS; i++) {
			const skeleton = append(loadingContainer, $('.agentSessionsWelcome-sessionSkeleton', { 'aria-hidden': 'true' }));
			append(skeleton, $('.agentSessionsWelcome-sessionSkeleton-icon'));
			const content = append(skeleton, $('.agentSessionsWelcome-sessionSkeleton-content'));
			append(content, $('.agentSessionsWelcome-sessionSkeleton-title'));
			append(content, $('.agentSessionsWelcome-sessionSkeleton-description'));
		}

		return loadingContainer;
	}

	private hideLoadingSkeleton(): void {
		// Hide loading skeleton and show the sessions control
		if (this.sessionsLoadingContainer) {
			this.sessionsLoadingContainer.style.display = 'none';
		}
		if (this.sessionsControlContainer) {
			this.sessionsControlContainer.style.display = '';
			this.layoutSessionsControl();
		}
	}


	private buildSessionsGrid(container: HTMLElement, _sessions: IAgentSession[]): void {
		// Show loading skeleton initially
		this.sessionsLoadingContainer = this.buildLoadingSkeleton(container);

		this.sessionsControlContainer = append(container, $('.agentSessionsWelcome-sessionsGrid'));
		// Hide the control initially until loading completes
		this.sessionsControlContainer.style.display = 'none';

		const options: IAgentSessionsControlOptions = {
			overrideStyles: getListStyles({
				listBackground: editorBackground,
			}),
			filter: this.sessionsControlDisposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {
				limitResults: () => MAX_SESSIONS,
			})),
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
			source: 'welcomeView',
			notifySessionOpened: () => {
				const isProjectionEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled);
				if (!isProjectionEnabled) {
					this._closedBy = 'sessionClicked';
					this.revealMaximizedChat();
				}
			}
		};

		this.sessionsControl = this.sessionsControlDisposables.add(this.instantiationService.createInstance(
			AgentSessionsControl,
			this.sessionsControlContainer,
			options
		));

		// Listen for loading state changes to toggle skeleton visibility
		this.sessionsControlDisposables.add(this.agentSessionsService.model.onDidResolve(() => {
			this.hideLoadingSkeleton();
		}));

		if (this.agentSessionsService.model.resolved) {
			this.hideLoadingSkeleton();
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

	private buildWalkthroughs(container: HTMLElement): void {
		const activeWalkthroughs = this.walkthroughs.filter(w =>
			!w.when || this.contextService.contextMatchesRules(w.when)
		).slice(0, MAX_WALKTHROUGHS);

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
		const prevButton = append(navContainer, $('button.nav-button')) as HTMLButtonElement;
		prevButton.appendChild(renderIcon(Codicon.chevronLeft));
		prevButton.title = localize('previousWalkthrough', "Previous");

		const nextButton = append(navContainer, $('button.nav-button')) as HTMLButtonElement;
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
			this.telemetryService.publicLog2<AgentSessionsWelcomeActionEvent, AgentSessionsWelcomeActionClassification>(
				'gettingStarted.ActionExecuted',
				{ welcomeKind: 'agentSessionsWelcomePage', action: 'openWalkthrough', actionId: walkthrough.id }
			);
			// Open walkthrough with returnToCommand so back button returns to agent sessions welcome
			const options: GettingStartedEditorOptions = {
				selectedCategory: walkthrough.id,
				returnToCommand: AgentSessionsWelcomePage.COMMAND_ID,
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

	private static readonly PRIVACY_NOTICE_DISMISSED_KEY = 'agentSessionsWelcome.privacyNoticeDismissed';

	private buildPrivacyNotice(container: HTMLElement): void {
		// TOS/Privacy notice for users who are not signed in - reusing walkthrough card design
		if (!this.chatEntitlementService.anonymous) {
			return;
		}

		// Check if user has dismissed the notice
		if (this.storageService.getBoolean(AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		const providers = this.productService.defaultChatAgent?.provider;
		if (!providers || !providers.default || !this.productService.defaultChatAgent?.termsStatementUrl || !this.productService.defaultChatAgent?.privacyStatementUrl) {
			return;
		}

		const tosCard = append(container, $('.agentSessionsWelcome-walkthroughCard.agentSessionsWelcome-tosCard'));

		const dismissNotice = () => {
			this.storageService.store(AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
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
		title.textContent = localize('tosTitle', "Your GitHub Copilot trial is active");

		const desc = append(content, $('.agentSessionsWelcome-walkthroughCard-description'));
		const descriptionMarkdown = new MarkdownString(
			localize(
				{ key: 'tosDescription', comment: ['{Locked="]({1})"}', '{Locked="]({2})"}'] },
				"By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).",
				providers.default.name,
				this.productService.defaultChatAgent.termsStatementUrl,
				this.productService.defaultChatAgent.privacyStatementUrl
			),
			{ isTrusted: true }
		);
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

	private buildFooter(container: HTMLElement): void {
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
			} else {
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

	private lastDimension: Dimension | undefined;

	override layout(dimension: Dimension): void {
		this.lastDimension = dimension;
		this.container.style.height = `${dimension.height}px`;
		this.container.style.width = `${dimension.width}px`;

		// Layout chat widget
		this.layoutChatWidget();

		// Layout sessions control
		this.layoutSessionsControl();

		this.scrollableElement?.scanDomNode();
	}

	private layoutChatWidget(): void {
		if (!this.chatWidget || !this.lastDimension) {
			return;
		}

		const chatWidth = Math.min(800, this.lastDimension.width - 80);
		// Use a reasonable height for the input part - the CSS will hide the list area
		const inputHeight = 150;
		this.chatWidget.layout(inputHeight, chatWidth);
	}

	private layoutSessionsControl(): void {
		if (!this.sessionsControl || !this.sessionsControlContainer || !this.lastDimension) {
			return;
		}

		// TODO: @osortega this is a weird way of doing this, maybe we handle the 2-colum layout in the control itself?
		const sessionsWidth = Math.min(800, this.lastDimension.width - 80);
		// Calculate height based on actual visible sessions (capped at MAX_SESSIONS)
		// Use 52px per item from AgentSessionsListDelegate.ITEM_HEIGHT
		// Give the list FULL height so virtualization renders all items
		// CSS transforms handle the 2-column visual layout
		const visibleSessions = Math.min(
			this.agentSessionsService.model.sessions.filter(s => !s.isArchived()).length,
			MAX_SESSIONS
		);
		const sessionsHeight = visibleSessions * 52;
		this.sessionsControl.layout(sessionsHeight, sessionsWidth);

		// Set margin offset for 2-column layout: actual height - visual height
		// Visual height = ceil(n/2) * 52, so offset = floor(n/2) * 52
		const marginOffset = Math.floor(visibleSessions / 2) * 52;
		this.sessionsControl.element!.style.marginBottom = `-${marginOffset}px`;
	}

	override focus(): void {
		super.focus();
		this.chatWidget?.focusInput();
	}

	private async revealMaximizedChat(): Promise<void> {
		try {
			await this.closeEditorAndMaximizeAuxiliaryBar();
		} catch (error) {
			this.logService.error('Failed to open maximized chat: {0}', toErrorMessage(error));
		}
	}

	private async openSessionInChat(sessionResource: URI): Promise<void> {
		try {
			await this.closeEditorAndMaximizeAuxiliaryBar(sessionResource);
		} catch (error) {
			this.logService.error('Failed to open agent session: {0}', toErrorMessage(error));
		}
	}

	private async closeEditorAndMaximizeAuxiliaryBar(sessionResource?: URI): Promise<void> {
		const editorToClose = this.input || this._storedInput;

		if (editorToClose && this.group.contains(editorToClose)) {
			// Wait until the active editor changed so that the chat doesn't toggle back
			await new Promise<void>(resolve => {
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
		} else {
			await this.commandService.executeCommand('workbench.action.chat.open');
		}
		const chatViewLocation = this.viewDescriptorService.getViewLocationById(ChatViewId);
		if (chatViewLocation === ViewContainerLocation.AuxiliaryBar) {
			this.layoutService.setAuxiliaryBarMaximized(true);
		}
	}

	private async getRecentlyOpenedWorkspaces(onlyTrusted: boolean = false): Promise<Array<IRecentWorkspace | IRecentFolder>> {
		const workspaces = await this.workspacesService.getRecentlyOpened();
		const trustInfoPromises = workspaces.workspaces.map(async ws => {
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
}

export class AgentSessionsWelcomeInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: AgentSessionsWelcomeInput): boolean {
		return true;
	}

	serialize(editorInput: AgentSessionsWelcomeInput): string {
		return JSON.stringify({});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): AgentSessionsWelcomeInput {
		return new AgentSessionsWelcomeInput({});
	}
}
